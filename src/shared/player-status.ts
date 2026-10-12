import type { Diagnostics } from "../core/overlay";
export interface PlayerStatus {
  videos: number;
  hiddenVideos?: number;
  renderers: Diagnostics[];
  embeds: { origin: string; approved: boolean }[];
  frames: { frameId: number; origin: string; videos: number }[];
}
