import {
  QUALITY_LABELS,
  type Quality,
  type Settings,
} from "../shared/settings-core";

/** Effective processing for one renderer after runtime constraints. */
export interface Plan {
  settings: Settings;
  /** Extra multiplier for the working surface (neural input) size. */
  workScale: number;
  /** Human-readable reason when the plan is lighter than the saved settings. */
  note: string;
}
const lighter: Record<Quality, Quality> = {
  quality: "balanced",
  balanced: "fast",
  fast: "fast",
};
type Step = (s: Settings, plan: Plan) => string | null;
// Each step trades a little picture for a lot of GPU time, cheapest loss first.
const STEPS: Step[] = [
  (s) => {
    if (s.quality === "fast") return null;
    s.quality = lighter[s.quality];
    return `${QUALITY_LABELS[s.quality]} quality`;
  },
  (s, plan) => {
    plan.workScale *= 0.75;
    s.maxHeight = Math.max(360, Math.round(s.maxHeight * 0.75));
    return `${s.maxHeight}p limit`;
  },
  (s) => {
    if (s.algorithm === "spatial") return null;
    s.algorithm = "spatial";
    return "Spatial Detail";
  },
];
/** Applies `level` load reductions and, optionally, battery saving to saved settings. */
export function plan(
  saved: Settings,
  level: number,
  battery = false,
): Plan & { applied: number } {
  const settings = { ...saved };
  const result = { settings, workScale: 1, note: "", applied: 0 };
  const notes: string[] = [];
  if (battery) {
    if (settings.quality !== "fast") settings.quality = "fast";
    settings.maxHeight = Math.min(settings.maxHeight, 1080);
    notes.push("Battery saver");
  }
  for (const step of STEPS) {
    if (result.applied >= level) break;
    const note = step(settings, result);
    if (note) {
      notes.push(note);
      result.applied++;
    }
  }
  if (result.applied) notes[notes.length - 1] = `Adaptive: ${notes.at(-1)}`;
  result.note = notes.join(" · ");
  return result;
}
/** Highest level that still changes something for these settings. */
export function maxLevel(saved: Settings, battery = false): number {
  return plan(saved, STEPS.length, battery).applied;
}

export interface Sample {
  now: number;
  decoded: number;
  dropped: number;
  gpuMs: number | null;
  fps: number;
  playing: boolean;
}
/**
 * Watches 2-second windows of decoded/skipped frames and GPU time. Two overloaded
 * windows in a row raise the level by one; a cooldown follows every change so the
 * restart itself is not mistaken for overload. Levels only rise until reset, which
 * avoids oscillating between settings while a video plays.
 */
export class Governor {
  level = 0;
  private strikes = 0;
  private start = 0;
  private decoded = 0;
  private dropped = 0;
  private cooldown = 0;
  constructor(
    private readonly window = 2000,
    private readonly threshold = 0.15,
  ) {}
  reset() {
    this.level = 0;
    this.settle(0);
  }
  /** Ignore measurements until `now + delay` (after a pipeline restart). */
  settle(now: number, delay = 0) {
    this.strikes = 0;
    this.start = 0;
    this.cooldown = now + delay;
  }
  observe(sample: Sample, limit: number): boolean {
    if (!sample.playing || sample.now < this.cooldown) {
      this.start = 0;
      this.strikes = sample.playing ? this.strikes : 0;
      return false;
    }
    if (!this.start) {
      this.start = sample.now;
      this.decoded = sample.decoded;
      this.dropped = sample.dropped;
      return false;
    }
    if (sample.now - this.start < this.window) return false;
    const decoded = sample.decoded - this.decoded,
      dropped = sample.dropped - this.dropped;
    this.start = sample.now;
    this.decoded = sample.decoded;
    this.dropped = sample.dropped;
    if (decoded + dropped < 8) return false;
    const budget = sample.fps > 0 ? 1000 / sample.fps : 0,
      overloaded =
        dropped / (decoded + dropped) > this.threshold ||
        (sample.gpuMs !== null && budget > 0 && sample.gpuMs > budget * 0.85);
    this.strikes = overloaded ? this.strikes + 1 : 0;
    if (this.strikes < 2 || this.level >= limit) return false;
    this.level++;
    this.settle(sample.now, 3000);
    return true;
  }
}
