// Settings model shared by every context. Kept free of the public-suffix list
// so the content script bundle stays small; scope helpers live in settings.ts.
export type Algorithm = "spatial" | "anime4k" | "fsrcnnx";
export type Quality = "fast" | "balanced" | "quality";
export type Scale = "auto" | "native" | "1.5" | "2";
export type SkipAbove = 0 | 720 | 1080 | 1440;
export interface Settings {
  enabled: boolean;
  algorithm: Algorithm;
  quality: Quality;
  scale: Scale;
  maxHeight: number;
  strength: number;
  denoise: number;
  deband: number;
  vibrance: number;
  contrast: number;
  brightness: number;
  skipAbove: SkipAbove;
  adaptive: boolean;
  hud: boolean;
  comparison: boolean;
  split: number;
  controls: boolean;
}
export interface Preferences {
  paused: boolean;
  batterySaver: boolean;
  welcomed: boolean;
}
export interface SiteProfile {
  origin: string;
  subdomains: boolean;
  settings: Settings;
}
export interface Preset {
  name: string;
  settings: Settings;
}
export interface Configuration {
  version: 2;
  defaults: Settings;
  sites: SiteProfile[];
  presets: Preset[];
  preferences: Preferences;
}
export const ALGORITHMS: readonly Algorithm[] = ["spatial", "anime4k", "fsrcnnx"];
export const QUALITIES: readonly Quality[] = ["fast", "balanced", "quality"];
export const SCALES: readonly Scale[] = ["auto", "native", "1.5", "2"];
export const SKIP_LEVELS: readonly SkipAbove[] = [0, 720, 1080, 1440];
export const ALGORITHM_LABELS: Record<Algorithm, string> = {
  spatial: "Spatial Detail",
  anime4k: "Anime4K",
  fsrcnnx: "FSRCNNX",
};
export const QUALITY_LABELS: Record<Quality, string> = {
  fast: "Fast",
  balanced: "Balanced",
  quality: "Quality",
};
export const DEFAULTS: Settings = {
  enabled: true,
  algorithm: "spatial",
  quality: "balanced",
  scale: "auto",
  maxHeight: 1080,
  strength: 0.35,
  denoise: 0.12,
  deband: 0,
  vibrance: 0,
  contrast: 0,
  brightness: 0,
  skipAbove: 0,
  adaptive: true,
  hud: false,
  comparison: false,
  split: 0.5,
  controls: false,
};
export const PREFERENCES: Preferences = {
  paused: false,
  batterySaver: false,
  welcomed: false,
};
export const EMPTY: Configuration = {
  version: 2,
  defaults: DEFAULTS,
  sites: [],
  presets: [],
  preferences: PREFERENCES,
};
/** Picture keys describe how video looks; presets never change player tools or activation. */
export const PICTURE_KEYS = [
  "algorithm",
  "quality",
  "scale",
  "maxHeight",
  "strength",
  "denoise",
  "deband",
  "vibrance",
  "contrast",
  "brightness",
] as const satisfies readonly (keyof Settings)[];
export type Picture = Pick<Settings, (typeof PICTURE_KEYS)[number]>;
export function pictureOf(settings: Partial<Settings>): Partial<Picture> {
  const picture: Partial<Picture> = {};
  for (const key of PICTURE_KEYS)
    if (settings[key] !== undefined)
      (picture as Record<string, unknown>)[key] = settings[key];
  return picture;
}
export const BUILTIN_PRESETS: readonly {
  id: string;
  name: string;
  description: string;
  picture: Picture;
}[] = [
  {
    id: "anime",
    name: "Anime",
    description: "Clean line art and flat colour; smooths banding.",
    picture: {
      algorithm: "anime4k",
      quality: "balanced",
      scale: "auto",
      maxHeight: 1440,
      strength: 0.15,
      denoise: 0.1,
      deband: 0.35,
      vibrance: 0.1,
      contrast: 0,
      brightness: 0,
    },
  },
  {
    id: "live",
    name: "Live action",
    description: "Learned detail for film and camera footage.",
    picture: {
      algorithm: "fsrcnnx",
      quality: "balanced",
      scale: "auto",
      maxHeight: 1440,
      strength: 0.3,
      denoise: 0.12,
      deband: 0.15,
      vibrance: 0,
      contrast: 0,
      brightness: 0,
    },
  },
  {
    id: "rescue",
    name: "Low-res rescue",
    description: "Stronger cleanup for old or heavily compressed uploads.",
    picture: {
      algorithm: "fsrcnnx",
      quality: "quality",
      scale: "auto",
      maxHeight: 1080,
      strength: 0.45,
      denoise: 0.3,
      deband: 0.3,
      vibrance: 0.05,
      contrast: 0.05,
      brightness: 0,
    },
  },
  {
    id: "battery",
    name: "Battery friendly",
    description: "Light spatial detail with a 1080p limit.",
    picture: {
      algorithm: "spatial",
      quality: "fast",
      scale: "auto",
      maxHeight: 1080,
      strength: 0.3,
      denoise: 0,
      deband: 0,
      vibrance: 0,
      contrast: 0,
      brightness: 0,
    },
  },
];
const choices = <T extends string | number>(
  x: unknown,
  valid: readonly T[],
  fallback: T,
): T => (valid.includes(x as T) ? (x as T) : fallback);
const bounded = (x: unknown, min: number, max: number, fallback: number) =>
  typeof x === "number" && Number.isFinite(x)
    ? Math.max(min, Math.min(max, x))
    : fallback;
const flag = (x: unknown, fallback: boolean) =>
  typeof x === "boolean" ? x : fallback;
export function normalizeSettings(input: unknown): Settings {
  const s =
    input && typeof input === "object" ? (input as Partial<Settings>) : {};
  return {
    enabled: flag(s.enabled, DEFAULTS.enabled),
    algorithm: choices(s.algorithm, ALGORITHMS, DEFAULTS.algorithm),
    quality: choices(s.quality, QUALITIES, DEFAULTS.quality),
    scale: choices(s.scale, SCALES, DEFAULTS.scale),
    maxHeight: Math.round(bounded(s.maxHeight, 240, 2160, DEFAULTS.maxHeight)),
    strength: bounded(s.strength, 0, 1, DEFAULTS.strength),
    denoise: bounded(s.denoise, 0, 1, DEFAULTS.denoise),
    deband: bounded(s.deband, 0, 1, DEFAULTS.deband),
    vibrance: bounded(s.vibrance, -1, 1, DEFAULTS.vibrance),
    contrast: bounded(s.contrast, -1, 1, DEFAULTS.contrast),
    brightness: bounded(s.brightness, -1, 1, DEFAULTS.brightness),
    skipAbove: choices(s.skipAbove, SKIP_LEVELS, DEFAULTS.skipAbove),
    adaptive: flag(s.adaptive, DEFAULTS.adaptive),
    hud: flag(s.hud, false),
    comparison: flag(s.comparison, false),
    split: bounded(s.split, 0, 1, 0.5),
    controls: flag(s.controls, false),
  };
}
export function normalizePreferences(input: unknown): Preferences {
  const p =
    input && typeof input === "object" ? (input as Partial<Preferences>) : {};
  return {
    paused: flag(p.paused, false),
    batterySaver: flag(p.batterySaver, false),
    welcomed: flag(p.welcomed, false),
  };
}
export function siteOrigin(input: string): string {
  const url = new URL(input);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.includes("*")
  )
    throw new Error("Use a specific HTTP or HTTPS website.");
  return `${url.protocol}//${url.hostname}`;
}
export function matchesSite(urlString: string, site: SiteProfile): boolean {
  try {
    const url = new URL(urlString),
      approved = new URL(site.origin);
    return (
      url.protocol === approved.protocol &&
      (url.hostname === approved.hostname ||
        (site.subdomains && url.hostname.endsWith(`.${approved.hostname}`)))
    );
  } catch {
    return false;
  }
}
export function profileFor(
  url: string,
  config: Pick<Configuration, "sites">,
): SiteProfile | undefined {
  return (
    config.sites.find((s) => !s.subdomains && matchesSite(url, s)) ??
    config.sites.find((s) => matchesSite(url, s))
  );
}
export function hostLabel(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}
