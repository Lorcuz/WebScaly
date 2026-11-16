// GPU output validation beyond "the output differs" (G7). Every engine and quality
// mode, including Anime4K restore-only and CNNx2VL (Quality), runs on deterministic test patterns at 2× and 1:1
// (and a second input size). Each output is checked for size, opacity, finite intermediate values, and the
// transformation it should make: flat fields stay flat, gradients stay monotonic and in place, edges stay put and
// at least as sharp as plain bilinear scaling with bounded ringing, colours keep their hue, and fine detail keeps
// its contrast. Tolerances are statistical, so they hold across GPU vendors and driver precision differences.
import { texture } from "../core/device";
import { Enhancement } from "../core/enhancement";
import { DEFAULTS, type Algorithm, type Settings } from "../shared/settings";

type Quality = Settings["quality"];
export interface QualityCase {
  label: string;
  algorithm: Algorithm;
  quality: Quality;
  input: [number, number];
  output: [number, number];
}
export interface Check {
  ok: boolean;
  value: number;
  limit: string;
}
export interface CaseResult extends QualityCase {
  ok: boolean;
  checks: Record<string, Check>;
  errors: string[];
  wallMs: number;
}
const PATTERNS = ["flat", "gradient", "edge", "color", "stripes"] as const;
type Pattern = (typeof PATTERNS)[number];

export function qualityCases(): QualityCase[] {
  const cases: QualityCase[] = [];
  const add = (algorithm: Algorithm, quality: Quality, input: [number, number], scale: number, note = "") =>
    cases.push({
      label: `${algorithm} ${quality} ${input.join("x")}→${input.map((v) => v * scale).join("x")}${note}`,
      algorithm,
      quality,
      input,
      output: [input[0] * scale, input[1] * scale],
    });
  const small: [number, number] = [128, 72],
    large: [number, number] = [192, 108];
  for (const quality of ["fast", "balanced", "quality"] as Quality[]) {
    add("spatial", quality, small, 2);
    add("anime4k", quality, small, 2, quality === "quality" ? " (CNNx2VL)" : quality === "fast" ? " (CNNx2M only)" : "");
    add("fsrcnnx", quality, small, 2);
  }
  add("spatial", "balanced", small, 1);
  add("anime4k", "balanced", small, 1, " (restore only)");
  add("anime4k", "quality", small, 1, " (restore only)");
  add("fsrcnnx", "balanced", small, 1, " (2x network, reduced)");
  for (const algorithm of ["spatial", "anime4k", "fsrcnnx"] as Algorithm[]) add(algorithm, "balanced", large, 2);
  return cases;
}

function pattern(kind: Pattern, w: number, h: number) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 128,
        g = 128,
        b = 128;
      if (kind === "gradient") r = g = b = Math.round(32 + (192 * x) / (w - 1));
      if (kind === "edge") r = g = b = x < w / 2 ? 64 : 192;
      if (kind === "color") {
        const q = (x < w / 2 ? 0 : 1) + (y < h / 2 ? 0 : 2);
        [r, g, b] = [
          [200, 60, 60],
          [60, 180, 70],
          [60, 80, 200],
          [150, 150, 150],
        ][q];
      }
      if (kind === "stripes") r = g = b = Math.floor(x / 2) % 2 ? 176 : 80;
      px.set([r, g, b, 255], (y * w + x) * 4);
    }
  return px;
}
async function read(device: GPUDevice, tex: GPUTexture, bytes: number) {
  const pitch = Math.ceil((tex.width * bytes) / 256) * 256,
    buffer = device.createBuffer({ size: pitch * tex.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
    encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture: tex }, { buffer, bytesPerRow: pitch }, [tex.width, tex.height]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange()),
    out = new Uint8Array(tex.width * tex.height * bytes);
  for (let y = 0; y < tex.height; y++) out.set(mapped.subarray(y * pitch, y * pitch + tex.width * bytes), y * tex.width * bytes);
  buffer.unmap();
  buffer.destroy();
  return out;
}
const RANGE_WGSL = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> result: array<atomic<u32>, 2>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(src);
  if (any(id.xy >= d)) { return; }
  let v = textureLoad(src, vec2i(id.xy), 0).rgb;
  let m = max(max(abs(v.r), abs(v.g)), abs(v.b));
  // NaN fails every comparison, so "not (m <= limit)" counts NaN and infinities.
  if (!(m <= 65504.0)) { atomicAdd(&result[0], 1u); return; }
  atomicMax(&result[1], u32(min(m, 1000.0) * 1000.0));
}`;
const rangePipelines = new WeakMap<GPUDevice, Promise<GPUComputePipeline>>();
/** Non-finite values and the largest magnitude in a sampled texture (any float-filterable format), on the GPU. */
async function surfaceRange(device: GPUDevice, tex: GPUTexture) {
  let pending = rangePipelines.get(device);
  if (!pending)
    rangePipelines.set(
      device,
      (pending = device.createComputePipelineAsync({
        layout: "auto",
        compute: { module: device.createShaderModule({ code: RANGE_WGSL }), entryPoint: "main" },
      })),
    );
  const rangePipeline = await pending;
  const result = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }),
    readback = device.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
    encoder = device.createCommandEncoder(),
    pass = encoder.beginComputePass();
  pass.setPipeline(rangePipeline);
  pass.setBindGroup(0, device.createBindGroup({
    layout: rangePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: { buffer: result } }],
  }));
  pass.dispatchWorkgroups(Math.ceil(tex.width / 8), Math.ceil(tex.height / 8));
  pass.end();
  encoder.copyBufferToBuffer(result, 0, readback, 0, 8);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const [bad, max] = new Uint32Array(readback.getMappedRange().slice(0));
  readback.unmap();
  readback.destroy();
  result.destroy();
  return bad ? NaN : max / 1000;
}
const luma = (p: Uint8Array, i: number) => (p[i] + p[i + 1] + p[i + 2]) / 3;
/** Mean of each output column over the middle half of the rows. */
function columns(p: Uint8Array, w: number, h: number) {
  const cols = new Array(w).fill(0),
    y0 = Math.floor(h / 4),
    y1 = Math.ceil((3 * h) / 4);
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) cols[x] += luma(p, (y * w + x) * 4);
  return cols.map((c) => c / (y1 - y0));
}
function stats(p: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number, channel?: number) {
  let n = 0,
    sum = 0,
    sq = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4,
        v = channel === undefined ? luma(p, i) : p[i + channel];
      sum += v;
      sq += v * v;
      n++;
    }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}
const check = (ok: boolean, value: number, limit: string): Check => ({ ok, value: Math.round(value * 100) / 100, limit });

async function runEngine(device: GPUDevice, c: QualityCase, settings: Settings, keep: (e: Enhancement) => Promise<void> | void) {
  const [w, h] = c.input,
    [ow, oh] = c.output,
    source = texture(device, w, h, "Quality source"),
    target = texture(device, ow, oh, "Quality target");
  const engine = new Enhancement(device, w, h, [ow, oh], settings);
  const out: Record<Pattern, Uint8Array> = {} as Record<Pattern, Uint8Array>;
  try {
    await engine.initialize("rgba8unorm", ow > w || oh > h);
    for (const kind of PATTERNS) {
      device.queue.writeTexture({ texture: source }, pattern(kind, w, h), { bytesPerRow: w * 4 }, [w, h]);
      const encoder = device.createCommandEncoder();
      engine.load(encoder, source);
      engine.encode(encoder, target);
      device.queue.submit([encoder.finish()]);
      out[kind] = await read(device, target, 4);
      await keep(engine);
    }
    return { out, size: [target.width, target.height] };
  } finally {
    engine.destroy();
    source.destroy();
    target.destroy();
  }
}

/** Runs one case: the configured engine against a plain bilinear reference of the same sizes. */
export async function qualityCase(device: GPUDevice, c: QualityCase): Promise<CaseResult> {
  const start = performance.now(),
    errors: string[] = [],
    checks: Record<string, Check> = {};
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  let floatWorst = 0;
  try {
    const settings: Settings = { ...DEFAULTS, algorithm: c.algorithm, quality: c.quality, comparison: false };
    const result = await runEngine(device, c, settings, async (engine) => {
      const e = engine as unknown as { pre: GPUTexture; neural?: { output: GPUTexture }; scaled?: GPUTexture };
      for (const t of [e.pre, e.neural?.output, e.scaled]) if (t) {
        const v = await surfaceRange(device, t);
        floatWorst = Number.isFinite(v) && Number.isFinite(floatWorst) ? Math.max(floatWorst, v) : NaN;
      }
    });
    const reference = (
      await runEngine(device, c, { ...DEFAULTS, algorithm: "spatial", quality: "fast", strength: 0, denoise: 0, deband: 0, vibrance: 0, contrast: 0, brightness: 0, comparison: false }, () => {})
    ).out;
    const [ow, oh] = c.output,
      [w] = c.input,
      s = ow / w,
      out = result.out;
    checks.size = check(result.size[0] === ow && result.size[1] === oh, result.size[0] * 10000 + result.size[1], `${ow}x${oh}`);
    let transparent = 0;
    for (const kind of PATTERNS) for (let i = 3; i < out[kind].length; i += 4) if (out[kind][i] !== 255) transparent++;
    checks.opaque = check(transparent === 0, transparent, "0 non-opaque pixels");
    checks.finite = check(Number.isFinite(floatWorst) && floatWorst < 4, floatWorst, "finite, |v| < 4 in every intermediate surface");
    // Flat field: no added texture, no shift, not black.
    const flat = stats(out.flat, ow, 0, ow, 0, oh);
    checks.flatMean = check(Math.abs(flat.mean - 128) <= 6, flat.mean, "128 ± 6");
    checks.flatNoise = check(flat.sd <= 3, flat.sd, "sd ≤ 3");
    // Gradient: in place (mapped input value) and monotonic.
    const g = columns(out.gradient, ow, oh);
    let gradErr = 0,
      gradDrop = 0;
    for (let x = Math.floor(ow * 0.1); x < Math.ceil(ow * 0.9); x++) {
      const u = Math.min(w - 1, Math.max(0, (x + 0.5) / s - 0.5));
      gradErr = Math.max(gradErr, Math.abs(g[x] - (32 + (192 * u) / (w - 1))));
      if (x > 0) gradDrop = Math.max(gradDrop, g[x - 1] - g[x]);
    }
    checks.gradientError = check(gradErr <= 12, gradErr, "≤ 12 levels from the input ramp");
    checks.gradientMonotonic = check(gradDrop <= 3, gradDrop, "no drop > 3 levels");
    // Edge: position, acutance against bilinear, bounded ringing.
    const e = columns(out.edge, ow, oh),
      r = columns(reference.edge, ow, oh);
    let cross = 0;
    for (let x = 1; x < ow; x++) if (e[x - 1] < 128 && e[x] >= 128) cross = x - 1 + (128 - e[x - 1]) / (e[x] - e[x - 1]);
    checks.edgePosition = check(Math.abs(cross + 0.5 - (w / 2) * s) <= 1.5, cross + 0.5 - (w / 2) * s, "± 1.5 px");
    const slope = (a: number[]) => Math.max(...a.slice(1).map((v, i) => v - a[i]));
    checks.edgeSharpness = check(slope(e) >= 0.9 * slope(r), slope(e) / slope(r), "≥ 0.9 × bilinear");
    const lo = Math.min(...e),
      hi = Math.max(...e);
    checks.ringing = check(64 - lo <= 30 && hi - 192 <= 30, Math.max(64 - lo, hi - 192), "over/undershoot ≤ 30 levels");
    // Colour: each quadrant keeps its colour.
    let colourErr = 0;
    const quads: [number, number, number[]][] = [
      [0.25, 0.25, [200, 60, 60]],
      [0.75, 0.25, [60, 180, 70]],
      [0.25, 0.75, [60, 80, 200]],
      [0.75, 0.75, [150, 150, 150]],
    ];
    for (const [qx, qy, rgb] of quads)
      for (let ch = 0; ch < 3; ch++) {
        const x = Math.round(qx * ow),
          y = Math.round(qy * oh),
          m = stats(out.color, ow, x - 4, x + 4, y - 4, y + 4, ch).mean;
        colourErr = Math.max(colourErr, Math.abs(m - rgb[ch]));
      }
    checks.colour = check(colourErr <= 20, colourErr, "≤ 20 levels per channel");
    // Fine detail keeps (at least half of) the contrast bilinear scaling keeps.
    const d = stats(out.stripes, ow, Math.floor(ow * 0.2), Math.ceil(ow * 0.8), Math.floor(oh * 0.2), Math.ceil(oh * 0.8)),
      dr = stats(reference.stripes, ow, Math.floor(ow * 0.2), Math.ceil(ow * 0.8), Math.floor(oh * 0.2), Math.ceil(oh * 0.8));
    checks.detail = check(d.sd >= 0.5 * dr.sd, d.sd / dr.sd, "contrast ≥ 0.5 × bilinear");
  } catch (e) {
    errors.push((e as Error).message);
  } finally {
    const validation = await device.popErrorScope(),
      memory = await device.popErrorScope();
    for (const x of [validation, memory]) if (x) errors.push(x.message);
  }
  return {
    ...c,
    checks,
    errors,
    ok: !errors.length && Object.values(checks).length > 0 && Object.values(checks).every((x) => x.ok),
    wallMs: Math.round(performance.now() - start),
  };
}
