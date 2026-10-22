import {
  normalizePreferences,
  normalizeSettings,
  PREFERENCES,
  type Preferences,
  type SiteProfile,
} from "../shared/settings-core";
import { download, VideoRenderer } from "../core/renderer";
declare global {
  var __webscalyContent:
    | { activate: () => void; destroy: () => void }
    | undefined;
}
type BadgeState = "active" | "unavailable" | "paused" | "idle";
// Settings changes arrive through storage events; the worker is only asked to
// re-authorize after a refresh broadcast, page restore, or this long interval.
const AUTH_TTL = 30_000;
if (globalThis.__webscalyContent) globalThis.__webscalyContent.activate();
else {
  const renderers = new Map<HTMLVideoElement, VideoRenderer>(),
    videos = new Set<HTMLVideoElement>(),
    roots = new Set<Document | ShadowRoot>(),
    shadowHosts = new Set<Element>();
  let revision = 0,
    discoveryEpoch = 0,
    shadowCursor = 0,
    active = false,
    dead = false,
    site: SiteProfile | null = null,
    prefs: Preferences = PREFERENCES,
    authorizedAt = 0,
    discharging = false,
    battery: (EventTarget & { charging: boolean }) | undefined,
    reported: BadgeState = "idle",
    reportTimer: ReturnType<typeof setTimeout> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined;
  const abort = new AbortController();
  /**
   * After the extension is reloaded or updated, this orphaned script keeps
   * running in open tabs and every chrome.* call throws "Extension context
   * invalidated". Messages go through here so that ends the script quietly
   * instead of filling the extension's error log.
   */
  async function tell(message: unknown): Promise<any> {
    try {
      if (!chrome.runtime?.id) throw new Error("context invalidated");
      return await chrome.runtime.sendMessage(message);
    } catch {
      if (!chrome.runtime?.id) destroy();
      return undefined;
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes)
        if (node instanceof Element) discover(node);
    schedule();
  });
  function discover(root: Document | ShadowRoot | Element) {
    if (root instanceof Document || root instanceof ShadowRoot) {
      if (!roots.has(root)) {
        roots.add(root);
        observer.observe(root, { childList: true, subtree: true });
      }
    }
    if (root instanceof HTMLVideoElement) videos.add(root);
    const remember = (e: Element) => {
      if (
        e.localName.includes("-") &&
        e.localName !== "webscaly-player" &&
        shadowHosts.size < 2000
      )
        shadowHosts.add(e);
    };
    if (root instanceof Element) remember(root);
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const epoch = discoveryEpoch;
    let count = 0;
    function batch() {
      if (!active || dead || epoch !== discoveryEpoch) return;
      let node: Node | null;
      while ((node = walk.nextNode())) {
        const e = node as Element;
        if (e.localName === "webscaly-player") continue;
        remember(e);
        if (e instanceof HTMLVideoElement) videos.add(e);
        if (e.shadowRoot && e.localName !== "webscaly-player")
          discover(e.shadowRoot);
        if (++count % 500 === 0) {
          setTimeout(batch, 0);
          return;
        }
      }
      schedule();
    }
    batch();
    if (
      root instanceof Element &&
      root.shadowRoot &&
      root.localName !== "webscaly-player"
    )
      discover(root.shadowRoot);
  }
  function visible(video: HTMLVideoElement) {
    const r = video.getBoundingClientRect(),
      s = getComputedStyle(video);
    return (
      video.isConnected &&
      r.width >= 120 &&
      r.height >= 60 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      video.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    );
  }
  const area = (v: HTMLVideoElement) => v.clientWidth * v.clientHeight;
  function usable() {
    return [...videos]
      .filter(
        (v) =>
          visible(v) &&
          v.videoWidth > 0 &&
          // A seek or buffering stall briefly drops readyState; a video that is
          // already being enhanced keeps its renderer through it.
          (v.readyState >= 2 || renderers.has(v)),
      )
      .sort((a, b) => area(b) - area(a));
  }
  /** The main player, plus a second only when it is a real player (not a hover preview). */
  function selection() {
    const [first, ...rest] = usable();
    if (!first) return [];
    const second = rest.find(
      (v) =>
        v.clientWidth >= 320 &&
        v.clientHeight >= 180 &&
        area(v) >= area(first) * 0.4,
    );
    return second ? [first, second] : [first];
  }
  async function authorize(): Promise<boolean> {
    const r = await tell({ type: "webscaly:authorized" });
    const value = r?.ok ? r.value : null;
    if (!value) {
      site = null;
      return false;
    }
    site = {
      origin: value.origin,
      subdomains: value.subdomains === true,
      settings: normalizeSettings(value.settings),
    };
    prefs = normalizePreferences(value.preferences);
    authorizedAt = Date.now();
    void watchBattery();
    return true;
  }
  const batteryActive = () => prefs.batterySaver && discharging;
  async function watchBattery() {
    if (!prefs.batterySaver || battery) return;
    try {
      const manager = await (
        navigator as Navigator & {
          getBattery?: () => Promise<EventTarget & { charging: boolean }>;
        }
      ).getBattery?.();
      if (!manager || battery || dead) return;
      battery = manager;
      discharging = !manager.charging;
      manager.addEventListener(
        "chargingchange",
        () => {
          discharging = !manager.charging;
          for (const r of renderers.values()) r.setBattery(batteryActive());
        },
        { signal: abort.signal },
      );
      for (const r of renderers.values()) r.setBattery(batteryActive());
    } catch {
      /* Battery status is unavailable in this frame. */
    }
  }
  function badge(): BadgeState {
    if (!active || !site) return "idle";
    const states = [...renderers.values()].map((r) => r.diagnostics.state);
    if (prefs.paused) return usable().length ? "paused" : "idle";
    if (states.includes("active")) return "active";
    if (states.includes("unavailable")) return "unavailable";
    return "idle";
  }
  function report(now = false) {
    clearTimeout(reportTimer);
    const send = () => {
      const state = badge();
      if (state === reported) return;
      reported = state;
      void tell({ type: "webscaly:report", state });
    };
    if (now) send();
    else reportTimer = setTimeout(send, 300);
  }
  function clear() {
    revision++;
    renderers.forEach((r) => r.dispose());
    renderers.clear();
  }
  function deactivate() {
    active = false;
    site = null;
    discoveryEpoch++;
    clear();
    observer.disconnect();
    roots.clear();
    videos.clear();
    shadowHosts.clear();
    shadowCursor = 0;
    clearTimeout(timer);
    timer = undefined;
    clearInterval(heartbeat);
    heartbeat = undefined;
    report(true);
  }
  /** Whether renderers should exist at all (a disabled site keeps them only for its toolbar). */
  const wanted = () =>
    !!site && !prefs.paused && (site.settings.enabled || site.settings.controls);
  async function scan() {
    if (!active || dead) return;
    if (!chrome.runtime?.id) {
      destroy();
      return;
    }
    if (!site || Date.now() - authorizedAt > AUTH_TTL) {
      const version = ++revision,
        allowed = await authorize();
      if (version !== revision || !active || dead) return;
      if (!allowed) {
        deactivate();
        return;
      }
    }
    if (!wanted()) {
      clear();
      report();
      return;
    }
    const current = site!;
    for (const v of videos) if (!v.isConnected) videos.delete(v);
    const detached = [...roots].filter(
      (root) => root instanceof ShadowRoot && !root.host.isConnected,
    );
    if (detached.length) {
      detached.forEach((root) => roots.delete(root));
      observer.disconnect();
      for (const root of roots)
        observer.observe(root, { childList: true, subtree: true });
    }
    const selected = new Set(selection());
    for (const [v, r] of renderers)
      if (!selected.has(v)) {
        r.dispose();
        renderers.delete(v);
      }
    for (const video of selected) {
      if (renderers.has(video)) continue;
      const r = new VideoRenderer(
        video,
        current.settings,
        (p) => chrome.runtime.getURL(p),
        (_s, patch) => {
          void tell({
            type: "webscaly:site",
            origin: current.origin,
            patch,
          });
        },
        { onState: () => report() },
      );
      renderers.set(video, r);
      r.setBattery(batteryActive());
      void r.configure(current.settings);
    }
    report();
  }
  function apply() {
    if (!site) return;
    if (!wanted()) clear();
    else
      for (const r of renderers.values()) {
        r.setBattery(batteryActive());
        void r.configure(site.settings);
      }
    schedule();
    report();
  }
  function schedule() {
    if (!active || dead || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void scan().catch(() => deactivate());
    }, 180);
  }
  function activate() {
    if (dead) return;
    if (!active) {
      active = true;
      discover(document);
      heartbeat = setInterval(() => {
        if (!chrome.runtime?.id) {
          destroy();
          return;
        }
        // Custom players can attach their open shadow root after their host was observed.
        const candidates = [...shadowHosts];
        if (shadowCursor >= candidates.length) shadowCursor = 0;
        for (const host of candidates.slice(shadowCursor, shadowCursor + 200)) {
          if (!host.isConnected) shadowHosts.delete(host);
          else if (host.shadowRoot && !roots.has(host.shadowRoot))
            discover(host.shadowRoot);
        }
        shadowCursor += 200;
        schedule();
      }, 1800);
    }
    schedule();
  }
  async function refresh() {
    const version = ++revision,
      allowed = await authorize();
    if (version !== revision || dead) return;
    if (!allowed) {
      deactivate();
      return;
    }
    activate();
    apply();
  }
  const primary = () =>
    [...renderers.values()].find((r) => r.diagnostics.state === "active") ??
    [...renderers.values()][0];
  const receiver = (
    m: { type?: string; action?: string; value?: unknown },
    sender: chrome.runtime.MessageSender,
    reply: (v: unknown) => void,
  ) => {
    if (sender.id !== chrome.runtime.id) return;
    if (m.type === "webscaly:invalidate") {
      deactivate();
      reply({ ok: true });
    }
    if (m.type === "webscaly:refresh") {
      void refresh().catch(() => deactivate());
      reply({ ok: true });
    }
    if (m.type === "webscaly:action") {
      const r = primary();
      if (!r) {
        reply({ ok: false });
        return;
      }
      if (m.action === "snapshot")
        void r
          .snapshot()
          .then((blob) => {
            if (blob) download(blob, location.hostname);
            r.toast(blob ? "Snapshot saved" : "Snapshot unavailable right now");
          })
          .catch(() => r.toast("Snapshot unavailable right now"));
      if (m.action === "original" && typeof m.value === "boolean")
        r.setOriginal(m.value);
      if (m.action === "toast" && typeof m.value === "string")
        r.toast(m.value);
      reply({ ok: true });
    }
    if (m.type === "webscaly:status") {
      const embeds = Array.from(document.querySelectorAll("iframe"))
        .filter((f) => {
          const r = f.getBoundingClientRect();
          return (
            !f.src.startsWith("chrome-extension:") &&
            r.width >= 240 &&
            r.height >= 120
          );
        })
        .slice(0, 5)
        .map((f) => {
          try {
            return new URL(f.src, location.href).origin;
          } catch {
            return "";
          }
        })
        .filter((o) => o.startsWith("http"));
      reply({
        origin: globalThis.origin,
        videos: usable().length,
        hiddenVideos: [...videos].filter((v) => !visible(v)).length,
        renderers: [...renderers.values()].map((r) => r.diagnostics),
        embeds,
        paused: prefs.paused,
      });
    }
  };
  chrome.runtime.onMessage.addListener(receiver);
  // Settings and preference edits apply locally from the storage event; site
  // removal also invalidates through the worker before access is revoked.
  const storage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !changes.webscalyConfig || !active || !site) return;
    const value = changes.webscalyConfig.newValue as
      | { sites?: { origin?: unknown; subdomains?: unknown; settings?: unknown }[]; preferences?: unknown }
      | undefined;
    const origin = site.origin,
      profile = Array.isArray(value?.sites)
        ? value.sites.find((s) => s?.origin === origin)
        : undefined;
    if (!profile) {
      deactivate();
      return;
    }
    site = {
      origin,
      subdomains: profile.subdomains === true,
      settings: normalizeSettings(profile.settings),
    };
    prefs = normalizePreferences(value?.preferences);
    void watchBattery();
    apply();
  };
  chrome.storage.onChanged.addListener(storage);
  function destroy() {
    dead = true;
    deactivate();
    abort.abort();
    try {
      chrome.runtime.onMessage.removeListener(receiver);
      chrome.storage.onChanged.removeListener(storage);
    } catch {
      /* The extension context is already gone; its listeners went with it. */
    }
    globalThis.__webscalyContent = undefined;
  }
  globalThis.__webscalyContent = {
    activate: () => {
      void refresh().catch(() => deactivate());
    },
    destroy,
  };
  for (const event of ["loadeddata", "play"])
    document.addEventListener(event, schedule, {
      capture: true,
      signal: abort.signal,
    });
  window.addEventListener(
    "pagehide",
    (e) => {
      if (e.persisted) deactivate();
      else destroy();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "pageshow",
    (e) => {
      if (e.persisted) void refresh().catch(() => deactivate());
    },
    { signal: abort.signal },
  );
  void refresh().catch(() => deactivate());
}
