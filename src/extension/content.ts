import type { SiteProfile } from "../shared/settings";
import { VideoRenderer } from "../core/renderer";
declare global {
  var __webscalyContent:
    | { activate: () => void; destroy: () => void }
    | undefined;
}
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
    timer: ReturnType<typeof setTimeout> | undefined,
    heartbeat: ReturnType<typeof setInterval> | undefined;
  const abort = new AbortController();
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
  function usable() {
    return [...videos]
      .filter((v) => visible(v) && v.videoWidth > 0 && v.readyState >= 2)
      .sort(
        (a, b) =>
          b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
      );
  }
  async function authorized(): Promise<SiteProfile | null> {
    const r = await chrome.runtime.sendMessage({ type: "webscaly:authorized" });
    return r?.ok ? r.value : null;
  }
  function clear() {
    revision++;
    renderers.forEach((r) => r.dispose());
    renderers.clear();
  }
  function deactivate() {
    active = false;
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
  }
  async function scan() {
    if (!active || dead) return;
    const version = ++revision,
      site = await authorized();
    if (version !== revision || !active || dead) return;
    if (!site) {
      deactivate();
      return;
    }
    if (!site.settings.enabled) {
      clear();
      return;
    }
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
    const selected = new Set(usable().slice(0, 2));
    for (const [v, r] of renderers)
      if (!selected.has(v)) {
        r.dispose();
        renderers.delete(v);
      }
    for (const video of selected) {
      if (version !== revision || !active) return;
      let r = renderers.get(video);
      if (!r) {
        r = new VideoRenderer(
          video,
          site.settings,
          (p) => chrome.runtime.getURL(p),
          (_s, patch) => {
            void chrome.runtime
              .sendMessage({
                type: "webscaly:site",
                origin: site.origin,
                patch,
              })
              .catch(() => {});
          },
        );
        renderers.set(video, r);
        void r.start();
      }
    }
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
      site = await authorized();
    if (version !== revision || dead) return;
    if (!site) {
      deactivate();
      return;
    }
    activate();
    if (!site.settings.enabled) clear();
    else for (const r of renderers.values()) void r.configure(site.settings);
    schedule();
  }
  const receiver = (
    m: { type?: string },
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
      });
    }
  };
  chrome.runtime.onMessage.addListener(receiver);
  // Storage callbacks cancel stale authorization responses; explicit worker invalidation cancels GPU initialization.
  const storage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && changes.webscalyConfig)
      void refresh().catch(() => deactivate());
  };
  chrome.storage.onChanged.addListener(storage);
  function destroy() {
    dead = true;
    deactivate();
    abort.abort();
    chrome.runtime.onMessage.removeListener(receiver);
    chrome.storage.onChanged.removeListener(storage);
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
      if (e.persisted) void refresh();
    },
    { signal: abort.signal },
  );
  void refresh().catch(() => deactivate());
}
