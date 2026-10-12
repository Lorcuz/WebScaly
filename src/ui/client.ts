import {
  hostPattern,
  normalizeConfiguration,
  siteOrigin,
  type Configuration,
  type Settings,
  type SiteProfile,
} from "../shared/settings";
import { readConfiguration, writeConfiguration } from "../shared/storage";
import type { Diagnostics } from "../core/overlay";
import type { PlayerStatus } from "../shared/player-status";
export const isExtension = !!globalThis.chrome?.runtime?.id;
export async function request(
  type: string,
  params: Record<string, unknown> = {},
): Promise<Configuration> {
  if (isExtension) {
    const result = await chrome.runtime.sendMessage({
      type: `webscaly:${type}`,
      ...params,
    });
    if (!result?.ok)
      throw new Error(result?.error ?? "Reload the extension and this page.");
    return result.value;
  }
  const config = await readConfiguration();
  let next = config;
  if (type === "defaults")
    next = { ...config, defaults: params.settings as Settings };
  if (type === "presets")
    next = { ...config, presets: params.presets as Configuration["presets"] };
  if (type === "import") next = normalizeConfiguration(params.config);
  if (type === "remove")
    next = {
      ...config,
      sites: config.sites.filter((s) => s.origin !== params.origin),
    };
  if (type === "site")
    next = {
      ...config,
      sites: config.sites.map((s) =>
        s.origin === params.origin
          ? {
              ...s,
              settings: params.patch
                ? { ...s.settings, ...(params.patch as Partial<Settings>) }
                : (params.settings as Settings),
            }
          : s,
      ),
    };
  await writeConfiguration(next);
  return next;
}
export async function approveSite(
  url: string,
  subdomains: boolean,
  settings: Settings,
): Promise<Configuration> {
  if (!isExtension)
    throw new Error(
      "Website access requires the installed extension. This is an interface preview.",
    );
  const site: SiteProfile = { origin: siteOrigin(url), subdomains, settings };
  return request("approve", site as unknown as Record<string, unknown>);
}
export async function currentTab(): Promise<{
  id?: number;
  url?: string;
  title?: string;
}> {
  if (!isExtension) return {};
  try {
    const source = Number(new URLSearchParams(location.search).get("tab"));
    if (source > 0) return await chrome.tabs.get(source);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab ?? {};
  } catch {
    return {};
  }
}
export async function tabDiagnostics(
  tabId?: number,
): Promise<PlayerStatus | null> {
  if (!isExtension || tabId === undefined) return null;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "webscaly:tab-status",
      tabId,
    });
    return result?.ok ? result.value : null;
  } catch {
    return null;
  }
}
