import {
  hostPattern,
  normalizeConfiguration,
  normalizeSettings,
  profileFor,
  siteOrigin,
  type Configuration,
  type SiteProfile,
} from "../shared/settings";
import { permissionCovers, type ApprovalIntent } from "../shared/permissions";
import {
  readConfiguration,
  writeConfiguration,
  STORAGE_KEY,
} from "../shared/storage";
import type { PlayerStatus } from "../shared/player-status";
const PENDING = "webscalyApprovalIntents",
  FRAMES = "webscalyFrames";
let queue = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
const approving = new Map<string, Promise<Configuration>>();
const activeIntents = new Set<string>();
const cancelled = new Set<string>();
async function invalidate() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined)
      .map(async (t) => {
        try {
          await chrome.tabs.sendMessage(t.id!, { type: "webscaly:invalidate" });
        } catch {}
      }),
  );
}
async function intents(): Promise<Record<string, ApprovalIntent>> {
  return (
    ((await chrome.storage.session.get(PENDING))[PENDING] as Record<
      string,
      ApprovalIntent
    >) ?? {}
  );
}
async function storeIntent(intent: ApprovalIntent) {
  const pending = await intents();
  pending[intent.id] = intent;
  await chrome.storage.session.set({ [PENDING]: pending });
}
async function clearIntent(id: string) {
  const pending = await intents();
  delete pending[id];
  await chrome.storage.session.set({ [PENDING]: pending });
}
async function granted(site: SiteProfile) {
  return chrome.permissions.contains({ origins: [hostPattern(site)] });
}
async function reconcile(config: Configuration) {
  const desired: chrome.scripting.RegisteredContentScript[] = [];
  for (const [index, site] of config.sites.entries())
    if (await granted(site))
      desired.push({
        id: `webscaly-${index}`,
        matches: [hostPattern(site)],
        js: ["content.js"],
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_idle",
        persistAcrossSessions: true,
        world: "ISOLATED",
      });
  const existing = (
    await chrome.scripting.getRegisteredContentScripts()
  ).filter((s) => s.id.startsWith("webscaly-"));
  const changed =
    JSON.stringify(
      existing.map((s) => [s.id, s.matches, s.matchOriginAsFallback]).sort(),
    ) !==
    JSON.stringify(
      desired.map((s) => [s.id, s.matches, s.matchOriginAsFallback]).sort(),
    );
  if (changed) {
    if (existing.length)
      await chrome.scripting.unregisterContentScripts({
        ids: existing.map((s) => s.id),
      });
    if (desired.length) await chrome.scripting.registerContentScripts(desired);
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined)
      .map(async (tab) => {
        // This broadcast invalidates existing renderers before any asynchronous authorization check.
        try {
          await chrome.tabs.sendMessage(tab.id!, { type: "webscaly:refresh" });
        } catch {}
        if (changed && tab.url && profileFor(tab.url, config))
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id!, allFrames: true },
              files: ["content.js"],
            });
          } catch {
            /* A restricted frame keeps native playback. */
          }
      }),
  );
}
async function update(
  mutator: (c: Configuration) => Configuration,
  stop = false,
) {
  if (stop) await invalidate();
  const next = normalizeConfiguration(mutator(await readConfiguration()));
  await writeConfiguration(next);
  await reconcile(next);
  return next;
}
async function finishIntent(intent: ApprovalIntent, settled = false) {
  if (cancelled.has(intent.id) || intent.cancelled) {
    const c = await readConfiguration();
    const hasGrant = await granted(intent);
    if (
      hasGrant &&
      !c.sites.some((s) => hostPattern(s) === hostPattern(intent))
    )
      await chrome.permissions.remove({ origins: [hostPattern(intent)] });
    if (hasGrant || settled) await clearIntent(intent.id);
    return c;
  }
  const site = {
    origin: intent.origin,
    subdomains: intent.subdomains,
    settings: normalizeSettings(intent.settings),
  };
  // Keep an ungranted intent: a restarted worker cannot know if Chrome's prompt is still open.
  if (!(await granted(site))) {
    if (settled) await clearIntent(intent.id);
    return readConfiguration();
  }
  const next = await update((c) => ({
    ...c,
    sites: [
      ...c.sites.filter((s) => s.origin !== site.origin),
      {
        ...site,
        settings:
          c.sites.find((s) => s.origin === site.origin)?.settings ??
          site.settings,
      },
    ],
  }));
  await clearIntent(intent.id);
  return next;
}
async function recover() {
  for (const intent of Object.values(await intents())) {
    if (activeIntents.has(intent.id)) continue;
    if (
      typeof intent.origin !== "string" ||
      !Number.isFinite(intent.created) ||
      Date.now() - intent.created > 86400000
    ) {
      await clearIntent(intent.id);
      continue;
    }
    try {
      await finishIntent(intent);
    } catch {
      await clearIntent(intent.id);
    }
  }
}
async function authorized(
  sender: chrome.runtime.MessageSender,
): Promise<SiteProfile | null> {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab?.id === undefined ||
    sender.origin === "null"
  )
    return null;
  const frameUrl =
    sender.url && /^https?:\/\//.test(sender.url)
      ? sender.url
      : sender.origin && /^https?:\/\//.test(sender.origin)
        ? sender.origin
        : "";
  if (!frameUrl) return null;
  const c = await readConfiguration();
  const own = profileFor(frameUrl, c);
  const tab = await chrome.tabs.get(sender.tab.id),
    parent = profileFor(tab.url ?? (sender.frameId === 0 ? frameUrl : ""), c);
  if (!own || !parent || !(await granted(parent)) || !(await granted(own)))
    return null;
  const registry =
    ((await chrome.storage.session.get(FRAMES))[FRAMES] as Record<
      number,
      Record<number, string>
    >) ?? {};
  const known = registry[sender.tab.id] ?? {};
  known[sender.frameId ?? 0] = siteOrigin(frameUrl);
  registry[sender.tab.id] = known;
  await chrome.storage.session.set({ [FRAMES]: registry });
  return own;
}
async function tabStatus(tabId: number): Promise<PlayerStatus> {
  const registry =
      ((await chrome.storage.session.get(FRAMES))[FRAMES] as Record<
        number,
        Record<number, string>
      >) ?? {},
    known = registry[tabId] ?? {};
  const result: PlayerStatus = {
      videos: 0,
      hiddenVideos: 0,
      renderers: [],
      embeds: [],
      frames: [],
    },
    origins = new Set<string>(),
    config = await readConfiguration();
  await Promise.all(
    [...new Set([0, ...Object.keys(known).map(Number)])].map(
      async (frameId) => {
        try {
          const s = await chrome.tabs.sendMessage(
            tabId,
            { type: "webscaly:status" },
            { frameId },
          );
          result.videos += s.videos ?? 0;
          result.hiddenVideos! += s.hiddenVideos ?? 0;
          result.renderers.push(...(s.renderers ?? []));
          result.frames.push({
            frameId,
            origin: s.origin ?? known[frameId] ?? "",
            videos: s.videos ?? 0,
          });
          for (const origin of s.embeds ?? []) origins.add(siteOrigin(origin));
        } catch {}
      },
    ),
  );
  for (const origin of origins) {
    const site = profileFor(origin, config);
    result.embeds.push({ origin, approved: !!site && (await granted(site)) });
  }
  return result;
}
const trustedPages = new Set(["popup.html", "options.html"]);
function page(sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return "";
  try {
    const url = new URL(sender.url);
    return url.protocol === "chrome-extension:" &&
      url.hostname === chrome.runtime.id
      ? url.pathname.slice(1)
      : "";
  } catch {
    return "";
  }
}
chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
  const m = message as Record<string, unknown>;
  if (!m || typeof m.type !== "string" || !m.type.startsWith("webscaly:"))
    return;
  const path = page(sender),
    trusted = trustedPages.has(path),
    content = !path && sender.id === chrome.runtime.id && !!sender.tab;
  // permissions.request MUST start in this synchronous message turn, before promises or storage work.
  if (m.type === "webscaly:approve") {
    try {
      if (!trusted || typeof m.origin !== "string")
        throw new Error("Invalid approval request.");
      const site = {
          origin: siteOrigin(m.origin),
          subdomains: m.subdomains === true,
          settings: normalizeSettings(m.settings),
        },
        scope = hostPattern(site);
      let operation = approving.get(scope);
      if (!operation) {
        const intent: ApprovalIntent = {
          ...site,
          id: crypto.randomUUID(),
          created: Date.now(),
        };
        activeIntents.add(intent.id);
        const permission = chrome.permissions.request({ origins: [scope] });
        const stored = serialize(() => storeIntent(intent));
        operation = (async () => {
          try {
            const allowed = await permission;
            await stored;
            return await serialize(async () => {
              if (!allowed) {
                await clearIntent(intent.id);
                throw new Error("Website access was declined.");
              }
              return finishIntent(intent, true);
            });
          } catch (e) {
            await stored;
            await serialize(() => clearIntent(intent.id));
            throw e;
          } finally {
            activeIntents.delete(intent.id);
            approving.delete(scope);
            cancelled.delete(intent.id);
          }
        })();
        approving.set(scope, operation);
      }
      void operation.then(
        (value) => reply({ ok: true, value }),
        (e) => reply({ ok: false, error: (e as Error).message }),
      );
    } catch (e) {
      reply({ ok: false, error: (e as Error).message });
    }
    return true;
  }
  const operation = async () => {
    if (m.type === "webscaly:ping") return { ok: true };
    if (m.type === "webscaly:authorized")
      return content ? authorized(sender) : null;
    if (m.type === "webscaly:tab-status") {
      if (!trusted || typeof m.tabId !== "number")
        throw new Error("Settings page required.");
      return tabStatus(m.tabId);
    }
    if (m.type === "webscaly:viewer-config") {
      if (path !== "viewer.html" || typeof m.tabId !== "number")
        throw new Error("Compatibility player required.");
      const tab = await chrome.tabs.get(m.tabId),
        site = tab.url ? profileFor(tab.url, await readConfiguration()) : null;
      if (!site || !(await granted(site)))
        throw new Error("Source website access is unavailable.");
      return { origin: site.origin, settings: site.settings };
    }
    if (m.type === "webscaly:read") {
      if (!trusted) throw new Error("Settings page required.");
      return readConfiguration();
    }
    if (m.type === "webscaly:removal-impact") {
      if (!trusted || typeof m.origin !== "string")
        throw new Error("Invalid site request.");
      const origin = siteOrigin(m.origin);
      return (
        (await chrome.permissions.getAll()).origins?.filter((p) =>
          permissionCovers(p, origin),
        ) ?? []
      );
    }
    if (m.type === "webscaly:remove") {
      if (!trusted || typeof m.origin !== "string")
        throw new Error("Invalid site request.");
      const origin = siteOrigin(m.origin);
      const pending = await intents();
      for (const intent of Object.values(pending))
        if (permissionCovers(hostPattern(intent), origin)) {
          cancelled.add(intent.id);
          pending[intent.id] = { ...intent, cancelled: true };
        }
      await chrome.storage.session.set({ [PENDING]: pending });
      const required = chrome.runtime.getManifest?.().host_permissions ?? [];
      const grants =
        (await chrome.permissions.getAll()).origins?.filter(
          (p) => permissionCovers(p, origin) && !required.includes(p),
        ) ?? [];
      const next = await update(
        (c) => ({
          ...c,
          sites: c.sites.filter(
            (s) => !permissionCovers(hostPattern(s), origin),
          ),
        }),
        true,
      );
      if (grants.length) await chrome.permissions.remove({ origins: grants });
      return next;
    }
    if (m.type === "webscaly:site") {
      if ((!trusted && !content) || typeof m.origin !== "string")
        throw new Error("Invalid profile request.");
      const c = await readConfiguration(),
        site = c.sites.find((s) => s.origin === m.origin);
      if (
        !site ||
        (content && (await authorized(sender))?.origin !== site.origin)
      )
        throw new Error("Website access is unavailable.");
      return update((c) => ({
        ...c,
        sites: c.sites.map((s) =>
          s.origin === site.origin
            ? {
                ...s,
                settings: normalizeSettings(
                  m.patch && typeof m.patch === "object"
                    ? { ...s.settings, ...m.patch }
                    : m.settings,
                ),
              }
            : s,
        ),
      }));
    }
    if (!trusted) throw new Error("Settings page required.");
    if (m.type === "webscaly:import") {
      const incoming = normalizeConfiguration(m.config),
        next = await update(() => incoming, true),
        keep = new Set(next.sites.map(hostPattern));
      const required = chrome.runtime.getManifest?.().host_permissions ?? [];
      const removed =
        (await chrome.permissions.getAll()).origins?.filter(
          (p) => !keep.has(p) && !required.includes(p),
        ) ?? [];
      if (removed.length) await chrome.permissions.remove({ origins: removed });
      return next;
    }
    if (m.type === "webscaly:defaults")
      return update((c) => ({ ...c, defaults: normalizeSettings(m.settings) }));
    if (m.type === "webscaly:presets")
      return update((c) =>
        normalizeConfiguration({ ...c, presets: m.presets }),
      );
    throw new Error("Unsupported request.");
  };
  void serialize(operation).then(
    (value) => reply({ ok: true, value }),
    (e) => reply({ ok: false, error: (e as Error).message }),
  );
  return true;
});
async function boot() {
  await recover();
  await reconcile(await readConfiguration());
}
chrome.runtime.onInstalled.addListener(() => {
  void serialize(boot);
});
chrome.runtime.onStartup.addListener(() => {
  void serialize(boot);
});
chrome.permissions.onAdded.addListener(() => {
  void serialize(boot);
});
chrome.permissions.onRemoved.addListener(() => {
  void serialize(async () => {
    await invalidate();
    await boot();
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY])
    void serialize(async () => reconcile(await readConfiguration()));
});
chrome.tabs.onRemoved.addListener((id) => {
  void serialize(async () => {
    const r =
      ((await chrome.storage.session.get(FRAMES))[FRAMES] as Record<
        number,
        Record<number, string>
      >) ?? {};
    delete r[id];
    await chrome.storage.session.set({ [FRAMES]: r });
  });
});
void serialize(boot);
