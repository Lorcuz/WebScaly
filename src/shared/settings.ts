import { getDomain } from "tldts";
import {
  EMPTY,
  normalizePreferences,
  normalizeSettings,
  siteOrigin,
  type Configuration,
  type SiteProfile,
} from "./settings-core";
export * from "./settings-core";

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
  const presets: Configuration["presets"] = [];
  for (const p of (Array.isArray(value.presets) ? value.presets : []).slice(
    0,
    30,
  )) {
    if (!p || typeof p.name !== "string" || !p.name.trim()) continue;
    const name = p.name.trim().slice(0, 50);
    if (!presets.some((q) => q.name === name))
      presets.push({ name, settings: migrate(p.settings) });
  }
  return {
    version: 2,
    defaults: migrate(value.defaults),
    sites,
    presets,
    preferences: normalizePreferences(value.preferences),
  };
}
/** Adds or updates sites and presets from an import without removing anything already approved. */
export function mergeConfiguration(
  current: Configuration,
  incoming: Configuration,
): Configuration {
  const sites = current.sites.map(
    (s) => incoming.sites.find((i) => i.origin === s.origin) ?? s,
  );
  for (const site of incoming.sites)
    if (!sites.some((s) => s.origin === site.origin)) sites.push(site);
  const presets = current.presets.map(
    (p) => incoming.presets.find((i) => i.name === p.name) ?? p,
  );
  for (const preset of incoming.presets)
    if (!presets.some((p) => p.name === preset.name)) presets.push(preset);
  return normalizeConfiguration({
    ...current,
    defaults: incoming.defaults,
    sites,
    presets,
  });
}
