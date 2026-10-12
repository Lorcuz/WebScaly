import type { Settings } from "../shared/settings";

export class FpsEstimator {
  private intervals: number[] = [];
  private last: number | null = null;
  observe(mediaTime: number): number {
    if (this.last !== null) {
      const delta = mediaTime - this.last;
      if (delta > 0.003 && delta < 0.2) {
        this.intervals.push(delta);
        if (this.intervals.length > 45) this.intervals.shift();
      } else if (delta < 0 || delta > 0.3) this.reset();
    }
    this.last = mediaTime;
    return this.fps;
  }
  get fps(): number {
    if (this.intervals.length < 3) return 0;
    const ordered = [...this.intervals].sort((a, b) => a - b);
    return 1 / ordered[Math.floor(ordered.length / 2)];
  }
  reset() {
    this.intervals = [];
    this.last = null;
  }
}
export class RateCounter {
  private stamps: number[] = [];
  add(now: number) {
    this.stamps.push(now);
    this.trim(now);
  }
  private trim(now: number) {
    while (this.stamps.length && this.stamps[0] < now - 1500)
      this.stamps.shift();
  }
  value(now: number): number {
    this.trim(now);
    return this.stamps.length < 2
      ? 0
      : ((this.stamps.length - 1) * 1000) / Math.max(1, now - this.stamps[0]);
  }
  reset() {
    this.stamps = [];
  }
}
export function outputSize(
  width: number,
  height: number,
  displayHeight: number,
  s: Settings,
  maxDimension = 4096,
): [number, number] {
  const factor =
    s.scale === "auto"
      ? Math.max(1, displayHeight / height)
      : s.scale === "native"
        ? 1
        : Number(s.scale);
  const ratio = Math.min(
    factor,
    s.maxHeight / height,
    maxDimension / width,
    maxDimension / height,
  );
  return [
    Math.max(1, Math.round(width * ratio)),
    Math.max(1, Math.round(height * ratio)),
  ];
}
