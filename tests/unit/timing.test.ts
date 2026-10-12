import { describe, expect, it } from "vitest";
import { FpsEstimator, outputSize, RateCounter } from "../../src/core/timing";
import { DEFAULTS } from "../../src/shared/settings";
describe("source timing and presentation", () => {
  it.each([24, 30, 60])(
    "estimates %i FPS from timestamps with one missed callback",
    (fps) => {
      const estimator = new FpsEstimator();
      for (let i = 0; i < 35; i++) {
        if (i !== 12) estimator.observe(i / fps);
      }
      expect(estimator.fps).toBeCloseTo(fps, 3);
    },
  );
  it("flushes a source estimate on seek and loop discontinuities", () => {
    const estimator = new FpsEstimator();
    for (let i = 0; i < 10; i++) estimator.observe(i / 30);
    expect(estimator.fps).toBeCloseTo(30);
    estimator.observe(0.01);
    expect(estimator.fps).toBe(0);
  });
  it("counts submissions instead of pretending target FPS was delivered", () => {
    const counter = new RateCounter();
    for (let t = 0; t <= 1000; t += 100) counter.add(t);
    expect(counter.value(1000)).toBe(10);
    expect(counter.value(2600)).toBe(0);
  });
  it("preserves aspect ratio while respecting output and GPU limits", () => {
    expect(outputSize(1280, 720, 1080, DEFAULTS)).toEqual([1920, 1080]);
    expect(
      outputSize(1920, 1080, 2160, {
        ...DEFAULTS,
        scale: "2",
        maxHeight: 1080,
      }),
    ).toEqual([1920, 1080]);
    expect(outputSize(7680, 4320, 4320, DEFAULTS, 4096)).toEqual([1920, 1080]);
  });
});
