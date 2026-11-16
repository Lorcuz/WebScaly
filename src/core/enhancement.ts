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

/**
 * Runs synchronous GPU object creation inside out-of-memory and validation error scopes and returns the
 * created value plus a promise that rejects if either scope captured an error. Push and pop happen in the
 * same task, so concurrent renderers on the shared device never capture each other's errors.
 */
function scoped<T>(device: GPUDevice, label: string, create: () => T): [T, Promise<void>] {
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  let value: T;
  try {
    value = create();
  } finally {
    var validation = device.popErrorScope(),
      memory = device.popErrorScope();
  }
  const checked = Promise.all([validation, memory]).then(([v, m]) => {
    const error = v ?? m;
    if (error) throw new Error(`${label}: ${error.message}`);
  });
  return [value!, checked];
}
export interface UpscalingEngine {
  readonly output: GPUTexture;
  encode(encoder: GPUCommandEncoder): GPUTexture;
  destroy(): void;
}
/** Destroys every texture a list of Anime4K stages owns (nested helper pipelines included). */
function destroyStages(stages: Anime4KPipeline[]) {
  const textures = new Set<GPUTexture>();
  const visit = (stage: Anime4KPipeline & { pipelines?: Anime4KPipeline[] }) => {
    textures.add(stage.getOutputTexture());
    stage.pipelines?.forEach(visit);
  };
  stages.forEach(visit);
  // Destruction is deferred by WebGPU until already-submitted work that uses a texture completes.
  textures.forEach((t) => t.destroy());
}
class AnimeEngine implements UpscalingEngine {
  private stages: Anime4KPipeline[] = [];
  constructor(
    private device: GPUDevice,
    private input: GPUTexture,
    private upscale: boolean,
    private quality: Settings["quality"],
  ) {
    // Fixed trained convolution weights; these are genuine Anime4K neural passes.
    let current = input;
    if (quality !== "fast" || !upscale) {
      const restore = new CNNSoftM({ device, inputTexture: current });
      this.stages.push(restore);
      current = restore.getOutputTexture();
    }
    if (upscale) this.stages.push(this.upscaler(current));
  }
  private upscaler(inputTexture: GPUTexture) {
    return new (this.quality === "quality" ? CNNx2VL : CNNx2M)({ device: this.device, inputTexture });
  }
  /**
   * Switches between restore-only and restore + 2× when the display size crosses the working size (for
   * example entering fullscreen). Balanced and Quality keep their restore stage and its textures; only Fast,
   * whose 2× network reads the frame directly, builds a new chain.
   */
  reshape(upscale: boolean) {
    if (upscale === this.upscale) return;
    this.upscale = upscale;
    if (this.quality !== "fast") {
      if (upscale) this.stages.push(this.upscaler(this.stages[0].getOutputTexture()));
      else destroyStages(this.stages.splice(1));
      return;
    }
    const old = this.stages;
    this.stages = [
      upscale ? this.upscaler(this.input) : new CNNSoftM({ device: this.device, inputTexture: this.input }),
    ];
    destroyStages(old);
  }
  get output() {
    return this.stages.at(-1)!.getOutputTexture();
  }
  encode(encoder: GPUCommandEncoder) {
    this.stages.forEach((s) => s.pass(encoder));
    return this.output;
  }
  destroy() {
    destroyStages(this.stages);
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
@group(0) @binding(2) var out: texture_storage_2d<FORMAT, write>;
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
    format: "rgba8unorm" | "rgba16float" = "rgba8unorm",
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
      // Plan every pass first (textures and bind-group entries, in order), then compile all pipelines at once.
      const plans: { code: string; entries: GPUBindGroupEntry[]; width: number; height: number; label: string }[] = [];
      const [, allocated] = scoped(device, "FSRCNNX surfaces", () => {
        const luma = make(input.width, input.height, "FSRCNNX luma");
        plans.push({
          code: lumaShader,
          entries: [
            { binding: 0, resource: input.createView() },
            { binding: 1, resource: luma.createView() },
          ],
          width: input.width,
          height: input.height,
          label: "FSRCNNX RGB to luma",
        });
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
            // A name saved again (MODEL1-4, MODEL21-24) reuses its earlier surface: the previous content was
            // consumed by the pass in between, and no pass reads and writes the same surface.
            const old = resources.get(name!);
            const t = old && old.width === w && old.height === h && !inputs.includes(old) ? old : make(w, h, `FSRCNNX ${name}`);
            resources.set(name!, t);
            return t;
          });
          plans.push({
            code: header + sections[i],
            entries: [...inputs, ...outputs].map((t, binding) => ({ binding, resource: t.createView() })),
            width: w,
            height: h,
            label: `FSRCNNX pass ${i}`,
          });
          final = outputs[0];
        }
        engine.output = make(final.width, final.height, "FSRCNNX RGB", format);
        plans.push({
          code: chromaShader.replace("FORMAT", format),
          entries: [
            { binding: 0, resource: input.createView() },
            { binding: 1, resource: final.createView() },
            { binding: 2, resource: engine.output.createView() },
            { binding: 3, resource: device.createSampler({ magFilter: "linear", minFilter: "linear" }) },
          ],
          width: final.width,
          height: final.height,
          label: "FSRCNNX chroma recombination",
        });
      });
      const pipelines = await Promise.all(
        plans.map(async (p) =>
          device.createComputePipelineAsync({
            label: p.label,
            layout: "auto",
            compute: { module: await checkedShader(device, p.code, p.label), entryPoint: "main" },
          }),
        ),
      );
      await allocated;
      const [, grouped] = scoped(device, "FSRCNNX bindings", () => {
        for (const [i, p] of plans.entries())
          engine.steps.push({
            pipeline: pipelines[i],
            group: device.createBindGroup({ layout: pipelines[i].getBindGroupLayout(0), entries: p.entries }),
            width: p.width,
            height: p.height,
          });
      });
      await grouped;
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
 * Variants that change the picture and are not product settings. They exist so QA can measure alternatives
 * side by side in an internal study; production code never passes them, so the defaults below are
 * what users get.
 */
export interface EngineVariant {
  /** Precision of FSRCNNX's recombined RGB output (default 8-bit, as shipped since 0.4). */
  fsrcnnxOutput?: "rgba8unorm" | "rgba16float";
  /** When FSRCNNX would not enlarge (1:1): run the 2× network and reduce ("network", default) or skip it. */
  fsrcnnxAtNative?: "network" | "skip";
}
/**
 * Per-frame pipeline: captured frame (work) → prefilter (denoise, deband) →
 * engine (spatial passthrough or neural) → scale to display size → present
 * (adaptive sharpening, colour, comparison).
 */
export class Enhancement {
  readonly work: GPUTexture;
  private pre: GPUTexture;
  /** Display-size copy, only when the enhanced picture is not already the output size. */
  private scaled?: GPUTexture;
  private allocated: Promise<void>;
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
  private output: readonly [number, number];
  constructor(
    private device: GPUDevice,
    width: number,
    height: number,
    output: readonly [number, number],
    private settings: Settings,
    private variant: EngineVariant = {},
  ) {
    this.output = output;
    [[this.work, this.pre], this.allocated] = scoped(device, "Working surfaces", () => [
      texture(device, width, height, "WebScaly working frame"),
      texture(device, width, height, "WebScaly prefiltered frame", "rgba16float"),
    ]);
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
    await this.allocated;
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
      const [engine, checked] = scoped(this.device, "Anime4K", () =>
        new AnimeEngine(this.device, this.pre, upscale, this.settings.quality),
      );
      this.neural = engine;
      await checked;
    }
    if (this.settings.algorithm === "fsrcnnx" && (upscale || this.variant.fsrcnnxAtNative !== "skip"))
      this.neural = await FsrcEngine.create(this.device, this.pre, this.variant.fsrcnnxOutput);
    const [, bound] = scoped(this.device, "Presentation bindings", () => this.bindPresentation());
    await bound;
    this.update(this.settings);
  }
  /**
   * Adapts to a new display size without rebuilding the pipeline: only the display-size surface and the
   * bindings that read it change. Anime4K additionally adds or drops its 2× stage when the display crosses
   * the working size; compiled pipelines, working surfaces and the other networks are kept. The returned
   * promise rejects if an allocation failed.
   */
  resize(output: readonly [number, number]): Promise<void> {
    const upscale = output[0] > this.work.width || output[1] > this.work.height;
    const [, checked] = scoped(this.device, "Resized presentation", () => {
      if (this.neural instanceof AnimeEngine) this.neural.reshape(upscale);
      const old = this.scaled;
      this.scaled = undefined;
      this.output = output;
      try {
        this.bindPresentation();
      } finally {
        old?.destroy();
      }
    });
    return checked;
  }
  get outputSize(): readonly [number, number] {
    return this.output;
  }
  private bindPresentation() {
    const enhanced = this.neural?.output ?? this.pre;
    // At 1:1 every resampling mode reproduces its input (bilinear at texel centres, Catmull-Rom and
    // Lanczos-2 weights of 1 and 0), so present reads the enhanced picture directly.
    const direct =
      enhanced.width === this.output[0] && enhanced.height === this.output[1];
    if (!direct) {
      this.scaled = texture(
        this.device,
        this.output[0],
        this.output[1],
        "WebScaly display-size frame",
        "rgba16float",
      );
      this.scaleGroup = this.device.createBindGroup({
        layout: this.scalePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: enhanced.createView() },
          { binding: 1, resource: this.scaled.createView() },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: { buffer: this.scaleParams } },
        ],
      });
    }
    this.presentGroup = this.device.createBindGroup({
      layout: this.presentPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: (this.scaled ?? enhanced).createView() },
        { binding: 1, resource: this.work.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.presentParams } },
      ],
    });
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
    if (this.scaled)
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
    this.scaled?.destroy();
    this.preParams.destroy();
    this.scaleParams.destroy();
    this.presentParams.destroy();
    this.hint?.texture.destroy();
    this.hint?.buffer.destroy();
    this.hint = undefined;
  }
}
