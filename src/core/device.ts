export interface DeviceContext {
  device: GPUDevice;
  adapter: GPUAdapter;
}
let pending: Promise<DeviceContext> | undefined;
export function gpuDevice(): Promise<DeviceContext> {
  pending ??= (async () => {
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
    void device.lost.then(() => {
      pending = undefined;
    });
    return { device, adapter };
  })();
  return pending.catch((e) => {
    pending = undefined;
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
