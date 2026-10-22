import { describe, expect, it } from "vitest";
import { animationScore, ContentHint } from "../../src/core/content-hint";

const W = 96,
  H = 54;
function frame(pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) data.set([...pixel(x, y), 255], (y * W + x) * 4);
  return data;
}
// Deterministic pseudo-random texture standing in for camera grain.
let seed = 7;
const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

describe("content hint", () => {
  it("scores flat cel-shaded frames as animation-like", () => {
    const cel = frame((x, y) =>
      (x - 48) ** 2 + (y - 27) ** 2 < 200 ? [230, 120, 90] : y < 30 ? [90, 160, 220] : [70, 140, 60],
    );
    expect(animationScore(cel, W, H)).toBeGreaterThan(0.7);
  });
  it("scores textured camera-like frames as live action", () => {
    const camera = frame((x, y) => {
      const base = 90 + 50 * Math.sin(x / 9) + 30 * Math.cos(y / 7);
      return [base + noise() * 40, base * 0.9 + noise() * 40, base * 0.8 + noise() * 40];
    });
    expect(animationScore(camera, W, H)).toBeLessThan(0.42);
  });
  it("treats black or white frames as no evidence", () => {
    expect(animationScore(frame(() => [2, 2, 2]), W, H)).toBe(0.5);
    expect(animationScore(frame(() => [252, 252, 252]), W, H)).toBe(0.5);
  });
  it("respects padded row strides", () => {
    const stride = 512,
      padded = new Uint8Array(stride * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) padded.set([200, 100, 50, 255], y * stride + x * 4);
    expect(animationScore(padded, W, H, stride)).toBeGreaterThan(0.6);
  });
  it("needs sustained evidence and resists flipping on one frame", () => {
    const hint = new ContentHint();
    expect(hint.observe(0.9)).toBe("");
    hint.observe(0.9);
    expect(hint.observe(0.9)).toBe("animation");
    expect(hint.observe(0.2)).toBe("animation");
    hint.observe(0.2);
    hint.observe(0.2);
    hint.observe(0.2);
    hint.observe(0.2);
    expect(hint.observe(0.2)).toBe("live");
    hint.reset();
    expect(hint.value).toBe("");
  });
});
