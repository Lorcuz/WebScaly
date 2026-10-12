import type { Settings } from "../shared/settings";
export interface Diagnostics {
  state: string;
  message: string;
  algorithm: string;
  sourceFps: number;
  outputFps: number;
  gpuMs: number | null;
  dropped: number;
  decoded: number;
  resolution: string;
  backend?: string;
  controlsAvailable?: boolean;
}
export class PlayerOverlay {
  readonly host = document.createElement("webscaly-player");
  canvas = document.createElement("canvas");
  readonly hud = document.createElement("output");
  private divider = document.createElement("div");
  private frames = new Map<string, HTMLIFrameElement>();
  private ready = new Set<HTMLIFrameElement>();
  private token = crypto.randomUUID();
  private settings: Settings;
  private abort = new AbortController();
  private layoutTimer: ReturnType<typeof setInterval>;
  constructor(
    readonly video: HTMLVideoElement,
    settings: Settings,
    private actions: {
      toggle: () => void;
      change: (patch: Partial<Settings>, commit?: boolean) => void;
    },
    private asset: (p: string) => string,
  ) {
    this.settings = settings;
    const shadow = this.host.attachShadow({ mode: "open" }),
      style = document.createElement("style");
    style.textContent = `:host{position:absolute;display:block;pointer-events:none!important;z-index:auto;color:#e8edf2;font:11px system-ui}canvas{width:100%;height:100%;pointer-events:none!important;display:none;background:#000}output{position:absolute;left:10px;top:10px;padding:8px;background:#111820e8;border-radius:6px;white-space:pre;pointer-events:none!important}.divider{position:absolute;top:0;bottom:44px;width:1px;background:#79dfbd;pointer-events:none}[hidden]{display:none!important}`;
    this.divider.className = "divider";
    shadow.append(style, this.canvas, this.divider, this.hud);
    video.insertAdjacentElement("afterend", this.host);
    const opts = { signal: this.abort.signal };
    window.addEventListener("message", this.receive, opts);
    document.addEventListener("scroll", () => this.layout(), {
      ...opts,
      capture: true,
    });
    window.addEventListener("resize", () => this.layout(), opts);
    document.addEventListener("fullscreenchange", () => this.layout(), opts);
    this.layoutTimer = setInterval(() => this.layout(), 300);
    this.update(settings);
  }
  private receive = (e: MessageEvent) => {
    const role = [...this.frames].find(
      ([, f]) => f.contentWindow === e.source,
    )?.[0];
    if (
      !role ||
      e.origin !== new URL(this.asset("ui-frame.html"), location.href).origin ||
      e.data?.token !== this.token ||
      e.data?.type !== "webscaly:ui"
    )
      return;
    const m = e.data;
    if (m.action === "ready") {
      this.ready.add(this.frames.get(role)!);
      this.sendState();
      return;
    }
    if (role === "toolbar") {
      if (m.action === "toggle") this.actions.toggle();
      if (m.action === "compare")
        this.actions.change({ comparison: !this.settings.comparison });
      if (m.action === "hud") this.actions.change({ hud: !this.settings.hud });
      if (
        m.action === "quality" &&
        ["fast", "balanced", "quality"].includes(m.value)
      )
        this.actions.change({ quality: m.value });
    }
    if (
      role === "compare" &&
      m.action === "split" &&
      typeof m.value === "number" &&
      Number.isFinite(m.value) &&
      m.value >= 0 &&
      m.value <= 1 &&
      typeof m.commit === "boolean"
    )
      this.actions.change({ split: m.value }, m.commit);
  };
  private sendState() {
    for (const [role, f] of this.frames)
      f.contentWindow?.postMessage(
        {
          type: "webscaly:state",
          token: this.token,
          role,
          settings: this.settings,
        },
        new URL(f.src).origin,
      );
  }
  private syncFrame(role: string, enabled: boolean) {
    const previous = this.frames.get(role);
    if (!enabled) {
      if (previous) this.ready.delete(previous);
      previous?.remove();
      this.frames.delete(role);
      return;
    }
    if (previous) return;
    const frame = document.createElement("iframe");
    frame.title =
      role === "toolbar" ? "WebScaly video controls" : "WebScaly comparison";
    frame.src =
      this.asset("ui-frame.html") +
      `#token=${this.token}&role=${role}&parent=${encodeURIComponent(globalThis.origin)}`;
    frame.style.cssText =
      "position:fixed!important;z-index:2147483646!important;border:0!important;background:transparent!important;color-scheme:dark;pointer-events:auto!important;";
    frame.setAttribute("allow", "");
    frame.addEventListener("load", () => this.sendState(), {
      signal: this.abort.signal,
    });
    this.frames.set(role, frame);
    (document.fullscreenElement &&
    document.fullscreenElement.contains(this.video)
      ? document.fullscreenElement
      : document.body
    ).append(frame);
  }
  layout() {
    // Keep the video's stacking level. A positive overlay level escapes an auto
    // media container and covers later JW/Vixcloud controls and captions.
    this.host.style.zIndex = getComputedStyle(this.video).zIndex;
    const r = this.video.getBoundingClientRect(),
      visible =
        this.video.isConnected &&
        r.width >= 120 &&
        r.height > 0 &&
        getComputedStyle(this.video).visibility !== "hidden" &&
        getComputedStyle(this.video).display !== "none";
    const fullscreen = document.fullscreenElement,
      nativeFullscreen = fullscreen === this.video;
    this.host.style.display = visible && !nativeFullscreen ? "block" : "none";
    const parent = this.host.offsetParent as HTMLElement | null,
      p = parent?.getBoundingClientRect();
    const sx = p && parent?.offsetWidth ? p.width / parent.offsetWidth : 1,
      sy = p && parent?.offsetHeight ? p.height / parent.offsetHeight : 1;
    this.host.style.left = `${(r.left - (p?.left ?? 0)) / sx + (parent?.scrollLeft ?? 0) - (parent?.clientLeft ?? 0)}px`;
    this.host.style.top = `${(r.top - (p?.top ?? 0)) / sy + (parent?.scrollTop ?? 0) - (parent?.clientTop ?? 0)}px`;
    this.host.style.width = `${r.width / sx}px`;
    this.host.style.height = `${r.height / sy}px`;
    this.canvas.style.objectFit = getComputedStyle(this.video).objectFit;
    this.canvas.style.objectPosition = getComputedStyle(
      this.video,
    ).objectPosition;
    // Chrome's native controls include a button row above the seek bar.
    // Reserve the complete band so enhancement cannot cover its upper buttons.
    const nativeControlsInset = this.video.controls ? 72 : 0;
    this.canvas.style.clipPath = nativeControlsInset
      ? `inset(0 0 ${nativeControlsInset}px 0)`
      : "";
    this.divider.style.bottom = `${nativeControlsInset}px`;
    const root =
      fullscreen?.contains(this.video) && !nativeFullscreen
        ? fullscreen
        : document.body;
    for (const [role, f] of this.frames) {
      if (f.parentNode !== root) root.append(f);
      f.style.display = visible && !nativeFullscreen ? "block" : "none";
      f.style.width = `${Math.min(role === "toolbar" ? 300 : 380, r.width - 16)}px`;
      f.style.height = "110px";
      f.style.left = `${role === "toolbar" ? r.right - Math.min(300, r.width - 16) - 8 : r.left + (r.width - Math.min(380, r.width - 16)) / 2}px`;
      f.style.top = `${role === "toolbar" ? r.top + 8 : r.bottom - 126}px`;
    }
  }
  update(s: Settings) {
    this.settings = s;
    this.hud.hidden = !s.hud;
    this.divider.style.left = `${s.split * 100}%`;
    this.divider.hidden =
      !s.comparison || this.canvas.style.display !== "block";
    this.syncFrame("toolbar", s.controls);
    this.syncFrame("compare", s.comparison);
    this.sendState();
    this.layout();
  }
  status(d: Diagnostics) {
    this.host.dataset.state = d.state;
    this.host.dataset.outputFps = String(d.outputFps);
    this.host.dataset.backend = d.backend ?? "";
    d.controlsAvailable = this.frames.size
      ? [...this.frames.values()].every((f) => this.ready.has(f))
      : undefined;
    if (d.controlsAvailable === false)
      d.message += " Player controls may be blocked; use the popup.";
    this.hud.textContent = `${d.algorithm} · ${d.backend ?? "Preparing"}\n${d.resolution}\nSource ${d.sourceFps.toFixed(1)} · enhanced ${d.outputFps.toFixed(1)} fps\nGPU ${d.gpuMs === null ? "unavailable" : d.gpuMs.toFixed(2) + " ms"} · skipped ${d.dropped}`;
  }
  showCanvas(show: boolean) {
    this.canvas.style.display = show ? "block" : "none";
    this.divider.hidden = !show || !this.settings.comparison;
  }
  resetCanvas() {
    const c = document.createElement("canvas");
    this.canvas.replaceWith(c);
    this.canvas = c;
    this.layout();
  }
  destroy() {
    clearInterval(this.layoutTimer);
    this.abort.abort();
    for (const f of this.frames.values()) f.remove();
    this.frames.clear();
    this.ready.clear();
    this.host.remove();
  }
}
