import {
  mergeConfiguration,
  normalizeConfiguration,
  normalizePreferences,
  siteOrigin,
  type Configuration,
  type Settings,
  type SiteProfile,
} from "../shared/settings";
import { readConfiguration, writeConfiguration } from "../shared/storage";
import type { PlayerStatus } from "../shared/player-status";
export const isExtension = !!globalThis.chrome?.runtime?.id;
export const VERSION: string = isExtension
  ? chrome.runtime.getManifest().version
  : __APP_VERSION__;
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
  // Interface preview outside the extension: keep the same shapes in localStorage.
  const config = await readConfiguration();
  let next = config;
  if (type === "defaults")
    next = { ...config, defaults: params.settings as Settings };
  if (type === "presets")
    next = { ...config, presets: params.presets as Configuration["presets"] };
  if (type === "preferences")
    next = {
      ...config,
      preferences: normalizePreferences({
        ...config.preferences,
        ...(params.patch as object),
      }),
    };
  if (type === "import") {
    const incoming = normalizeConfiguration(params.config);
    next =
      params.mode === "replace"
        ? { ...incoming, preferences: config.preferences }
        : mergeConfiguration(config, incoming);
  }
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
export interface Tab {
  id?: number;
  url?: string;
  title?: string;
}
export async function currentTab(): Promise<Tab> {
  if (!isExtension) return {};
  try {
    const source = Number(new URLSearchParams(location.search).get("tab"));
    if (source > 0) return await chrome.tabs.get(source);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    // The settings page itself is not a video tab.
    if (tab?.url?.startsWith(chrome.runtime.getURL(""))) return {};
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
/** Sends a per-frame action (for example "original") to every frame of a tab. */
export async function tabAction(tabId: number | undefined, action: string, value?: unknown) {
  if (!isExtension || tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "webscaly:action", action, value });
  } catch {
    /* The tab has no player script. */
  }
}
export async function shortcuts(): Promise<Record<string, string>> {
  if (!isExtension || !chrome.commands) return {};
  const commands = await chrome.commands.getAll();
  return Object.fromEntries(
    commands.filter((c) => c.name).map((c) => [c.name!, c.shortcut ?? ""]),
  );
}
export function openShortcutSettings() {
  if (isExtension)
    void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}
