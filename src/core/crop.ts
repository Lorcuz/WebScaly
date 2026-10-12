export interface Crop {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function pixelCrop(width: number, height: number, crop?: Crop) {
  const clamp = (n: number) =>
    Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const x = crop
    ? Math.min(width - 1, Math.floor(clamp(crop.left) * width))
    : 0;
  const y = crop
    ? Math.min(height - 1, Math.floor(clamp(crop.top) * height))
    : 0;
  return {
    x,
    y,
    width: crop
      ? Math.max(1, Math.min(width - x, Math.round(clamp(crop.width) * width)))
      : width,
    height: crop
      ? Math.max(
          1,
          Math.min(height - y, Math.round(clamp(crop.height) * height)),
        )
      : height,
  };
}
