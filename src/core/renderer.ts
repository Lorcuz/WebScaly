import { checkedShader, gpuDevice, holdDevice } from "./device";
import { Enhancement, HINT_SIZE } from "./enhancement";
import { GpuTimer } from "./gpu-timer";
import { FpsEstimator, outputSize, RateCounter } from "./timing";
import { PlayerOverlay } from "./overlay";
import type {
  Diagnostics,
  RendererState,
  UnavailableReason,
} from "../shared/player-status";
import {
  ALGORITHM_LABELS,
  type Settings,
} from "../shared/settings-core";
import { captureError, releaseSnapshot, snapshot } from "./source-frame";
import { WebGLSpatial } from "./webgl";
import { pixelCrop, type Crop } from "./crop";
import { Governor, maxLevel, plan, type Plan } from "./governor";
import type { Layout } from "./overlay";
import { animationScore, ContentHint } from "./content-hint";
import captureCode from "./shaders/capture.wgsl?raw";

export interface RendererServices {
  crop?: Crop;
  /** Called when the renderer's state (not its per-frame numbers) changes. */
  onState?: (d: Diagnostics) => void;
  /** "preview": an extension-page demo with no captions or native controls. */
  layout?: Layout;
}
const HINT_INTERVAL = 3000;
/** How long a lost WebGL context may take to come back before the renderer reports a graphics failure (ms). */
const WEBGL_RESTORE_MS = 4000;
/** A display resize is applied once the player has kept its size this long (ms). */
const RESIZE_SETTLE = 150;
/**
 * Display-size reallocations whose error scopes have not reported yet, per device. Uncaptured errors are
 * device-wide: until the check reports, errors raised by frames on that device (the resizing renderer's next
 * frame, or another renderer's) belong to it, and its rejection rebuilds the resizing renderer.
 */
const pendingResizes = new WeakMap<GPUDevice, number>();
/** Settings whose change alters GPU cost or the user's quality target. */
const COST_KEYS = ["algorithm", "quality", "scale", "maxHeight"] as const;
const size = (w: number, h: number) => `${w}×${h}`;

/** Decoded frames are processed once; the native player retains audio and playback. */
export class VideoRenderer {
  /**
   * A tab that stays in the background this long gives its GPU pipeline back (surfaces, networks, and the
   * shared device once no renderer holds it); it is rebuilt when the tab is shown again. Short tab switches
   * keep everything. Tests may shorten it.
   */
  static hiddenReleaseMs = 60_000;
  private hiddenTimer?: ReturnType<typeof setTimeout>;
  private suspended = false;
  readonly view: PlayerOverlay;
  readonly diagnostics: Diagnostics;
  private device?: GPUDevice;
  private context?: GPUCanvasContext;
  private enhancement?: Enhancement;
  private timer?: GpuTimer;
  private webgl?: WebGLSpatial;
  private pipeline?: GPUComputePipeline;
  private sampler?: GPUSampler;
  private region?: GPUBuffer;
  private plan?: Plan;
  private governor = new Governor();
  private hint = new ContentHint();
  private hintAt = 0;
  private battery = false;
  private holding = false;
  private gpuRetried = false;
  /** Set by a failure that repeats on every attempt (cross-origin frames): no automatic retries until a new source or an explicit retry. */
  private terminal = false;
  private releaseDevice?: () => void;
  /** Listeners of the current WebGL canvas; replaced with every WebGL engine, aborted on stop. */
  private webglEvents?: AbortController;
  private webglRestore?: ReturnType<typeof setTimeout>;
  private statusAt = 0;
  /** Display resizes applied in place since construction (diagnostics and tests). */
  resizes = 0;
  private limit?: { settings: Settings; battery: boolean; value: number };
  private snapshotRequest?: (blob: Blob | null) => void;
  private epoch = 0;
  private active = false;
  private disposed = false;
  private busy = false;
  private redraw = false;
  private vfc = 0;
  private init?: Promise<void>;
  private failures = 0;
  private width = 0;
  private height = 0;
  private lastTime = -1;
  private source = new FpsEstimator();
  private output = new RateCounter();
  private abort = new AbortController();
  private resize: ResizeObserver;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private runningMessage = "Video enhancement active";
  constructor(
    readonly video: HTMLVideoElement,
    private settings: Settings,
    asset: (p: string) => string,
    private changed?: (settings: Settings, patch: Partial<Settings>) => void,
    private services?: RendererServices & { crop?: Crop },
  ) {
    this.diagnostics = {
      state: "idle",
      message: "Ready",
      algorithm: settings.algorithm,
      quality: settings.quality,
      sourceFps: 0,
      outputFps: 0,
      gpuMs: null,
      dropped: 0,
      decoded: 0,
      resolution: "",
      backend: "",
      adaptive: "",
      hint: "",
    };
    this.view = new PlayerOverlay(
      video,
      settings,
      {
        toggle: () => {
          if (this.diagnostics.state === "unavailable") {
            this.terminal = false;
            void this.restart();
            return;
          }
          this.change({ enabled: !this.settings.enabled });
        },
        change: (patch, commit = true) => this.change(patch, commit),
        original: (on) => this.setOriginal(on),
        snapshot: () => void this.saveSnapshot(),
      },
      asset,
      services?.layout,
    );
    const options = { signal: this.abort.signal };
    for (const event of ["seeking", "emptied"])
      video.addEventListener(
        event,
        () => {
          this.reset();
          this.view.showCanvas(false);
        },
        options,
      );
    video.addEventListener(
      "emptied",
      () => {
        this.terminal = false;
        this.hint.reset();
        const stepped = this.governor.level > 0;
        this.governor.reset();
        // The running plan was reduced for the previous source; return it to the saved settings.
        if (stepped) this.applyPlan();
        if (this.diagnostics.state === "skipped") this.diagnostics.state = "idle";
      },
      options,
    );
    // Adaptive streams change resolution mid-play; a skipped video may now qualify.
    video.addEventListener(
      "resize",
      () => {
        if (
          this.diagnostics.state === "skipped" &&
          this.settings.enabled &&
          !(this.settings.skipAbove && video.videoHeight > this.settings.skipAbove)
        )
          void this.start();
      },
      options,
    );
    for (const event of ["loadeddata", "seeked", "play", "loadedmetadata"])
      video.addEventListener(
        event,
        () => {
          if (!this.active) {
            if (
              this.settings.enabled &&
              this.diagnostics.state !== "skipped" &&
              !this.terminal
            )
              void this.start();
          } else if (
            video.videoWidth !== this.width ||
            video.videoHeight !== this.height
          )
            void this.restart();
          else {
            // The display may have changed while the source was empty (resizeOutput waits for a frame).
            this.resizeOutput();
            this.render(video.currentTime, false);
          }
        },
        options,
      );
    video.addEventListener("ratechange", () => this.reset(), options);
    video.addEventListener(
      "pause",
      () => {
        this.output.reset();
        this.diagnostics.outputFps = 0;
        this.view.status(this.diagnostics);
      },
      options,
    );
    // When the <video> element itself is fullscreen the canvas cannot be shown (the overlay hides it),
    // so frames are not processed; one frame is rendered again on exit.
    document.addEventListener(
      "fullscreenchange",
      () => {
        if (this.active && document.fullscreenElement !== video)
          this.render(video.currentTime, false);
      },
      options,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        this.reset();
        this.governor.settle(performance.now(), 2000);
        clearTimeout(this.hiddenTimer);
        if (document.hidden) {
          this.hiddenTimer = setTimeout(() => this.suspend(), VideoRenderer.hiddenReleaseMs);
          return;
        }
        if (this.suspended) {
          this.suspended = false;
          void this.start();
        } else if (this.active) this.render(video.currentTime, false);
      },
      options,
    );
    // A player resize (fullscreen, theatre mode, window) changes only the display size: the pipeline is
    // kept and only its display-size surface follows, once the size has settled.
    this.resize = new ResizeObserver(() => {
      if (this.settings.scale !== "auto") return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.resizeOutput(), RESIZE_SETTLE);
    });
    this.resize.observe(video);
  }
  private textureLimit() {
    return (
      this.device?.limits.maxTextureDimension2D ??
      Number(this.webgl?.gl.getParameter(this.webgl.gl.MAX_TEXTURE_SIZE) ?? 4096)
    );
  }
  private outputFor(
    settings: Settings,
    limit = this.textureLimit(),
    width = this.video.videoWidth,
    height = this.video.videoHeight,
  ) {
    const r = pixelCrop(width, height, this.services?.crop);
    return outputSize(
      r.width,
      r.height,
      this.video.clientHeight * devicePixelRatio,
      settings,
      limit,
    );
  }
  private computePlan() {
    return plan(
      this.settings,
      this.settings.adaptive ? this.governor.level : 0,
      this.battery,
    );
  }
  private change(patch: Partial<Settings>, commit = true) {
    const next = { ...this.settings, ...patch };
    if (commit) this.changed?.(next, patch);
    void this.configure(next);
  }
  async start() {
    if (this.disposed || !this.settings.enabled) return;
    if (this.suspended && document.hidden) return;
    // A lost WebGL context is being waited for: its restore (or timeout) decides, not a media event.
    if (this.webglRestore !== undefined) return;
    this.suspended = false;
    if (this.init) return this.init;
    const generation = ++this.epoch;
    this.init = this.initialize(generation)
      .catch((e) => {
        if (generation === this.epoch && !this.disposed) this.fail(e);
      })
      .finally(() => {
        this.init = undefined;
      });
    return this.init;
  }
  private async initialize(generation: number) {
    this.setState("loading", "Preparing enhancement");
    if (this.video.mediaKeys)
      throw new Error("Protected media cannot be enhanced.");
    if (this.video.readyState < 2 || !this.video.videoWidth) {
      this.setState("waiting", "Waiting for a decoded frame");
      return;
    }
    const skip = this.settings.skipAbove;
    if (skip && this.video.videoHeight > skip) {
      this.diagnostics.resolution = size(
        this.video.videoWidth,
        this.video.videoHeight,
      );
      this.setState(
        "skipped",
        `${this.video.videoHeight}p source is already sharp, so it plays natively.`,
      );
      return;
    }
    this.view.resetCanvas();
    let gpu;
    try {
      gpu = await gpuDevice();
    } catch {
      if (generation === this.epoch && !this.disposed) this.webglOrGraphicsError();
      return;
    }
    if (generation !== this.epoch || this.disposed) return;
    // One size for everything built below. The video may change resolution during the awaits that follow;
    // render() then sees the mismatch on its first frame and rebuilds for the new size.
    const vw = this.video.videoWidth,
      vh = this.video.videoHeight;
    if (!vw || !vh) {
      this.setState("waiting", "Waiting for a decoded frame");
      return;
    }
    const device = gpu.device,
      current = this.computePlan(),
      settings = current.settings,
      region = pixelCrop(vw, vh, this.services?.crop),
      neural = settings.algorithm !== "spatial";
    // CNN surfaces (including their 2x output) stay bounded independently of display size.
    const cap = neural ? Math.min(720, settings.maxHeight) : settings.maxHeight,
      limit = device.limits.maxTextureDimension2D / (neural ? 2 : 1);
    const ratio =
      Math.min(
        1,
        cap / region.height,
        limit / region.width,
        limit / region.height,
        Math.sqrt((neural ? 921600 : 2073600) / (region.width * region.height)),
      ) * current.workScale;
    const w = Math.max(1, Math.floor(region.width * ratio)),
      h = Math.max(1, Math.floor(region.height * ratio));
    const [ow, oh] = this.outputFor(
      settings,
      device.limits.maxTextureDimension2D,
      vw,
      vh,
    );
    const context = this.view.canvas.getContext("webgpu");
    if (!context) {
      this.view.resetCanvas();
      this.webglOrGraphicsError();
      return;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    let engine = new Enhancement(device, w, h, [ow, oh], settings),
      buffer: GPUBuffer | undefined,
      committed = false,
      fallback = false;
    try {
      try {
        await engine.initialize(format, ow > w || oh > h);
      } catch (e) {
        engine.destroy();
        if (!neural) throw e;
        fallback = true;
        engine = new Enhancement(device, w, h, [ow, oh], {
          ...settings,
          algorithm: "spatial",
        });
        await engine.initialize(format, ow > w || oh > h);
      }
      if (generation !== this.epoch || this.disposed) return;
      const pipeline = await device.createComputePipelineAsync({
        layout: "auto",
        compute: {
          module: await checkedShader(
            device,
            captureCode,
            "Decoded frame import",
          ),
          entryPoint: "main",
        },
      });
      if (generation !== this.epoch || this.disposed) return;
      buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(
        buffer,
        0,
        new Float32Array([
          region.x / vw,
          region.y / vh,
          region.width / vw,
          region.height / vh,
        ]),
      );
      this.view.canvas.width = ow;
      this.view.canvas.height = oh;
      context.configure({ device, format, alphaMode: "opaque" });
      this.device = device;
      this.releaseDevice = holdDevice();
      this.context = context;
      this.enhancement = engine;
      this.region = buffer;
      this.pipeline = pipeline;
      this.plan = current;
      this.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
      this.timer = new GpuTimer(device, (ms) => {
        if (!this.disposed) this.diagnostics.gpuMs = ms;
      });
      this.diagnostics.backend = "WebGPU";
      this.diagnostics.algorithm = fallback ? "spatial" : settings.algorithm;
      this.diagnostics.quality = settings.quality;
      this.diagnostics.source = [region.width, region.height];
      this.diagnostics.output = [ow, oh];
      this.diagnostics.resolution = `${size(region.width, region.height)} → ${size(ow, oh)}`;
      this.diagnostics.adaptive = current.note;
      this.runningMessage = fallback
        ? "Neural processing is unavailable on this device. Spatial Detail is active."
        : `${ALGORITHM_LABELS[settings.algorithm]} is enhancing this video.`;
      committed = true;
      this.activate(vw, vh);
      const reference = new WeakRef(this);
      void device.lost.then((info) => {
        const r = reference.deref();
        if (r?.device !== device || !r.active) return;
        r.stop();
        r.view.resetCanvas();
        // A driver reset usually recovers; retry WebGPU once before the WebGL fallback.
        if (info.reason !== "destroyed" && !r.gpuRetried) {
          r.gpuRetried = true;
          void r.start();
          return;
        }
        try {
          r.initializeWebGL();
        } catch (e) {
          r.fail(e, "graphics");
        }
      });
      device.addEventListener("uncapturederror", this.onGpuError, {
        signal: this.abort.signal,
      });
    } finally {
      if (!committed) {
        engine.destroy();
        buffer?.destroy();
      }
    }
  }
  /** WebGPU could not be used: fall back to WebGL, or report that no graphics API is available. */
  private webglOrGraphicsError() {
    try {
      this.initializeWebGL();
    } catch (e) {
      this.fail(e, "graphics");
    }
  }
  private initializeWebGL() {
    const current = this.computePlan();
    const engine = new WebGLSpatial(
      this.view.canvas,
      current.settings,
      this.services?.crop,
    );
    try {
      const limit = Number(engine.gl.getParameter(engine.gl.MAX_TEXTURE_SIZE));
      if (this.video.videoWidth > limit || this.video.videoHeight > limit)
        throw new Error("Video exceeds this device’s texture limits.");
      const r = pixelCrop(
          this.video.videoWidth,
          this.video.videoHeight,
          this.services?.crop,
        ),
        [w, h] = this.outputFor(current.settings, limit);
      this.view.canvas.width = w;
      this.view.canvas.height = h;
      this.webgl = engine;
      this.plan = current;
      this.diagnostics.backend = engine.backend;
      this.diagnostics.algorithm = "spatial";
      this.diagnostics.quality = current.settings.quality;
      this.diagnostics.gpuMs = null;
      this.diagnostics.source = [r.width, r.height];
      this.diagnostics.output = [w, h];
      this.diagnostics.resolution = `${size(r.width, r.height)} → ${size(w, h)}`;
      this.diagnostics.adaptive = current.note;
      this.runningMessage = `${engine.backend} Spatial Detail is active. Neural engines and deband need WebGPU.`;
      // A lost context (driver reset, GPU process restart, context limit) is recovered when the browser
      // restores it; until then the native video shows and nothing is drawn with dead objects.
      this.webglEvents?.abort();
      const events = (this.webglEvents = new AbortController()),
        canvas = this.view.canvas;
      canvas.addEventListener(
        "webglcontextlost",
        (e) => {
          e.preventDefault(); // allows webglcontextrestored
          if (engine === this.webgl) this.webglLost();
        },
        { signal: events.signal },
      );
      canvas.addEventListener(
        "webglcontextrestored",
        () => {
          if (engine === this.webgl) this.webglRestored();
        },
        { signal: events.signal },
      );
      this.activate(this.video.videoWidth, this.video.videoHeight);
    } catch (e) {
      engine.destroy();
      throw e;
    }
  }
  /** Releases the GPU pipeline of a tab that has stayed in the background (see hiddenReleaseMs). */
  private suspend() {
    if (!document.hidden || !this.active || this.disposed) return;
    this.stop();
    this.suspended = true;
    this.setState("waiting", "Paused in the background to free graphics memory; resumes when the tab is shown.");
  }
  private webglLost() {
    this.active = false;
    this.video.cancelVideoFrameCallback(this.vfc);
    this.busy = false;
    this.view.showCanvas(false);
    this.setState("waiting", "Graphics were reset. Reconnecting; the video keeps playing.");
    clearTimeout(this.webglRestore);
    const engine = this.webgl;
    this.webglRestore = setTimeout(() => {
      this.webglRestore = undefined;
      if (engine !== this.webgl) return;
      this.fail(
        new Error(
          "Graphics were reset and did not come back. Native playback continues; turn enhancement off and on to retry.",
        ),
        "graphics",
      );
    }, WEBGL_RESTORE_MS);
  }
  private webglRestored() {
    clearTimeout(this.webglRestore);
    this.webglRestore = undefined;
    // Every object of the lost context is gone (deleting them on the restored context would only raise
    // INVALID_OPERATION); build them again on the restored context of the same canvas.
    this.webgl = undefined;
    try {
      this.initializeWebGL();
    } catch (e) {
      this.fail(e, "graphics");
    }
  }
  private activate(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.diagnostics.reason = undefined;
    this.active = true;
    this.failures = 0;
    this.governor.settle(performance.now(), 2500);
    this.setState("active", this.runningMessage);
    this.render(this.video.currentTime, false);
    this.requestFrame();
    // The player may have been resized while the pipeline was being built.
    this.resizeOutput();
    // Started while the tab is already in the background (e.g. global pause lifted from another tab):
    // the release timer starts now, as it would have on a visibility change.
    if (document.hidden) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = setTimeout(() => this.suspend(), VideoRenderer.hiddenReleaseMs);
    }
  }
  /**
   * Follows a new display size without stopping: the canvas, the display-size surface and Anime4K's 2×
   * stage (when the display crosses the working size) change; compiled pipelines, working surfaces and
   * neural networks are kept. A new frame is drawn in the same task, so no blank canvas is shown.
   */
  private resizeOutput() {
    if (this.disposed || !this.active || !this.plan) return;
    // A new (or emptied) source is rebuilt by render(); only the display size is followed here.
    if (this.video.videoWidth !== this.width || this.video.videoHeight !== this.height) return;
    const [ow, oh] = this.outputFor(this.plan.settings),
      canvas = this.view.canvas;
    if (ow === canvas.width && oh === canvas.height) return;
    const engine = this.enhancement;
    if (engine) {
      let checked: Promise<void>;
      try {
        checked = engine.resize([ow, oh]);
      } catch {
        void this.restart();
        return;
      }
      const device = this.device!;
      pendingResizes.set(device, (pendingResizes.get(device) ?? 0) + 1);
      const settle = () => pendingResizes.set(device, Math.max(0, (pendingResizes.get(device) ?? 1) - 1));
      void checked.then(settle, () => {
        settle();
        // An allocation failed: rebuild through the normal path (with its fallbacks).
        if (engine === this.enhancement) void this.restart();
      });
    } else if (!this.webgl) return;
    canvas.width = ow;
    canvas.height = oh;
    const [sw, sh] = this.diagnostics.source ?? [0, 0];
    this.diagnostics.output = [ow, oh];
    this.diagnostics.resolution = `${size(sw, sh)} → ${size(ow, oh)}`;
    this.resizes++;
    this.render(this.video.currentTime, false, true);
    this.view.status(this.diagnostics);
  }
  private requestFrame() {
    if (this.active)
      this.vfc = this.video.requestVideoFrameCallback((_now, m) => {
        this.requestFrame();
        if (m.mediaTime !== this.lastTime) this.render(m.mediaTime, true);
      });
  }
  /** `force` draws even while the previous frame is still on the GPU (after a resize cleared the canvas). */
  private render(mediaTime: number, decoded: boolean, force = false) {
    if (
      !this.active ||
      document.hidden ||
      document.fullscreenElement === this.video ||
      this.video.seeking ||
      this.video.readyState < 2
    )
      return;
    if (
      this.width !== this.video.videoWidth ||
      this.height !== this.video.videoHeight
    ) {
      void this.restart();
      return;
    }
    // While the viewer holds "show original", the native video shows through
    // and no GPU work is spent.
    if (this.holding && !this.snapshotRequest) return;
    if (this.busy && !force) {
      if (decoded) {
        this.diagnostics.dropped++;
        // Skipped frames still describe the source rate (otherwise heavy drops halve "Source fps").
        this.source.observe(mediaTime);
      } else this.redraw = true;
      return;
    }
    this.redraw = false;
    const epoch = this.epoch,
      settings = this.plan!.settings,
      capture = this.snapshotRequest,
      compare = settings.comparison && !capture;
    try {
      if (this.webgl) {
        // A lost context draws nothing; the lost event switches to the native video and waits.
        if (!this.webgl.render(this.video, mediaTime, compare)) return;
      } else {
        const device = this.device!,
          engine = this.enhancement!,
          frame = snapshot(this.video, mediaTime);
        let timing: ReturnType<GpuTimer["start"]>,
          submitted = false;
        try {
          if (capture && settings.comparison) engine.update(settings, false);
          const encoder = device.createCommandEncoder();
          timing =
            decoded && this.diagnostics.decoded % 10 === 0
              ? this.timer!.start(encoder)
              : undefined;
          const group = device.createBindGroup({
            layout: this.pipeline!.getBindGroupLayout(0),
            entries: [
              {
                binding: 0,
                resource: device.importExternalTexture({ source: frame }),
              },
              { binding: 1, resource: engine.work.createView() },
              { binding: 2, resource: this.sampler! },
              { binding: 3, resource: { buffer: this.region! } },
            ],
          });
          const pass = encoder.beginComputePass();
          pass.setPipeline(this.pipeline!);
          pass.setBindGroup(0, group);
          pass.dispatchWorkgroups(
            Math.ceil(engine.work.width / 8),
            Math.ceil(engine.work.height / 8),
          );
          pass.end();
          engine.encode(encoder, this.context!.getCurrentTexture());
          this.timer!.end(encoder, timing);
          device.queue.submit([encoder.finish()]);
          submitted = true;
          this.timer!.read(timing);
        } finally {
          // A failed encode must not keep a timer slot (three leaks freeze GPU time) or leave the split off.
          if (!submitted) this.timer?.cancel(timing);
          if (capture && settings.comparison) engine.update(settings);
          releaseSnapshot(frame);
        }
        this.busy = true;
        void device.queue
          .onSubmittedWorkDone()
          .then(() => {
            if (epoch === this.epoch) {
              this.busy = false;
              if (this.redraw) this.render(this.video.currentTime, false);
            }
          })
          .catch((e) => {
            if (epoch === this.epoch) this.fail(e);
          });
      }
      if (capture) {
        // The canvas still holds this task's frame, so the PNG matches what was drawn.
        this.snapshotRequest = undefined;
        this.view.canvas.toBlob((blob) => capture(blob), "image/png");
      }
      this.lastTime = mediaTime;
      this.failures = 0;
      const now = performance.now();
      if (decoded) {
        this.source.observe(mediaTime);
        this.output.add(now);
        this.diagnostics.decoded++;
        this.observeLoad(now);
        // An adaptive rebuild stopped this session: its new canvas is not configured yet.
        if (epoch !== this.epoch) return;
        if (now - this.hintAt > HINT_INTERVAL && !this.video.paused)
          this.sampleHint(now);
      }
      this.diagnostics.sourceFps = this.source.fps;
      this.diagnostics.outputFps = this.video.paused
        ? 0
        : this.output.value(now);
      this.view.showCanvas(!this.holding);
      if (
        this.diagnostics.state !== "active" ||
        this.diagnostics.message !== this.runningMessage
      )
        this.setState("active", this.runningMessage);
      else if (now - this.statusAt > 250) {
        // Numbers (fps, GPU time) refresh at 4 Hz instead of on every frame.
        this.statusAt = now;
        this.view.status(this.diagnostics);
      }
    } catch (e) {
      if (capture) {
        this.snapshotRequest = undefined;
        capture(null);
      }
      if (
        e instanceof DOMException &&
        ["InvalidStateError", "OperationError"].includes(e.name) &&
        ++this.failures < 8
      ) {
        this.view.showCanvas(false);
        this.setState("waiting", "Waiting for an accessible decoded frame");
      } else this.fail(e);
    }
  }
  private observeLoad(now: number) {
    if (!this.settings.adaptive) return;
    if (
      this.limit?.settings !== this.settings ||
      this.limit.battery !== this.battery
    )
      this.limit = {
        settings: this.settings,
        battery: this.battery,
        value: maxLevel(this.settings, this.battery),
      };
    const limit = this.limit.value;
    if (
      this.governor.observe(
        {
          now,
          decoded: this.diagnostics.decoded,
          dropped: this.diagnostics.dropped,
          gpuMs: this.diagnostics.gpuMs,
          fps: this.diagnostics.sourceFps,
          playing: !this.video.paused,
        },
        limit,
      )
    ) {
      const next = this.computePlan();
      this.view.toast(
        `Lighter processing to keep up · <b>${next.note.replace(/^.*Adaptive: /, "")}</b>`,
      );
      this.applyPlan(next);
    }
  }
  /** Applies the current plan: uniforms in place when possible, a rebuild only when surfaces or networks change. */
  private applyPlan(next = this.computePlan()) {
    if (!this.active || !this.plan) return;
    if (needsRebuild(this.plan, next)) {
      void this.restart();
      return;
    }
    this.plan = next;
    this.diagnostics.adaptive = next.note;
    this.diagnostics.quality = next.settings.quality;
    this.enhancement?.update(next.settings);
    this.webgl?.update(next.settings);
  }
  private sampleHint(now: number) {
    this.hintAt = now;
    const engine = this.enhancement;
    if (!engine) return;
    void engine.thumbnail().then((thumb) => {
      if (!thumb || engine !== this.enhancement) return;
      this.diagnostics.hint = this.hint.observe(
        animationScore(thumb.data, HINT_SIZE[0], HINT_SIZE[1], thumb.stride),
      );
    });
  }
  async configure(s: Settings) {
    const old = this.settings;
    this.settings = s;
    this.view.update(s);
    if (!s.enabled) {
      this.terminal = false;
      this.stop();
      this.setState("disabled", "Enhancement is off for this website.");
      return;
    }
    // Only changes of cost or target reset adaptive steps; sharpening and colour sliders are uniforms.
    if (COST_KEYS.some((k) => old[k] !== s[k]) || old.adaptive !== s.adaptive)
      this.governor.reset();
    if (this.terminal) return; // retried explicitly from the toolbar or by a new source
    if (old.skipAbove !== s.skipAbove) {
      await this.restart();
      return;
    }
    const next = this.computePlan();
    if (!this.active || !this.plan || needsRebuild(this.plan, next)) {
      await this.restart();
      return;
    }
    this.plan = next;
    this.diagnostics.adaptive = next.note;
    this.enhancement?.update(next.settings);
    this.webgl?.update(next.settings);
    this.render(this.video.currentTime, false);
  }
  /** Battery saver from the content script; rebuilds only when the plan changes. */
  setBattery(on: boolean) {
    if (this.battery === on) return;
    this.battery = on;
    if (this.settings.enabled) void this.configure(this.settings);
  }
  setOriginal(on: boolean) {
    this.holding = on;
    this.view.showCanvas(!on && this.active);
    if (!on) this.render(this.video.currentTime, false);
  }
  /** Resolves with a PNG of the current enhanced frame (comparison split excluded). */
  snapshot(): Promise<Blob | null> {
    if (!this.active) return Promise.resolve(null);
    this.snapshotRequest?.(null);
    return new Promise((resolve) => {
      this.snapshotRequest = resolve;
      if (this.busy) this.redraw = true;
      else this.render(this.video.currentTime, false);
    });
  }
  private async saveSnapshot() {
    const blob = await this.snapshot();
    if (!blob) {
      this.view.toast("Snapshot unavailable until enhancement is active");
      return;
    }
    download(blob, location.hostname);
    this.view.toast("Snapshot saved");
  }
  toast(html: string) {
    this.view.toast(html);
  }
  private async restart() {
    this.stop();
    if (this.init) await this.init;
    if (!this.disposed) await this.start();
  }
  private reset() {
    this.source.reset();
    this.output.reset();
    this.lastTime = -1;
    this.diagnostics.sourceFps = 0;
    this.diagnostics.outputFps = 0;
  }
  private setState(state: RendererState, message: string) {
    const changed =
      this.diagnostics.state !== state || this.diagnostics.message !== message;
    this.diagnostics.state = state;
    this.diagnostics.message = message;
    this.view.status(this.diagnostics);
    if (changed) this.services?.onState?.(this.diagnostics);
  }
  private onGpuError = (e: GPUUncapturedErrorEvent) => {
    if (this.active && !(pendingResizes.get(e.target as GPUDevice) ?? 0)) this.fail(new Error(e.error.message));
  };
  private fail(e: unknown, reason?: UnavailableReason) {
    const crossOrigin = e instanceof DOMException && e.name === "SecurityError";
    if (crossOrigin) this.terminal = true;
    this.stop();
    this.diagnostics.reason =
      reason ??
      (this.video.mediaKeys ? "protected" : crossOrigin ? "cross-origin" : "error");
    this.setState("unavailable", captureError(e));
  }
  stop() {
    this.active = false;
    this.epoch++;
    this.video.cancelVideoFrameCallback(this.vfc);
    this.busy = false;
    this.redraw = false;
    this.snapshotRequest?.(null);
    this.snapshotRequest = undefined;
    this.view.showCanvas(false);
    this.device?.removeEventListener("uncapturederror", this.onGpuError);
    this.enhancement?.destroy();
    this.enhancement = undefined;
    this.timer?.destroy();
    this.timer = undefined;
    this.webglEvents?.abort();
    this.webglEvents = undefined;
    clearTimeout(this.webglRestore);
    this.webglRestore = undefined;
    this.webgl?.destroy();
    this.webgl = undefined;
    this.region?.destroy();
    this.region = undefined;
    this.context?.unconfigure();
    this.context = undefined;
    this.device = undefined;
    this.releaseDevice?.();
    this.releaseDevice = undefined;
    this.plan = undefined;
    this.reset();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.hiddenTimer);
    this.stop();
    this.resize.disconnect();
    clearTimeout(this.resizeTimer);
    this.abort.abort();
    this.view.destroy();
  }
}
function needsRebuild(a: Plan, b: Plan) {
  const x = a.settings,
    y = b.settings;
  return (
    x.algorithm !== y.algorithm ||
    x.scale !== y.scale ||
    x.maxHeight !== y.maxHeight ||
    a.workScale !== b.workScale ||
    // Anime4K picks different networks per quality; other engines only change a filter.
    (x.algorithm === "anime4k" && x.quality !== y.quality)
  );
}
export function download(blob: Blob, host: string) {
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `webscaly-${host.replace(/[^\w.-]/g, "") || "video"}-${stamp}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
