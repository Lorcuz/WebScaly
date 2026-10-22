import { checkedShader, texture } from "./device";
import prefilterWGSL from "./shaders/prefilter.wgsl?raw";
import scaleWGSL from "./shaders/scale.wgsl?raw";
import presentWGSL from "./shaders/present.wgsl?raw";
import hintWGSL from "./shaders/hint.wgsl?raw";
import fsrcWGSL from "../vendor/FSRCNNX_x2_16-0-4-1.wgsl?raw";
import fsrcManifest from "../vendor/FSRCNNX_x2_16-0-4-1.passes.json";
import { CNNx2M } from "../vendor/anime4k/pipelines/upscale/CNNx2M";
import { CNNx2VL } from "../vendor/anime4k/pipelines/upscale/CNNx2VL";
import { CNNSoftM } from "../vendor/anime4k/pipelines/restore/CNNSoftM";
import type { Anime4KPipeline } from "../vendor/anime4k/pipelines/interfaces";
import type { Settings } from "../shared/settings-core";

export interface UpscalingEngine {
  readonly output: GPUTexture;
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
  get output() {
    return this.stages.at(-1)!.getOutputTexture();
  }
  encode(encoder: GPUCommandEncoder) {
    this.stages.forEach((s) => s.pass(encoder));
    return this.output;
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
  output!: GPUTexture;
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

const SCALE_MODES: Record<Settings["quality"], number> = {
  fast: 0,
  balanced: 1,
  quality: 2,
};
export const HINT_SIZE = [96, 54] as const;
const HINT_ROW = 512; // 96 pixels × 4 bytes, padded to the required 256-byte row alignment.
function dispatch(
  encoder: GPUCommandEncoder,
  pipeline: GPUComputePipeline,
  group: GPUBindGroup,
  width: number,
  height: number,
) {
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  pass.end();
}

/**
 * Per-frame pipeline: captured frame (work) → prefilter (denoise, deband) →
 * engine (spatial passthrough or neural) → scale to display size → present
 * (adaptive sharpening, colour, comparison).
 */
export class Enhancement {
  readonly work: GPUTexture;
  private pre: GPUTexture;
  private scaled: GPUTexture;
  private neural?: UpscalingEngine;
  private preParams: GPUBuffer;
  private scaleParams: GPUBuffer;
  private presentParams: GPUBuffer;
  private sampler: GPUSampler;
  private prePipeline!: GPUComputePipeline;
  private scalePipeline!: GPUComputePipeline;
  private presentPipeline!: GPURenderPipeline;
  private preGroup!: GPUBindGroup;
  private scaleGroup!: GPUBindGroup;
  private presentGroup!: GPUBindGroup;
  private hint?: {
    texture: GPUTexture;
    buffer: GPUBuffer;
    pipeline: GPUComputePipeline;
    group: GPUBindGroup;
    busy: boolean;
  };
  private destroyed = false;
  constructor(
    private device: GPUDevice,
    width: number,
    height: number,
    output: readonly [number, number],
    private settings: Settings,
  ) {
    this.work = texture(device, width, height, "WebScaly working frame");
    this.pre = texture(
      device,
      width,
      height,
      "WebScaly prefiltered frame",
      "rgba16float",
    );
    this.scaled = texture(
      device,
      output[0],
      output[1],
      "WebScaly display-size frame",
      "rgba16float",
    );
    const uniform = (size: number) =>
      device.createBuffer({
        size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    this.preParams = uniform(16);
    this.scaleParams = uniform(16);
    this.presentParams = uniform(32);
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }
  async initialize(format: GPUTextureFormat, upscale: boolean) {
    const [prefilter, scale, present] = await Promise.all([
      checkedShader(this.device, prefilterWGSL, "Prefilter"),
      checkedShader(this.device, scaleWGSL, "Scale"),
      checkedShader(this.device, presentWGSL, "Presentation"),
    ]);
    [this.prePipeline, this.scalePipeline, this.presentPipeline] =
      await Promise.all([
        this.device.createComputePipelineAsync({
          layout: "auto",
          compute: { module: prefilter, entryPoint: "main" },
        }),
        this.device.createComputePipelineAsync({
          layout: "auto",
          compute: { module: scale, entryPoint: "main" },
        }),
        this.device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: present, entryPoint: "vert" },
          fragment: {
            module: present,
            entryPoint: "frag",
            targets: [{ format }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ]);
    this.preGroup = this.device.createBindGroup({
      layout: this.prePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.work.createView() },
        { binding: 1, resource: this.pre.createView() },
        { binding: 2, resource: { buffer: this.preParams } },
      ],
    });
    if (this.settings.algorithm === "anime4k") {
      this.device.pushErrorScope("validation");
      try {
        this.neural = new AnimeEngine(
          this.device,
          this.pre,
          upscale,
          this.settings.quality,
        );
      } finally {
        const error = await this.device.popErrorScope();
        if (error) throw new Error(error.message);
      }
    }
    if (this.settings.algorithm === "fsrcnnx")
      this.neural = await FsrcEngine.create(this.device, this.pre);
    const enhanced = this.neural?.output ?? this.pre;
    this.scaleGroup = this.device.createBindGroup({
      layout: this.scalePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: enhanced.createView() },
        { binding: 1, resource: this.scaled.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.scaleParams } },
      ],
    });
    this.presentGroup = this.device.createBindGroup({
      layout: this.presentPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.scaled.createView() },
        { binding: 1, resource: this.work.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.presentParams } },
      ],
    });
    this.update(this.settings);
  }
  update(s: Settings, compare = s.comparison) {
    this.settings = s;
    const queue = this.device.queue;
    queue.writeBuffer(this.preParams, 0, new Float32Array([s.denoise, s.deband, 0, 0]));
    queue.writeBuffer(this.scaleParams, 0, new Uint32Array([SCALE_MODES[s.quality], 0, 0, 0]));
    queue.writeBuffer(
      this.presentParams,
      0,
      new Float32Array([
        s.split,
        compare ? 1 : 0,
        s.strength,
        s.vibrance,
        s.contrast,
        s.brightness,
        0,
        0,
      ]),
    );
  }
  /** Copies a same-size RGBA8 texture into the working frame (benchmarks and validation). */
  load(encoder: GPUCommandEncoder, source: GPUTexture) {
    encoder.copyTextureToTexture({ texture: source }, { texture: this.work }, [
      this.work.width,
      this.work.height,
    ]);
  }
  /** Encodes everything after the capture pass into `target` (the canvas texture). */
  encode(encoder: GPUCommandEncoder, target: GPUTexture) {
    dispatch(encoder, this.prePipeline, this.preGroup, this.work.width, this.work.height);
    this.neural?.encode(encoder);
    dispatch(encoder, this.scalePipeline, this.scaleGroup, this.scaled.width, this.scaled.height);
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
    pass.setBindGroup(0, this.presentGroup);
    pass.draw(3);
    pass.end();
  }
  /** Reads a small thumbnail of the current working frame without blocking rendering. */
  async thumbnail(): Promise<{ data: Uint8Array; stride: number } | null> {
    if (this.destroyed) return null;
    if (!this.hint) {
      const module = await checkedShader(this.device, hintWGSL, "Content hint");
      const pipeline = await this.device.createComputePipelineAsync({
        layout: "auto",
        compute: { module, entryPoint: "main" },
      });
      if (this.destroyed) return null;
      const target = this.device.createTexture({
        size: [...HINT_SIZE],
        format: "rgba8unorm",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
      });
      this.hint = {
        texture: target,
        buffer: this.device.createBuffer({
          size: HINT_ROW * HINT_SIZE[1],
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
        pipeline,
        group: this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: this.work.createView() },
            { binding: 1, resource: target.createView() },
            { binding: 2, resource: this.sampler },
          ],
        }),
        busy: false,
      };
    }
    const hint = this.hint;
    if (hint.busy) return null;
    hint.busy = true;
    try {
      const encoder = this.device.createCommandEncoder();
      dispatch(encoder, hint.pipeline, hint.group, ...HINT_SIZE);
      encoder.copyTextureToBuffer(
        { texture: hint.texture },
        { buffer: hint.buffer, bytesPerRow: HINT_ROW },
        [...HINT_SIZE],
      );
      this.device.queue.submit([encoder.finish()]);
      await hint.buffer.mapAsync(GPUMapMode.READ);
      const data = new Uint8Array(hint.buffer.getMappedRange()).slice();
      hint.buffer.unmap();
      return { data, stride: HINT_ROW };
    } catch {
      return null;
    } finally {
      hint.busy = false;
    }
  }
  destroy() {
    this.destroyed = true;
    this.neural?.destroy();
    this.work.destroy();
    this.pre.destroy();
    this.scaled.destroy();
    this.preParams.destroy();
    this.scaleParams.destroy();
    this.presentParams.destroy();
    this.hint?.texture.destroy();
    this.hint?.buffer.destroy();
    this.hint = undefined;
  }
}
