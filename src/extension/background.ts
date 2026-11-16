import {
  ALGORITHMS,
  ALGORITHM_LABELS,
  carriesDefaults,
  hostPattern,
  mergeConfiguration,
  normalizeConfiguration,
  normalizePreferences,
  normalizeSettings,
  profileFor,
  siteOrigin,
  type Configuration,
  type Settings,
  type SiteProfile,
} from "../shared/settings";
import { permissionCovers, type ApprovalIntent, revokes } from "../shared/permissions";
import {
  readConfiguration,
  writeConfiguration,
  STORAGE_KEY,
} from "../shared/storage";
import type { PlayerStatus } from "../shared/player-status";
const PENDING = "webscalyApprovalIntents",
  FRAMES = "webscalyFrames",
  BADGES = "webscalyBadges";
/**
 * A record in session storage (kept across worker restarts, cleared with the browser session) that is
 * changed only through its own queue. Frames authorize and report concurrently; without the queue two
 * read-modify-write cycles could each drop the other's entry. Writes happen only when a change says so.
 */
function sessionRecord<T extends object>(key: string) {
  let value: T | undefined,
    queue: Promise<unknown> = Promise.resolve();
  const run = <R>(fn: (v: T) => R | Promise<R>): Promise<R> => {
    const result = queue.then(async () =>
      fn((value ??= ((await chrome.storage.session.get(key))[key] as T | undefined) ?? ({} as T))),
    );
    queue = result.catch(() => {});
    return result;
  };
  return {
    /** A copy of the current value. */
    read: () => run((v) => structuredClone(v)),
    /** Applies `fn` atomically; it returns whether it changed the value, and only then is it stored. */
    change: (fn: (v: T) => boolean) =>
      run(async (v) => {
        if (fn(v)) await chrome.storage.session.set({ [key]: v });
      }),
  };
}
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
// Fingerprint of approved scopes and grants from the last reconcile. Settings-only edits leave it
// unchanged; content scripts apply those from storage. It is kept in session storage so a worker that
// wakes up again does not re-register scripts and make every approved frame re-authorize; session
// storage is cleared on browser restart, extension reload and update, which then reconcile fully.
const RECONCILED = "webscalyReconciled";
let reconciled: string | undefined;
async function forgetReconciled() {
  reconciled = "";
  await chrome.storage.session.set({ [RECONCILED]: "" });
}
/**
 * Stops renderers that lose access. With `scopes` (the revoked or removed host patterns) only frames whose own
 * origin is covered stop, plus every frame of a tab whose top-level page is covered; unrelated websites and tabs
 * keep enhancing. Without scopes every frame stops (used when the revoked scope is unknown).
 */
async function invalidate(scopes?: string[]) {
  if (scopes && !scopes.length) return false;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((t) => t.id !== undefined)
      .map(async (t) => {
        // A page Chrome no longer lets us read (its access was just revoked) is treated as covered.
        const all = !scopes || !t.url || scopes.some((p) => revokes(p, t.url!));
        try {
          await chrome.tabs.sendMessage(t.id!, { type: "webscaly:invalidate", scopes, all });
        } catch {}
      }),
  );
  return true;
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
async function granted(site: Pick<SiteProfile, "origin" | "subdomains">) {
  return chrome.permissions.contains({ origins: [hostPattern(site)] });
}
async function reconcile(config: Configuration) {
  const grants = await Promise.all(config.sites.map(granted));
  const fingerprint = JSON.stringify(
    config.sites.map((s, i) => [hostPattern(s), grants[i]]),
  );
  reconciled ??=
    ((await chrome.storage.session.get(RECONCILED))[RECONCILED] as string | undefined) ?? "";
  if (fingerprint === reconciled) return;
  reconciled = fingerprint;
  await chrome.storage.session.set({ [RECONCILED]: fingerprint });
  try {
    const desired: chrome.scripting.RegisteredContentScript[] = [];
    for (const [index, site] of config.sites.entries())
      if (grants[index])
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
      if (desired.length)
        await chrome.scripting.registerContentScripts(desired);
    }
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs
        .filter((t) => t.id !== undefined)
        .map(async (tab) => {
          // Access changed: existing renderers re-authorize before doing anything else.
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
  } catch (e) {
    await forgetReconciled();
    throw e;
  }
}
async function update(
  mutator: (c: Configuration) => Configuration,
  stop?: string[] | true,
) {
  // Frames that were stopped but are still approved come back with the refresh of a full reconcile.
  if (stop && (await invalidate(stop === true ? undefined : stop))) await forgetReconciled();
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
type Registry = Record<number, Record<number, string>>;
/** Origin of every authorized frame, per tab: commands and the popup address embedded players by frame id. */
const frameRegistry = sessionRecord<Registry>(FRAMES);
/**
 * When each frame last authorized (an ordinal in this worker's memory; nothing is stored). tabStatus prunes a
 * frame that did not answer only if it has not authorized since tabStatus asked: a frame that navigates while
 * the popup or a shortcut asks re-authorizes with an unchanged entry, which must not then be deleted.
 */
const frameSeen = new Map<string, number>();
let frameTick = 0;
async function authorized(
  sender: chrome.runtime.MessageSender,
): Promise<(SiteProfile & { preferences: Configuration["preferences"] }) | null> {
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
  const tabId = sender.tab.id,
    frameId = sender.frameId ?? 0,
    origin = siteOrigin(frameUrl);
  frameSeen.set(`${tabId}:${frameId}`, ++frameTick);
  // Only write when the frame is new or navigated; authorization runs often. The registry only addresses
  // commands and the popup, so a failing session store must not deny an authorized frame.
  await frameRegistry
    .change((frames) => {
      const known = (frames[tabId] ??= {});
      if (known[frameId] === origin) return false;
      known[frameId] = origin;
      return true;
    })
    .catch(() => {});
  return { ...own, preferences: c.preferences };
}
async function tabStatus(tabId: number): Promise<PlayerStatus> {
  const asked = frameTick,
    known = (await frameRegistry.read())[tabId] ?? {};
  const result: PlayerStatus = {
      videos: 0,
      hiddenVideos: 0,
      renderers: [],
      embeds: [],
      frames: [],
    },
    origins = new Set<string>(),
    config = await readConfiguration(),
    stale: number[] = [];
  result.paused = config.preferences.paused;
  await Promise.all(
    [...new Set([0, ...Object.keys(known).map(Number)])].map(
      async (frameId) => {
        try {
          const s = await chrome.tabs.sendMessage(
            tabId,
            { type: "webscaly:status" },
            { frameId },
          );
          if (!s) throw new Error("No player script in this frame.");
          result.videos += s.videos ?? 0;
          result.hiddenVideos! += s.hiddenVideos ?? 0;
          result.renderers.push(...(s.renderers ?? []));
          result.frames.push({
            frameId,
            origin: s.origin ?? known[frameId] ?? "",
            videos: s.videos ?? 0,
            renderers: s.renderers?.length ?? 0,
          });
          for (const origin of s.embeds ?? []) origins.add(siteOrigin(origin));
        } catch {
          if (frameId !== 0 && frameId in known) stale.push(frameId);
        }
      },
    ),
  );
  if (stale.length)
    await frameRegistry.change((frames) => {
      let changed = false;
      for (const id of stale)
        if (
          frames[tabId] &&
          id in frames[tabId] &&
          (frameSeen.get(`${tabId}:${id}`) ?? 0) <= asked
        ) {
          delete frames[tabId][id];
          changed = true;
        }
      return changed;
    });
  result.frames.sort((a, b) => a.frameId - b.frameId);
  for (const origin of origins) {
    const site = profileFor(origin, config);
    result.embeds.push({ origin, approved: !!site && (await granted(site)) });
  }
  return result;
}

/* Toolbar badge: one state per frame, combined per tab. */
type BadgeState = "active" | "unavailable" | "paused" | "idle";
const BADGE: Record<Exclude<BadgeState, "idle">, [string, string]> = {
  active: ["ON", "#79dfbd"],
  unavailable: ["!", "#ff9aa4"],
  paused: ["II", "#ddc48d"],
};
/** Per-frame badge states, kept in session storage so a restarted worker still knows every frame's state. */
const badgeStates = sessionRecord<Record<number, Record<number, BadgeState>>>(BADGES);
async function paintBadge(tabId: number) {
  const values = Object.values((await badgeStates.read())[tabId] ?? {});
  const state: BadgeState = values.includes("active")
    ? "active"
    : values.includes("unavailable")
      ? "unavailable"
      : values.includes("paused")
        ? "paused"
        : "idle";
  try {
    if (state === "idle") {
      await chrome.action?.setBadgeText({ tabId, text: "" });
      return;
    }
    const [text, color] = BADGE[state];
    await chrome.action?.setBadgeBackgroundColor({ tabId, color });
    await chrome.action?.setBadgeTextColor?.({ tabId, color: "#101820" });
    await chrome.action?.setBadgeText({ tabId, text });
  } catch {
    /* The tab closed while the badge was updating. */
  }
}
function reportState(sender: chrome.runtime.MessageSender, state: unknown) {
  const tabId = sender.tab?.id;
  if (tabId === undefined || typeof state !== "string" || !(state in BADGE || state === "idle"))
    return;
  const frameId = sender.frameId ?? 0;
  void badgeStates
    .change((tabs) => {
      const frames = (tabs[tabId] ??= {});
      if (state === "idle") {
        if (!(frameId in frames)) return false;
        delete frames[frameId];
        if (!Object.keys(frames).length) delete tabs[tabId];
        return true;
      }
      if (frames[frameId] === state) return false;
      frames[frameId] = state as BadgeState;
      return true;
    })
    // The in-memory state changed even if storing it failed; the badge follows it either way.
    .then(
      () => paintBadge(tabId),
      () => paintBadge(tabId),
    )
    .catch(() => {});
}
/** Forgets a tab's frame states; `true` when there were any. */
const forgetBadges = (tabId: number) =>
  badgeStates.change((tabs) => {
    if (!(tabId in tabs)) return false;
    delete tabs[tabId];
    return true;
  });

/* Keyboard shortcuts act on the profiles that are actually rendering in the tab. */
const COMMANDS = new Set([
  "toggle-enhancement",
  "toggle-compare",
  "cycle-engine",
  "snapshot",
  "toggle-pause",
]);
async function sendTab(tabId: number, message: object, frames?: number[]) {
  for (const frameId of frames ?? [undefined])
    try {
      await chrome.tabs.sendMessage(
        tabId,
        message,
        frameId === undefined ? undefined : { frameId },
      );
    } catch {}
}
async function runCommand(command: string, tabId?: number) {
  if (!COMMANDS.has(command)) throw new Error("Unknown command.");
  if (tabId === undefined)
    tabId = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id;
  if (tabId === undefined) return readConfiguration();
  const config = await readConfiguration(),
    toast = (value: string, frames?: number[]) =>
      sendTab(tabId!, { type: "webscaly:action", action: "toast", value }, frames);
  if (command === "toggle-pause") {
    const paused = !config.preferences.paused;
    if (!paused) setTimeout(() => void toast("WebScaly <b>resumed</b>"), 600);
    return update((c) => ({
      ...c,
      preferences: { ...c.preferences, paused },
    }));
  }
  const status = await tabStatus(tabId),
    rendering = status.frames.filter((f) => (f.renderers ?? 0) > 0),
    playing = rendering.length
      ? rendering
      : status.frames.filter((f) => f.videos > 0),
    frames = playing.map((f) => f.frameId),
    tab = await chrome.tabs.get(tabId),
    origins = new Set(playing.map((f) => f.origin).filter(Boolean));
  if (!origins.size && tab.url) origins.add(tab.url);
  const targets: SiteProfile[] = [];
  for (const origin of origins) {
    const p = profileFor(origin, config);
    if (p && (await granted(p)) && !targets.some((t) => t.origin === p.origin))
      targets.push(p);
  }
  if (!targets.length) return config;
  if (command === "snapshot") {
    await sendTab(tabId, { type: "webscaly:action", action: "snapshot" }, rendering.map((f) => f.frameId));
    return config;
  }
  const first = targets[0].settings;
  let patch: Partial<Settings>, message: string;
  if (command === "toggle-compare") {
    patch = { comparison: !first.comparison };
    message = `Compare <b>${patch.comparison ? "on" : "off"}</b>`;
  } else if (command === "cycle-engine") {
    const algorithm =
      ALGORITHMS[(ALGORITHMS.indexOf(first.algorithm) + 1) % ALGORITHMS.length];
    patch = { algorithm, enabled: true };
    message = `Engine · <b>${ALGORITHM_LABELS[algorithm]}</b>`;
  } else {
    const enabled = config.preferences.paused || !first.enabled;
    patch = { enabled };
    message = enabled
      ? `Enhancement <b>on</b> · ${ALGORITHM_LABELS[first.algorithm]}`
      : "Enhancement <b>off</b>";
  }
  const next = await update((c) => ({
    ...c,
    preferences:
      command === "toggle-enhancement" && patch.enabled
        ? { ...c.preferences, paused: false }
        : c.preferences,
    sites: c.sites.map((s) =>
      targets.some((t) => t.origin === s.origin)
        ? { ...s, settings: normalizeSettings({ ...s.settings, ...patch }) }
        : s,
    ),
  }));
  // Renderers rebuild asynchronously; give them a moment before confirming on screen.
  setTimeout(() => void toast(message, frames.length ? frames : undefined), patch.enabled === false ? 0 : 450);
  return next;
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
  // Read-only requests do not wait behind queued configuration writes.
  const read = async (): Promise<unknown> => {
    if (m.type === "webscaly:ping") return { ok: true };
    if (m.type === "webscaly:authorized")
      return content ? authorized(sender) : null;
    if (m.type === "webscaly:report") {
      if (content) reportState(sender, m.state);
      return null;
    }
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
    throw new Error("Unsupported request.");
  };
  const write = async (): Promise<unknown> => {
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
      const current = await readConfiguration(),
        removed = current.sites
          .filter((s) => permissionCovers(hostPattern(s), origin))
          .map(hostPattern);
      const next = await update(
        (c) => ({
          ...c,
          sites: c.sites.filter(
            (s) => !permissionCovers(hostPattern(s), origin),
          ),
        }),
        [...new Set([...removed, ...grants])],
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
    if (m.type === "webscaly:read") return readConfiguration();
    if (m.type === "webscaly:command") {
      if (typeof m.command !== "string" || typeof m.tabId !== "number")
        throw new Error("Invalid command.");
      return runCommand(m.command, m.tabId);
    }
    if (m.type === "webscaly:import") {
      const incoming = normalizeConfiguration(m.config),
        replace = m.mode === "replace";
      const build = (c: Configuration): Configuration =>
        replace
            ? {
                ...incoming,
                sites: incoming.sites.map((s) => {
                  const current = c.sites.find((x) => x.origin === s.origin);
                  return current
                    ? { ...s, subdomains: current.subdomains && s.subdomains }
                    : s;
                }),
                preferences: c.preferences,
              }
            : mergeConfiguration(c, incoming, carriesDefaults(m.config));
      // A replace stops only websites that it drops or narrows; kept websites keep enhancing.
      let scopes: string[] | undefined;
      if (replace) {
        const current = await readConfiguration(),
          kept = new Set(normalizeConfiguration(build(current)).sites.map(hostPattern));
        scopes = current.sites.map(hostPattern).filter((p) => !kept.has(p));
      }
      // Device preferences never travel with an imported profile file.
      const next = await update(build, scopes);
      if (replace) {
        const required = chrome.runtime.getManifest?.().host_permissions ?? [];
        const removed =
          (await chrome.permissions.getAll()).origins?.filter(
            (p) =>
              !required.includes(p) &&
              !next.sites.some((s) => permissionCovers(p, s.origin)),
          ) ?? [];
        if (removed.length)
          await chrome.permissions.remove({ origins: removed });
      }
      return next;
    }
    if (m.type === "webscaly:defaults")
      return update((c) => ({ ...c, defaults: normalizeSettings(m.settings) }));
    if (m.type === "webscaly:presets")
      return update((c) =>
        normalizeConfiguration({ ...c, presets: m.presets }),
      );
    if (m.type === "webscaly:preferences")
      return update((c) => ({
        ...c,
        preferences: normalizePreferences({
          ...c.preferences,
          ...(m.patch && typeof m.patch === "object" ? m.patch : {}),
        }),
      }));
    throw new Error("Unsupported request.");
  };
  const readOnly = [
    "webscaly:ping",
    "webscaly:authorized",
    "webscaly:report",
    "webscaly:tab-status",
    "webscaly:viewer-config",
    "webscaly:removal-impact",
  ].includes(m.type);
  void (readOnly ? read() : serialize(write)).then(
    (value) => reply({ ok: true, value }),
    (e) => reply({ ok: false, error: (e as Error).message }),
  );
  return true;
});
async function boot() {
  await recover();
  await reconcile(await readConfiguration());
}
chrome.runtime.onInstalled.addListener((details) => {
  void serialize(boot).catch(() => {});
  if (details?.reason === "install")
    void chrome.tabs
      .create({ url: chrome.runtime.getURL("options.html?section=Welcome") })
      .catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  void serialize(boot).catch(() => {});
});
chrome.permissions.onAdded.addListener(() => {
  void serialize(boot).catch(() => {});
});
chrome.permissions.onRemoved.addListener((removed) => {
  void serialize(async () => {
    // Only frames covered by the revoked patterns stop (all frames if Chrome did not say which).
    await invalidate(removed?.origins?.length ? removed.origins : undefined);
    await forgetReconciled();
    await boot();
  }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY])
    void serialize(async () => reconcile(await readConfiguration())).catch(() => {});
});
chrome.commands?.onCommand.addListener((command, tab) => {
  void serialize(() => runCommand(command, tab?.id)).catch(() => {});
});
chrome.tabs.onUpdated?.addListener((tabId, info) => {
  if (info.status !== "loading") return;
  // A navigation (including a same-document one) starts the tab's badge over; frames that are still
  // rendering report again, and a new document's frames report when they start.
  void forgetBadges(tabId)
    .catch(() => {})
    .then(async () => {
      await paintBadge(tabId);
      try {
        await chrome.tabs.sendMessage(tabId, { type: "webscaly:resync" });
      } catch {}
    })
    .catch(() => {});
});
chrome.tabs.onRemoved.addListener((id) => {
  void forgetBadges(id).catch(() => {});
  for (const key of frameSeen.keys()) if (key.startsWith(`${id}:`)) frameSeen.delete(key);
  void frameRegistry
    .change((frames) => {
      if (!(id in frames)) return false;
      delete frames[id];
      return true;
    })
    .catch(() => {});
});
void serialize(boot).catch(() => {});
