import { checkedShader, texture } from "./device";
import spatialWGSL from "./shaders/spatial.wgsl?raw";
import resampleWGSL from "./shaders/resample.wgsl?raw";
import presentWGSL from "./shaders/present.wgsl?raw";
import fsrcWGSL from "../vendor/FSRCNNX_x2_16-0-4-1.wgsl?raw";
import fsrcManifest from "../vendor/FSRCNNX_x2_16-0-4-1.passes.json";
import { CNNx2M } from "../vendor/anime4k/pipelines/upscale/CNNx2M";
import { CNNx2VL } from "../vendor/anime4k/pipelines/upscale/CNNx2VL";
import { CNNSoftM } from "../vendor/anime4k/pipelines/restore/CNNSoftM";
import type { Anime4KPipeline } from "../vendor/anime4k/pipelines/interfaces";
import type { Settings } from "../shared/settings";

export interface UpscalingEngine {
  encode(encoder: GPUCommandEncoder): GPUTexture;
  destroy(): void;
}
class AnimeEngine implements UpscalingEngine {
  private stages: Anime4KPipeline[] = [];
  constructor(
    device: GPUDevice,
    input: GPUTexture,
    upscale: boolean,
    quality: Settings["quality"],
  ) {
    // Fixed trained convolution weights; these are genuine Anime4K neural passes.
    let current = input;
    if (quality !== "fast" || !upscale) {
      const restore = new CNNSoftM({ device, inputTexture: current });
      this.stages.push(restore);
      current = restore.getOutputTexture();
    }
    if (upscale)
      this.stages.push(
        new (quality === "quality" ? CNNx2VL : CNNx2M)({
          device,
          inputTexture: current,
        }),
      );
  }
  encode(encoder: GPUCommandEncoder) {
    this.stages.forEach((s) => s.pass(encoder));
    return this.stages.at(-1)!.getOutputTexture();
  }
  destroy() {
    const textures = new Set<GPUTexture>();
    const visit = (
      stage: Anime4KPipeline & { pipelines?: Anime4KPipeline[] },
    ) => {
      textures.add(stage.getOutputTexture());
      stage.pipelines?.forEach(visit);
    };
    this.stages.forEach(visit);
    textures.forEach((t) => t.destroy());
    this.stages = [];
  }
}
const lumaShader = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var out: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3u) {
 if(any(id.xy >= textureDimensions(out))) {return;}
 let c=textureLoad(src,vec2i(id.xy),0).rgb;
 textureStore(out,vec2i(id.xy),vec4f(dot(c,vec3f(0.2126,0.7152,0.0722)),0,0,1));
}`;
const chromaShader = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var luma: texture_2d<f32>;
@group(0) @binding(2) var out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var samp: sampler;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3u) {
 let d=textureDimensions(out); if(any(id.xy>=d)) {return;}
 let uv=(vec2f(id.xy)+0.5)/vec2f(d);
 let c=textureSampleLevel(src,samp,uv,0).rgb;
 let old=dot(c,vec3f(0.2126,0.7152,0.0722));
 let y=textureLoad(luma,vec2i(id.xy),0).r;
 textureStore(out,vec2i(id.xy),vec4f(clamp(c+vec3f(y-old),vec3f(0),vec3f(1)),1));
}`;
class FsrcEngine implements UpscalingEngine {
  private owned: GPUTexture[] = [];
  private steps: {
    pipeline: GPUComputePipeline;
    group: GPUBindGroup;
    width: number;
    height: number;
  }[] = [];
  private output!: GPUTexture;
  static async create(
    device: GPUDevice,
    input: GPUTexture,
  ): Promise<FsrcEngine> {
    const engine = new FsrcEngine();
    try {
      const make = (
        w: number,
        h: number,
        name: string,
        format: GPUTextureFormat = "rgba16float",
      ) => {
        const t = texture(device, w, h, name, format);
        engine.owned.push(t);
        return t;
      };
      const add = async (
        code: string,
        entries: GPUBindGroupEntry[],
        w: number,
        h: number,
        label: string,
      ) => {
        const module = await checkedShader(device, code, label);
        const pipeline = await device.createComputePipelineAsync({
          label,
          layout: "auto",
          compute: { module, entryPoint: "main" },
        });
        engine.steps.push({
          pipeline,
          group: device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries,
          }),
          width: w,
          height: h,
        });
      };
      const luma = make(input.width, input.height, "FSRCNNX luma");
      await add(
        lumaShader,
        [
          { binding: 0, resource: input.createView() },
          { binding: 1, resource: luma.createView() },
        ],
        input.width,
        input.height,
        "FSRCNNX RGB to luma",
      );
      const sections = fsrcWGSL.split(/\/\/==== ENTRY pass\d+[^\n]*\n/);
      const header = sections.shift()!;
      const resources = new Map<string, GPUTexture>([["LUMA", luma]]);
      let final = luma;
      for (const [i, pass] of fsrcManifest.passes.entries()) {
        const w = input.width * pass.widthMul,
          h = input.height * pass.heightMul;
        const inputs = pass.binds.map((name) => resources.get(name)!);
        const saves = "saves" in pass ? pass.saves : [pass.save ?? "OUTPUT"];
        const outputs = saves!.map((name) => {
          const t = make(w, h, `FSRCNNX ${name}`);
          resources.set(name!, t);
          return t;
        });
        const entries = [...inputs, ...outputs].map((t, binding) => ({
          binding,
          resource: t.createView(),
        }));
        await add(header + sections[i], entries, w, h, `FSRCNNX pass ${i}`);
        final = outputs[0];
      }
      engine.output = make(
        final.width,
        final.height,
        "FSRCNNX RGB",
        "rgba8unorm",
      );
      await add(
        chromaShader,
        [
          { binding: 0, resource: input.createView() },
          { binding: 1, resource: final.createView() },
          { binding: 2, resource: engine.output.createView() },
          {
            binding: 3,
            resource: device.createSampler({
              magFilter: "linear",
              minFilter: "linear",
            }),
          },
        ],
        final.width,
        final.height,
        "FSRCNNX chroma recombination",
      );
      return engine;
    } catch (e) {
      engine.destroy();
      throw e;
    }
  }
  encode(encoder: GPUCommandEncoder) {
    for (const step of this.steps) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(step.pipeline);
      pass.setBindGroup(0, step.group);
      pass.dispatchWorkgroups(
        Math.ceil(step.width / 8),
        Math.ceil(step.height / 8),
      );
      pass.end();
    }
    return this.output;
  }
  destroy() {
    this.owned.forEach((t) => t.destroy());
    this.owned = [];
    this.steps = [];
  }
}

export class Enhancement {
  readonly work: GPUTexture;
  private spatial: GPUTexture;
  private neural?: UpscalingEngine;
  private params: GPUBuffer;
  private comparison: GPUBuffer;
  private sampler: GPUSampler;
  private spatialPipeline!: GPUComputePipeline;
  private spatialGroup!: GPUBindGroup;
  private resamplePipeline!: GPUComputePipeline;
  private presentPipeline!: GPURenderPipeline;
  private resampleGroups = new Map<GPUTexture, GPUBindGroup>();
  private presentGroups = new Map<GPUTexture, GPUBindGroup>();
  constructor(
    private device: GPUDevice,
    width: number,
    height: number,
    private settings: Settings,
  ) {
    this.work = texture(device, width, height, "WebScaly working frame");
    this.spatial = texture(device, width, height, "WebScaly spatial output");
    this.params = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.comparison = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }
  async initialize(format: GPUTextureFormat, upscale: boolean) {
    const [spatial, resample, present] = await Promise.all([
      checkedShader(this.device, spatialWGSL, "Spatial detail"),
      checkedShader(this.device, resampleWGSL, "Resample"),
      checkedShader(this.device, presentWGSL, "Presentation"),
    ]);
    this.spatialPipeline = await this.device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: spatial, entryPoint: "main" },
    });
    this.resamplePipeline = await this.device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: resample, entryPoint: "main" },
    });
    this.presentPipeline = await this.device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: present, entryPoint: "vert" },
      fragment: { module: present, entryPoint: "frag", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.spatialGroup = this.device.createBindGroup({
      layout: this.spatialPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.work.createView() },
        { binding: 1, resource: this.spatial.createView() },
        { binding: 2, resource: { buffer: this.params } },
      ],
    });
    if (this.settings.algorithm === "anime4k") {
      this.device.pushErrorScope("validation");
      try {
        this.neural = new AnimeEngine(
          this.device,
          this.work,
          upscale,
          this.settings.quality,
        );
      } finally {
        const error = await this.device.popErrorScope();
        if (error) throw new Error(error.message);
      }
    }
    if (this.settings.algorithm === "fsrcnnx")
      this.neural = await FsrcEngine.create(this.device, this.work);
    this.update(this.settings);
  }
  update(s: Settings) {
    this.settings = s;
    this.device.queue.writeBuffer(
      this.params,
      0,
      new Float32Array([s.strength, s.denoise, 0, 0]),
    );
    this.device.queue.writeBuffer(
      this.comparison,
      0,
      new Float32Array([s.split, s.comparison ? 1 : 0, 0, 0]),
    );
  }
  encode(encoder: GPUCommandEncoder, source: GPUTexture, target: GPUTexture) {
    if (source !== this.work) {
      let group = this.resampleGroups.get(source);
      if (!group) {
        group = this.device.createBindGroup({
          layout: this.resamplePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: source.createView() },
            { binding: 1, resource: this.work.createView() },
            { binding: 2, resource: this.sampler },
          ],
        });
        this.resampleGroups.set(source, group);
      }
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.resamplePipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(
        Math.ceil(this.work.width / 8),
        Math.ceil(this.work.height / 8),
      );
      pass.end();
    }
    let enhanced = this.spatial;
    if (this.neural) enhanced = this.neural.encode(encoder);
    else {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.spatialPipeline);
      pass.setBindGroup(0, this.spatialGroup);
      pass.dispatchWorkgroups(
        Math.ceil(this.work.width / 8),
        Math.ceil(this.work.height / 8),
      );
      pass.end();
    }
    // Both comparison halves sample the same decoded source frame.
    let group = this.presentGroups.get(source);
    if (!group) {
      group = this.device.createBindGroup({
        layout: this.presentPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: enhanced.createView() },
          { binding: 1, resource: source.createView() },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: { buffer: this.comparison } },
        ],
      });
      this.presentGroups.set(source, group);
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    pass.setPipeline(this.presentPipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }
  destroy() {
    this.neural?.destroy();
    this.work.destroy();
    this.spatial.destroy();
    this.params.destroy();
    this.comparison.destroy();
    this.resampleGroups.clear();
    this.presentGroups.clear();
  }
}
