export interface DeviceContext {
  device: GPUDevice;
  adapter: GPUAdapter;
}
let pending: Promise<DeviceContext> | undefined;
// Renderers hold the shared device while they use it. When the last one lets go, the device (and the
// GPU memory behind it) is released after a grace period, so a page whose video is gone does not keep it
// for its whole lifetime, while quick engine switches or SPA navigations still reuse it.
const RELEASE_AFTER_MS = 15_000;
let holders = 0,
  releaseTimer: ReturnType<typeof setTimeout> | undefined;
/** Marks the shared device as in use; call the returned function exactly once when done. */
export function holdDevice(): () => void {
  holders++;
  clearTimeout(releaseTimer);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--holders > 0) return;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (holders > 0 || !pending) return;
      const current = pending;
      pending = undefined;
      void current.then(({ device }) => device.destroy(), () => {});
    }, RELEASE_AFTER_MS);
  };
}
export function gpuDevice(): Promise<DeviceContext> {
  if (pending) return pending;
  const request: Promise<DeviceContext> = (async () => {
    if (!navigator.gpu)
      throw new Error(
        "WebGPU is unavailable. Enable browser hardware acceleration and use Chrome 121 or newer.",
      );
    // Chrome ignores powerPreference on Windows; let the browser select a supported adapter.
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
      throw new Error(
        "No compatible WebGPU adapter. Native playback remains available.",
      );
    const features: GPUFeatureName[] = ["timestamp-query"].filter((f) =>
      adapter.features.has(f as GPUFeatureName),
    ) as GPUFeatureName[];
    const device = await adapter.requestDevice({
      requiredFeatures: features,
      requiredLimits: {
        maxStorageTexturesPerShaderStage: Math.min(
          8,
          adapter.limits.maxStorageTexturesPerShaderStage,
        ),
        maxSampledTexturesPerShaderStage: Math.min(
          16,
          adapter.limits.maxSampledTexturesPerShaderStage,
        ),
      },
    });
    // Only forget this device; a newer one may already be cached after a release.
    void device.lost.then(() => {
      if (pending === request) pending = undefined;
    });
    return { device, adapter };
  })();
  pending = request;
  return request.catch((e) => {
    if (pending === request) pending = undefined;
    throw e;
  });
}
export async function checkedShader(
  device: GPUDevice,
  code: string,
  label: string,
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === "error");
  if (errors.length)
    throw new Error(
      `${label}: ${errors.map((m) => `${m.lineNum}: ${m.message}`).join("; ")}`,
    );
  return module;
}
export function texture(
  device: GPUDevice,
  width: number,
  height: number,
  label: string,
  format: GPUTextureFormat = "rgba8unorm",
): GPUTexture {
  return device.createTexture({
    label,
    size: [width, height],
    format,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
}
