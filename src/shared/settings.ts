export type Algorithm = "spatial" | "anime4k" | "fsrcnnx";
export type Quality = "fast" | "balanced" | "quality";
export interface Settings {
  enabled: boolean;
  algorithm: Algorithm;
  quality: Quality;
  scale: "auto" | "native" | "1.5" | "2";
  maxHeight: number;
  strength: number;
  denoise: number;
  hud: boolean;
  comparison: boolean;
  split: number;
  controls: boolean;
}
export interface SiteProfile {
  origin: string;
  subdomains: boolean;
  settings: Settings;
}
export interface Configuration {
  version: 2;
  defaults: Settings;
  sites: SiteProfile[];
  presets: { name: string; settings: Settings }[];
}
export const DEFAULTS: Settings = {
  enabled: true,
  algorithm: "spatial",
  quality: "balanced",
  scale: "auto",
  maxHeight: 1080,
  strength: 0.35,
  denoise: 0.12,
  hud: false,
  comparison: false,
  split: 0.5,
  controls: false,
};
export const EMPTY: Configuration = {
  version: 2,
  defaults: DEFAULTS,
  sites: [],
  presets: [],
};
const choices = <T extends string>(
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
    algorithm: choices(
      s.algorithm,
      ["spatial", "anime4k", "fsrcnnx"],
      DEFAULTS.algorithm,
    ),
    quality: choices(
      s.quality,
      ["fast", "balanced", "quality"],
      DEFAULTS.quality,
    ),
    scale: choices(s.scale, ["auto", "native", "1.5", "2"], DEFAULTS.scale),
    maxHeight: Math.round(bounded(s.maxHeight, 240, 2160, DEFAULTS.maxHeight)),
    strength: bounded(s.strength, 0, 1, DEFAULTS.strength),
    denoise: bounded(s.denoise, 0, 1, DEFAULTS.denoise),
    hud: flag(s.hud, false),
    comparison: flag(s.comparison, false),
    split: bounded(s.split, 0, 1, 0.5),
    controls: flag(s.controls, false),
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
export function hostPattern(
  site: Pick<SiteProfile, "origin" | "subdomains">,
): string {
  const url = new URL(siteOrigin(site.origin));
  if (
    site.subdomains &&
    !getDomain(url.hostname, { allowPrivateDomains: true })
  )
    throw new Error("Subdomains require a registrable website domain.");
  const prefix =
    site.subdomains &&
    !url.hostname.startsWith("[") &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      ? "*."
      : "";
  return `${url.protocol}//${prefix}${url.hostname}/*`;
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
  config: Configuration,
): SiteProfile | undefined {
  return (
    config.sites.find((s) => !s.subdomains && matchesSite(url, s)) ??
    config.sites.find((s) => matchesSite(url, s))
  );
}
export function normalizeConfiguration(input: unknown): Configuration {
  if (!input || typeof input !== "object") return structuredClone(EMPTY);
  const value = input as Omit<Partial<Configuration>, "version"> & {
    version?: number;
  };
  if (value.version !== 1 && value.version !== 2)
    throw new Error("Unsupported configuration version.");
  const migrate = (s: unknown) => ({
    ...normalizeSettings(s),
    ...(value.version === 1
      ? { controls: false, comparison: false, hud: false }
      : {}),
  });
  const sites: SiteProfile[] = [];
  for (const site of (Array.isArray(value.sites) ? value.sites : []).slice(
    0,
    200,
  )) {
    try {
      const origin = siteOrigin(site.origin);
      const profile = {
        origin,
        subdomains: site.subdomains === true,
        settings: migrate(site.settings),
      };
      hostPattern(profile);
      if (!sites.some((s) => s.origin === origin)) sites.push(profile);
    } catch {
      /* Ignore invalid imported sites. */
    }
  }
  return {
    version: 2,
    defaults: migrate(value.defaults),
    sites,
    presets: (Array.isArray(value.presets) ? value.presets : [])
      .slice(0, 30)
      .filter((p) => p && typeof p.name === "string")
      .map((p) => ({
        name: p.name.slice(0, 50),
        settings: migrate(p.settings),
      })),
  };
}
import { getDomain } from "tldts";
