import { gpuDevice, texture } from "../core/device";
import { Enhancement } from "../core/enhancement";
import { DEFAULTS, type Algorithm } from "../shared/settings";

async function readPixels(device: GPUDevice, tex: GPUTexture) {
  const pitch = Math.ceil((tex.width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: pitch * tex.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: tex },
    { buffer, bytesPerRow: pitch },
    [tex.width, tex.height],
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const pixels = new Uint8Array(tex.width * tex.height * 4);
  for (let y = 0; y < tex.height; y++)
    pixels.set(
      mapped.subarray(y * pitch, y * pitch + tex.width * 4),
      y * tex.width * 4,
    );
  buffer.unmap();
  buffer.destroy();
  return pixels;
}
export async function validateGpu() {
  const { device, adapter } = await gpuDevice();
  const failures: string[] = [];
  device.addEventListener("uncapturederror", (e) =>
    failures.push(e.error.message),
  );
  const width = 128,
    height = 96;
  const source = texture(device, width, height, "Validation source");
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const c = ((x * 7 + y * 11) % 180) + 40;
      pixels.set([c, Math.min(255, c + 20), Math.max(0, c - 20), 255], p);
    }
  device.queue.writeTexture(
    { texture: source },
    pixels,
    { bytesPerRow: width * 4 },
    [width, height],
  );
  const results = [];
  const baseline = texture(device, width * 2, height * 2, "Bilinear reference");
  const plain = new Enhancement(device, width, height, {
    ...DEFAULTS,
    strength: 0,
    denoise: 0,
  });
  await plain.initialize("rgba8unorm", true);
  const referenceEncoder = device.createCommandEncoder();
  plain.encode(referenceEncoder, source, baseline);
  device.queue.submit([referenceEncoder.finish()]);
  const reference = await readPixels(device, baseline);
  plain.destroy();
  baseline.destroy();
  for (const algorithm of ["spatial", "anime4k", "fsrcnnx"] as Algorithm[]) {
    const target = texture(
      device,
      width * 2,
      height * 2,
      `Validation ${algorithm}`,
    );
    const engine = new Enhancement(device, width, height, {
      ...DEFAULTS,
      algorithm,
      quality: "fast",
      strength: 0.7,
      denoise: 0.2,
    });
    const start = performance.now();
    try {
      await engine.initialize("rgba8unorm", true);
      const encoder = device.createCommandEncoder();
      engine.encode(encoder, source, target);
      device.queue.submit([encoder.finish()]);
      const out = await readPixels(device, target);
      let changed = 0,
        mean = 0,
        opaque = 0;
      for (let y = 0; y < height * 2; y++)
        for (let x = 0; x < width * 2; x++) {
          const p = (y * width * 2 + x) * 4;
          mean += out[p];
          opaque += out[p + 3] === 255 ? 1 : 0;
          if (Math.abs(reference[p] - out[p]) > 2) changed++;
        }
      results.push({
        algorithm,
        outputNonBlack: mean / (width * height * 4) > 5,
        changedPixels: changed,
        opaquePixels: opaque,
        outputPixels: width * height * 4,
        initializationAndReadbackWallMs: performance.now() - start,
      });
    } finally {
      engine.destroy();
      target.destroy();
    }
  }
  source.destroy();
  await device.queue.onSubmittedWorkDone();
  return {
    browser: navigator.userAgent,
    adapter: {
      vendor: adapter.info.vendor,
      architecture: adapter.info.architecture,
      device: adapter.info.device,
      description: adapter.info.description,
      isFallbackAdapter: adapter.info.isFallbackAdapter,
    },
    features: [...device.features],
    results,
    validationErrors: failures,
  };
}
declare global {
  interface Window {
    webscalyValidateGpu: typeof validateGpu;
  }
}
window.webscalyValidateGpu = validateGpu;
