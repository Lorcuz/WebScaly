import { describe, expect, it } from "vitest";
import { Governor, maxLevel, plan } from "../../src/core/governor";
import { DEFAULTS } from "../../src/shared/settings";

const run = (
  governor: Governor,
  windows: { decoded: number; dropped: number; gpuMs?: number | null }[],
  limit = 3,
  fps = 30,
) => {
  let now = 1000,
    decoded = 0,
    dropped = 0;
  const changes: boolean[] = [];
  governor.observe({ now, decoded, dropped, gpuMs: null, fps, playing: true }, limit);
  for (const w of windows) {
    now += 2100;
    decoded += w.decoded;
    dropped += w.dropped;
    changes.push(
      governor.observe(
        { now, decoded, dropped, gpuMs: w.gpuMs ?? null, fps, playing: true },
        limit,
      ),
    );
  }
  return changes;
};

describe("adaptive performance plan", () => {
  it("leaves settings untouched at level zero", () => {
    const p = plan({ ...DEFAULTS, algorithm: "anime4k", quality: "quality" }, 0);
    expect(p.settings.quality).toBe("quality");
    expect(p.workScale).toBe(1);
    expect(p.note).toBe("");
  });
  it("steps quality, then size, then engine, cheapest loss first", () => {
    const saved = { ...DEFAULTS, algorithm: "fsrcnnx" as const, quality: "quality" as const, maxHeight: 1440 };
    expect(plan(saved, 1).settings.quality).toBe("balanced");
    const two = plan(saved, 2);
    expect(two.settings.quality).toBe("balanced");
    expect(two.settings.maxHeight).toBe(1080);
    expect(two.workScale).toBe(0.75);
    const three = plan(saved, 3);
    expect(three.settings.algorithm).toBe("spatial");
    expect(three.note).toContain("Adaptive: Spatial Detail");
  });
  it("skips steps that would change nothing and reports the reachable maximum", () => {
    const light = { ...DEFAULTS, algorithm: "spatial" as const, quality: "fast" as const };
    expect(maxLevel(light)).toBe(1);
    expect(plan(light, 3).applied).toBe(1);
    expect(maxLevel({ ...DEFAULTS, algorithm: "anime4k", quality: "quality" })).toBe(3);
  });
  it("battery saver applies fast quality and a 1080p limit without using a level", () => {
    const p = plan({ ...DEFAULTS, quality: "quality", maxHeight: 2160 }, 0, true);
    expect(p.settings.quality).toBe("fast");
    expect(p.settings.maxHeight).toBe(1080);
    expect(p.note).toBe("Battery saver");
    expect(p.applied).toBe(0);
  });
});

describe("governor", () => {
  it("needs two consecutive overloaded windows before stepping down", () => {
    const g = new Governor();
    expect(run(g, [{ decoded: 40, dropped: 20 }, { decoded: 58, dropped: 2 }, { decoded: 40, dropped: 20 }])).toEqual([false, false, false]);
    expect(g.level).toBe(0);
    expect(run(new Governor(), [{ decoded: 40, dropped: 20 }, { decoded: 40, dropped: 20 }])).toEqual([false, true]);
  });
  it("treats GPU time near the frame budget as overload", () => {
    const g = new Governor();
    run(g, [{ decoded: 60, dropped: 0, gpuMs: 31 }, { decoded: 60, dropped: 0, gpuMs: 31 }]);
    expect(g.level).toBe(1);
  });
  it("cools down after a change and never exceeds the limit", () => {
    const g = new Governor();
    const heavy = Array.from({ length: 12 }, () => ({ decoded: 30, dropped: 30 }));
    run(g, heavy, 2);
    expect(g.level).toBe(2);
  });
  it("ignores paused video and tiny samples", () => {
    const g = new Governor();
    g.observe({ now: 0, decoded: 0, dropped: 0, gpuMs: null, fps: 30, playing: true }, 3);
    for (let i = 1; i < 6; i++)
      g.observe({ now: i * 2100, decoded: i * 2, dropped: i * 5, gpuMs: null, fps: 30, playing: true }, 3);
    expect(g.level).toBe(0);
    for (let i = 6; i < 12; i++)
      g.observe({ now: i * 2100, decoded: i * 30, dropped: i * 30, gpuMs: null, fps: 30, playing: false }, 3);
    expect(g.level).toBe(0);
  });
});
