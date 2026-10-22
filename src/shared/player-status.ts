export type RendererState =
  | "idle"
  | "loading"
  | "waiting"
  | "active"
  | "disabled"
  | "paused"
  | "skipped"
  | "unavailable";
export interface Diagnostics {
  state: RendererState;
  message: string;
  /** Engine actually running (may differ from the request after a fallback). */
  algorithm: string;
  quality?: string;
  sourceFps: number;
  outputFps: number;
  gpuMs: number | null;
  dropped: number;
  decoded: number;
  resolution: string;
  source?: [number, number];
  output?: [number, number];
  backend?: string;
  /** Present when adaptive performance or battery saver reduced the load. */
  adaptive?: string;
  /** Content-type estimate used for engine suggestions; never switches engines itself. */
  hint?: "animation" | "live" | "";
  controlsAvailable?: boolean;
}
export interface PlayerStatus {
  videos: number;
  hiddenVideos?: number;
  renderers: Diagnostics[];
  embeds: { origin: string; approved: boolean }[];
  frames: { frameId: number; origin: string; videos: number; renderers?: number }[];
  paused?: boolean;
}
