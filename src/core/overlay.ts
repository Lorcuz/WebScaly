import { bindLocale, localize } from "../shared/i18n/dom";
import type { Settings } from "../shared/settings-core";
import { ALGORITHM_LABELS, QUALITY_LABELS } from "../shared/settings-core";
import type { Diagnostics } from "../shared/player-status";
import interMedium from "@fontsource/inter/files/inter-latin-500-normal.woff2";
import interSemibold from "@fontsource/inter/files/inter-latin-600-normal.woff2";
export type { Diagnostics } from "../shared/player-status";

const FONT = "WebScaly Inter";
let fontsRequested = false;
/**
 * The HUD and toasts render on other websites. Inter is registered from the
 * bundled font bytes under a private family name: nothing is fetched (so the
 * page's font CSP does not apply) and page styles cannot pick it up by accident.
 * Extension pages built by Vite receive a same-origin URL instead of bytes.
 */
function loadFonts() {
  if (fontsRequested || typeof FontFace !== "function") return;
  fontsRequested = true;
  for (const [source, weight] of [
    [interMedium, "500"],
    [interSemibold, "600"],
  ] as const) {
    const data = source as unknown as string | Uint8Array<ArrayBuffer>;
    const face = new FontFace(
      FONT,
      typeof data === "string" ? `url(${data})` : data,
      { weight },
    );
    void face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {});
  }
}

export interface OverlayActions {
  toggle: () => void;
  change: (patch: Partial<Settings>, commit?: boolean) => void;
  original: (on: boolean) => void;
  snapshot: () => void;
}
type Role = "toolbar" | "compare";
/**
 * A UUID-shaped token for the UI frames. crypto.randomUUID exists only in
 * secure contexts, and WebScaly also runs on plain http:// pages.
 */
function randomToken() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type Layout = "player" | "preview";
const IDLE_MS = 2600;
const STYLE = `
:host{position:absolute;display:block;pointer-events:none!important;z-index:auto;
  --panel:#101820e8;--line:#34414d;--text:#e5edf4;--dim:#9aafbd;--accent:#79dfbd;
  color:var(--text);font:500 11px/1.35 "WebScaly Inter",Inter,"Segoe UI",system-ui,sans-serif;
  font-variant-numeric:tabular-nums}
canvas{width:100%;height:100%;pointer-events:none!important;display:none;background:#000}
.hud{position:absolute;left:10px;top:10px;min-width:176px;padding:8px 10px 9px;background:var(--panel);
  border:1px solid var(--line);border-radius:10px;display:grid;gap:5px;pointer-events:none!important;
  box-shadow:0 8px 24px -12px #000}
.hud .title{display:flex;justify-content:space-between;gap:12px;font-weight:600;letter-spacing:.2px}
.hud .title b{color:var(--accent);font-weight:600}
.hud dl{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0}
.hud dt{color:var(--dim)}
.hud dd{margin:0;text-align:right}
.hud .budget{height:4px;border-radius:2px;background:#ffffff1f;overflow:hidden}
.hud .budget i{display:block;height:100%;background:var(--accent);border-radius:2px}
.hud .note{color:#ddc48d;font-size:11px}
.divider{position:absolute;top:0;width:1px;background:var(--accent);pointer-events:none}
.divider span{position:absolute;top:96px;padding:3px 7px;border-radius:5px;background:var(--panel);font-size:10.5px;white-space:nowrap}
.divider .before{right:8px;color:var(--dim)}.divider .after{left:8px;color:var(--accent)}
:host([data-layout=preview]) .divider span{top:10px}
.toast{position:absolute;left:50%;top:14px;transform:translate(-50%,-6px);padding:6px 11px;border-radius:7px;
  background:var(--panel);border:1px solid var(--line);font-weight:500;white-space:nowrap;opacity:0;
  transition:opacity .18s ease,transform .18s ease;pointer-events:none}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast b{color:var(--accent);font-weight:600}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){.toast{transition:none}}`;

export class PlayerOverlay {
  readonly host = document.createElement("webscaly-player");
  canvas = document.createElement("canvas");
  private hud = document.createElement("output");
  private divider = document.createElement("div");
  private toastNode = document.createElement("div");
  private unbindLocale?: () => void;
  private frames = new Map<Role, HTMLIFrameElement>();
  private ready = new Set<HTMLIFrameElement>();
  private sizes = new Map<Role, [number, number]>();
  private token = randomToken();
  private settings: Settings;
  private abort = new AbortController();
  private tick: ReturnType<typeof setInterval>;
  private frame = 0;
  private awake = true;
  private hovered = false;
  private focused = false;
  private sleepTimer?: ReturnType<typeof setTimeout>;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private rect?: DOMRect;
  private canvasShown = false;
  private restoreVideoStyle: string | null = null;
  private resize: ResizeObserver;
  constructor(
    readonly video: HTMLVideoElement,
    settings: Settings,
    private actions: OverlayActions,
    private asset: (p: string) => string,
    private mode: Layout = "player",
  ) {
    this.settings = settings;
    this.host.dataset.layout = mode;
    loadFonts();
    const shadow = this.host.attachShadow({ mode: "open" }),
      style = document.createElement("style");
    style.textContent = STYLE;
    this.hud.className = "hud";
    this.hud.setAttribute("aria-live", "off");
    this.divider.className = "divider";
    this.divider.innerHTML =
      '<span class="before">Original</span><span class="after">Enhanced</span>';
    this.toastNode.className = "toast";
    this.toastNode.setAttribute("role", "status");
    shadow.append(style, this.canvas, this.divider, this.hud, this.toastNode);
    video.insertAdjacentElement("afterend", this.host);
    this.unbindLocale = bindLocale(shadow);
    const opts = { signal: this.abort.signal },
      passive = { ...opts, passive: true, capture: true };
    window.addEventListener("message", this.receive, opts);
    document.addEventListener("scroll", () => this.requestLayout(), passive);
    window.addEventListener("resize", () => this.requestLayout(), opts);
    document.addEventListener(
      "fullscreenchange",
      () => {
        if (!document.fullscreenElement && this.restoreVideoStyle !== null) {
          this.video.style.cssText = this.restoreVideoStyle;
          this.restoreVideoStyle = null;
        }
        this.requestLayout();
      },
      opts,
    );
    // Auto-hide follows pointer activity over the video, like native player chrome.
    document.addEventListener("pointermove", this.pointer, passive);
    for (const event of ["play", "pause"])
      video.addEventListener(event, () => this.wake(), opts);
    this.resize = new ResizeObserver(() => this.requestLayout());
    this.resize.observe(video);
    // Position can change without a resize (page reflow); a light safety tick catches it.
    this.tick = setInterval(() => this.layout(), 500);
    this.update(settings);
    this.wake();
  }
  private pointer = (e: PointerEvent) => {
    const r = this.rect;
    if (
      r &&
      e.clientX >= r.left &&
      e.clientX <= r.right &&
      e.clientY >= r.top &&
      e.clientY <= r.bottom
    )
      this.wake();
  };
  private wake() {
    this.awake = true;
    clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => {
      this.awake = false;
      this.applyVisibility();
    }, IDLE_MS);
    this.applyVisibility();
  }
  private get controlsVisible() {
    return this.awake || this.hovered || this.focused || this.video.paused;
  }
  private applyVisibility() {
    const show = this.controlsVisible;
    for (const f of this.frames.values()) {
      // Opacity only: the small frame stays hit-testable so hovering reveals it.
      f.style.opacity = show ? "1" : "0";
    }
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
    const m = e.data,
      frame = this.frames.get(role)!;
    if (m.action === "ready") {
      this.ready.add(frame);
      this.sendState();
      return;
    }
    if (m.action === "size") {
      const w = Number(m.value?.width),
        h = Number(m.value?.height);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)
        this.sizes.set(role, [Math.ceil(w), Math.ceil(h)]);
      this.layout();
      return;
    }
    if (m.action === "hover" || m.action === "focus") {
      if (m.action === "hover") this.hovered = m.value === true;
      else this.focused = m.value === true;
      this.wake();
      return;
    }
    this.wake();
    if (role === "toolbar") {
      if (m.action === "toggle") this.actions.toggle();
      if (m.action === "compare")
        this.actions.change({ comparison: !this.settings.comparison });
      if (m.action === "hud") this.actions.change({ hud: !this.settings.hud });
      if (m.action === "quality" && Object.hasOwn(QUALITY_LABELS, m.value))
        this.actions.change({ quality: m.value });
      if (m.action === "engine" && Object.hasOwn(ALGORITHM_LABELS, m.value))
        this.actions.change({ algorithm: m.value });
      if (m.action === "original" && typeof m.value === "boolean")
        this.actions.original(m.value);
      if (m.action === "snapshot") this.actions.snapshot();
      if (m.action === "fullscreen") this.fullscreen();
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
  /**
   * Only frames that have announced themselves receive state. A frame that was
   * just created, or just moved (which reloads it), still holds an about:blank
   * document in the page's own origin, and posting there with the extension's
   * origin as target makes the browser log an origin-mismatch error. The frame
   * asks for state with "ready" once its document is the extension page.
   */
  private sendState() {
    for (const [role, f] of this.frames) {
      if (!this.ready.has(f) || !f.isConnected) continue;
      try {
        f.contentWindow?.postMessage(
          {
            type: "webscaly:state",
            token: this.token,
            role,
            settings: this.settings,
            state: this.host.dataset.state ?? "",
            fullscreen: !!document.fullscreenElement,
          },
          new URL(f.src).origin,
        );
      } catch {
        this.ready.delete(f);
      }
    }
  }
  private syncFrame(role: Role, enabled: boolean) {
    const previous = this.frames.get(role);
    if (!enabled) {
      if (previous) this.ready.delete(previous);
      previous?.remove();
      this.frames.delete(role);
      this.sizes.delete(role);
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
      "position:fixed!important;z-index:2147483646!important;border:0!important;background:transparent!important;color-scheme:dark;pointer-events:auto!important;transition:opacity .2s ease;width:0;height:0;";
    frame.setAttribute("allow", "");
    this.frames.set(role, frame);
    (document.fullscreenElement &&
    document.fullscreenElement.contains(this.video)
      ? document.fullscreenElement
      : document.body
    ).append(frame);
  }
  requestLayout() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.layout();
    });
  }
  layout() {
    const video = this.video,
      style = getComputedStyle(video),
      r = video.getBoundingClientRect();
    this.rect = r;
    // Keep the video's stacking level. A positive overlay level escapes an auto
    // media container and covers later JW/Vixcloud controls and captions.
    this.host.style.zIndex = style.zIndex;
    const visible =
      video.isConnected &&
      r.width >= 120 &&
      r.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none";
    const fullscreen = document.fullscreenElement,
      nativeFullscreen = fullscreen === video;
    this.host.style.display = visible && !nativeFullscreen ? "block" : "none";
    const parent = this.host.offsetParent as HTMLElement | null,
      p = parent?.getBoundingClientRect();
    const sx = p && parent?.offsetWidth ? p.width / parent.offsetWidth : 1,
      sy = p && parent?.offsetHeight ? p.height / parent.offsetHeight : 1;
    this.host.style.left = `${(r.left - (p?.left ?? 0)) / sx + (parent?.scrollLeft ?? 0) - (parent?.clientLeft ?? 0)}px`;
    this.host.style.top = `${(r.top - (p?.top ?? 0)) / sy + (parent?.scrollTop ?? 0) - (parent?.clientTop ?? 0)}px`;
    this.host.style.width = `${r.width / sx}px`;
    this.host.style.height = `${r.height / sy}px`;
    this.canvas.style.objectFit = style.objectFit;
    this.canvas.style.objectPosition = style.objectPosition;
    // Chrome's native controls include a button row above the seek bar.
    // Reserve the complete band so enhancement cannot cover its upper buttons.
    const nativeControlsInset = video.controls ? 72 : 0;
    this.canvas.style.clipPath = nativeControlsInset
      ? `inset(0 0 ${nativeControlsInset}px 0)`
      : "";
    this.divider.style.bottom = `${nativeControlsInset}px`;
    const root =
      fullscreen?.contains(video) && !nativeFullscreen ? fullscreen : document.body;
    // Both controls live in the top band, clear of captions and native controls:
    // the toolbar at the top right, the comparison slider beside it, or below it
    // when the player is too narrow for both.
    const fit = (role: Role) => {
      // Until a frame reports its size it stays 1px: a hidden frame never lays out.
      const [w, h] = this.sizes.get(role) ?? [1, 1];
      return [Math.max(1, Math.min(w, r.width - 16)), h] as const;
    };
    const [toolbarWidth, toolbarHeight] = this.frames.has("toolbar")
      ? fit("toolbar")
      : [0, 0];
    // Toasts sit just below the top control band, never hidden behind it.
    let band = 0;
    for (const [role, f] of this.frames) {
      if (f.parentNode !== root) {
        // Moving an iframe reloads it; it must announce itself again.
        this.ready.delete(f);
        root.append(f);
      }
      const [width, h] = fit(role);
      f.style.display = visible && !nativeFullscreen ? "block" : "none";
      f.style.width = `${width}px`;
      f.style.height = `${h}px`;
      let left = r.right - width - 10,
        top = r.top + 10;
      if (role === "compare" && this.mode === "preview") {
        // A preview has no captions or native controls: the slider takes the
        // bottom edge and leaves the picture's top edge to the labels.
        left = r.left + (r.width - width) / 2;
        top = r.bottom - h - 10;
      } else if (role === "compare" && toolbarWidth) {
        const beside = left - toolbarWidth - 8,
          // The HUD occupies the top-left corner when it is shown.
          clear = r.left + 10 + (this.hud.hidden ? 0 : this.hud.offsetWidth + 8);
        if (beside >= clear) {
          left = beside;
          top += Math.max(0, (toolbarHeight - h) / 2);
        } else top += toolbarHeight + 6;
      }
      f.style.left = `${left}px`;
      f.style.top = `${top}px`;
      if (top < r.top + r.height / 2) band = Math.max(band, top - r.top + h);
    }
    this.toastNode.style.top = `${band ? band + 8 : 14}px`;
  }
  update(s: Settings) {
    this.settings = s;
    this.hud.hidden = !s.hud;
    this.divider.style.left = `${s.split * 100}%`;
    this.divider.hidden = !s.comparison || !this.canvasShown;
    this.syncFrame("toolbar", s.controls);
    this.syncFrame("compare", s.comparison);
    this.sendState();
    this.layout();
    this.applyVisibility();
  }
  status(d: Diagnostics) {
    const changed = this.host.dataset.state !== d.state;
    this.host.dataset.state = d.state;
    this.host.dataset.outputFps = String(d.outputFps);
    this.host.dataset.backend = d.backend ?? "";
    d.controlsAvailable = this.frames.size
      ? [...this.frames.values()].every((f) => this.ready.has(f))
      : undefined;
    if (!this.hud.hidden) this.renderHud(d);
    if (changed) this.sendState();
  }
  private renderHud(d: Diagnostics) {
    const budget = d.sourceFps > 0 ? 1000 / d.sourceFps : 0,
      share =
        d.gpuMs !== null && budget ? Math.min(100, (d.gpuMs / budget) * 100) : 0;
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
    const engine =
      ALGORITHM_LABELS[d.algorithm as keyof typeof ALGORITHM_LABELS] ??
      d.algorithm;
    this.hud.innerHTML = `<div class="title"><span>${escape(engine)}</span><b>${escape(d.backend || "Preparing")}</b></div>
      <dl>${row("Size", escape(d.resolution || "—"))}${row("Source", `${d.sourceFps.toFixed(2)} fps`)}${row("Enhanced", `${d.outputFps.toFixed(1)} fps`)}${row("GPU", d.gpuMs === null ? "—" : `${d.gpuMs.toFixed(2)} / ${budget ? budget.toFixed(1) : "—"} ms`)}${row("Skipped", String(d.dropped))}</dl>
      <div class="budget" title="GPU time against this video's frame budget"><i style="width:${share.toFixed(1)}%"></i></div>
      ${d.adaptive ? `<div class="note">${escape(d.adaptive)}</div>` : ""}`;
    localize(this.hud);
  }
  toast(html: string) {
    this.toastNode.innerHTML = html;
    localize(this.toastNode);
    this.toastNode.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(
      () => this.toastNode.classList.remove("show"),
      1800,
    );
  }
  showCanvas(show: boolean) {
    if (show === this.canvasShown) return;
    this.canvasShown = show;
    this.canvas.style.display = show ? "block" : "none";
    this.divider.hidden = !show || !this.settings.comparison;
  }
  resetCanvas() {
    const c = document.createElement("canvas");
    c.style.cssText = this.canvas.style.cssText;
    this.canvas.replaceWith(c);
    this.canvas = c;
    this.canvasShown = c.style.display === "block";
    this.layout();
  }
  /** Fullscreen on the player container keeps the enhanced canvas (video-element fullscreen cannot). */
  fullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    const container = this.video.parentElement;
    if (!container) return;
    this.restoreVideoStyle = this.video.style.cssText;
    // Players often pin explicit pixel sizes on the video; fill the screen instead.
    this.video.style.setProperty("width", "100%", "important");
    this.video.style.setProperty("height", "100%", "important");
    this.video.style.setProperty("left", "0", "important");
    this.video.style.setProperty("top", "0", "important");
    this.video.style.setProperty("object-fit", "contain", "important");
    void container.requestFullscreen().catch(() => {
      if (this.restoreVideoStyle !== null)
        this.video.style.cssText = this.restoreVideoStyle;
      this.restoreVideoStyle = null;
      this.toast("This page blocked fullscreen");
    });
  }
  destroy() {
    this.unbindLocale?.();
    clearInterval(this.tick);
    clearTimeout(this.sleepTimer);
    clearTimeout(this.toastTimer);
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.abort.abort();
    if (this.restoreVideoStyle !== null)
      this.video.style.cssText = this.restoreVideoStyle;
    for (const f of this.frames.values()) f.remove();
    this.frames.clear();
    this.ready.clear();
    this.host.remove();
  }
}
function escape(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
