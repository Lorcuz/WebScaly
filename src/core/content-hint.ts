/**
 * Estimates whether a small RGBA frame looks like animation (large flat areas,
 * crisp edges, a limited palette) or camera footage (texture and grain everywhere).
 * Returns a score in [0, 1]; higher means more animation-like.
 */
export function animationScore(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  stride = width * 4,
): number {
  let flat = 0,
    edges = 0,
    samples = 0;
  const colors = new Set<number>();
  const luma = (x: number, y: number) => {
    const i = y * stride + x * 4;
    return rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722;
  };
  let bright = 0;
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const c = luma(x, y),
        g = Math.abs(c - luma(x + 1, y)) + Math.abs(c - luma(x, y + 1));
      if (g < 3) flat++;
      else if (g > 48) edges++;
      bright += c;
      samples++;
      const i = y * stride + x * 4;
      colors.add(
        ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3),
      );
    }
  if (!samples) return 0.5;
  // Near-black or near-white frames (fades, credits) carry no evidence either way.
  const mean = bright / samples;
  if (mean < 12 || mean > 245) return 0.5;
  const flatRatio = flat / samples,
    edgeRatio = edges / samples,
    palette = colors.size / samples;
  const score =
    0.55 * Math.min(1, flatRatio / 0.55) +
    0.2 * Math.min(1, edgeRatio / 0.06) +
    0.25 * (1 - Math.min(1, palette / 0.5));
  return Math.max(0, Math.min(1, score));
}
/** Smooths scores over time and only changes its answer on clear evidence. */
export class ContentHint {
  value: "animation" | "live" | "" = "";
  private history: number[] = [];
  observe(score: number) {
    this.history.push(score);
    if (this.history.length > 6) this.history.shift();
    if (this.history.length < 3) return this.value;
    const average =
      this.history.reduce((a, b) => a + b, 0) / this.history.length;
    if (average > 0.68) this.value = "animation";
    else if (average < 0.42) this.value = "live";
    return this.value;
  }
  reset() {
    this.history = [];
    this.value = "";
  }
}
