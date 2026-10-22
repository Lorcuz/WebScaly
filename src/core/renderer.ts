import { checkedShader, gpuDevice } from "./device";
import { Enhancement, HINT_SIZE } from "./enhancement";
import { GpuTimer } from "./gpu-timer";
import { FpsEstimator, outputSize, RateCounter } from "./timing";
import { PlayerOverlay } from "./overlay";
import type { Diagnostics, RendererState } from "../shared/player-status";
import {
  ALGORITHM_LABELS,
  PICTURE_KEYS,
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
const size = (w: number, h: number) => `${w}×${h}`;

/** Decoded frames are processed once; the native player retains audio and playback. */
export class VideoRenderer {
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
        this.hint.reset();
        this.governor.reset();
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
            if (this.settings.enabled && this.diagnostics.state !== "skipped")
              void this.start();
          } else if (
            video.videoWidth !== this.width ||
            video.videoHeight !== this.height
          )
            void this.restart();
          else this.render(video.currentTime, false);
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
    document.addEventListener(
      "visibilitychange",
      () => {
        this.reset();
        this.governor.settle(performance.now(), 2000);
        if (!document.hidden && this.active)
          this.render(video.currentTime, false);
      },
      options,
    );
    this.resize = new ResizeObserver(() => {
      if (!this.active || this.settings.scale !== "auto" || !this.plan) return;
      const [w, h] = this.outputFor(this.plan.settings);
      if (w !== this.view.canvas.width || h !== this.view.canvas.height) {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          if (!this.disposed) void this.restart();
        }, 250);
      }
    });
    this.resize.observe(video);
  }
  private textureLimit() {
    return (
      this.device?.limits.maxTextureDimension2D ??
      Number(this.webgl?.gl.getParameter(this.webgl.gl.MAX_TEXTURE_SIZE) ?? 4096)
    );
  }
  private outputFor(settings: Settings, limit = this.textureLimit()) {
    const r = pixelCrop(
      this.video.videoWidth,
      this.video.videoHeight,
      this.services?.crop,
    );
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
      if (generation === this.epoch && !this.disposed) this.initializeWebGL();
      return;
    }
    if (generation !== this.epoch || this.disposed) return;
    const device = gpu.device,
      current = this.computePlan(),
      settings = current.settings,
      region = pixelCrop(
        this.video.videoWidth,
        this.video.videoHeight,
        this.services?.crop,
      ),
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
    const [ow, oh] = this.outputFor(settings, device.limits.maxTextureDimension2D);
    const context = this.view.canvas.getContext("webgpu");
    if (!context) {
      this.view.resetCanvas();
      this.initializeWebGL();
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
          region.x / this.video.videoWidth,
          region.y / this.video.videoHeight,
          region.width / this.video.videoWidth,
          region.height / this.video.videoHeight,
        ]),
      );
      this.view.canvas.width = ow;
      this.view.canvas.height = oh;
      context.configure({ device, format, alphaMode: "opaque" });
      this.device = device;
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
      this.activate();
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
          r.fail(e);
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
      this.view.canvas.addEventListener(
        "webglcontextlost",
        (e) => {
          e.preventDefault();
          if (this.active)
            this.fail(
              new Error("Graphics context lost. Retry from the popup."),
            );
        },
        { signal: this.abort.signal },
      );
      this.activate();
    } catch (e) {
      engine.destroy();
      throw e;
    }
  }
  private activate() {
    this.width = this.video.videoWidth;
    this.height = this.video.videoHeight;
    this.active = true;
    this.failures = 0;
    this.governor.settle(performance.now(), 2500);
    this.setState("active", this.runningMessage);
    this.render(this.video.currentTime, false);
    this.requestFrame();
  }
  private requestFrame() {
    if (this.active)
      this.vfc = this.video.requestVideoFrameCallback((_now, m) => {
        this.requestFrame();
        if (m.mediaTime !== this.lastTime) this.render(m.mediaTime, true);
      });
  }
  private render(mediaTime: number, decoded: boolean) {
    if (
      !this.active ||
      document.hidden ||
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
    if (this.busy) {
      if (decoded) this.diagnostics.dropped++;
      else this.redraw = true;
      return;
    }
    this.redraw = false;
    const epoch = this.epoch,
      settings = this.plan!.settings,
      capture = this.snapshotRequest,
      compare = settings.comparison && !capture;
    try {
      if (this.webgl) {
        this.webgl.render(this.video, mediaTime, compare);
      } else {
        const device = this.device!,
          engine = this.enhancement!,
          frame = snapshot(this.video, mediaTime);
        try {
          if (capture && settings.comparison) engine.update(settings, false);
          const encoder = device.createCommandEncoder(),
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
          this.timer!.read(timing);
          if (capture && settings.comparison) engine.update(settings);
        } finally {
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
        if (now - this.hintAt > HINT_INTERVAL && !this.video.paused)
          this.sampleHint(now);
      }
      this.diagnostics.sourceFps = this.source.fps;
      this.diagnostics.outputFps = this.video.paused
        ? 0
        : this.output.value(now);
      this.view.showCanvas(!this.holding);
      this.setState("active", this.runningMessage);
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
    const limit = maxLevel(this.settings, this.battery);
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
      void this.restart();
    }
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
      this.stop();
      this.setState("disabled", "Enhancement is off for this website.");
      return;
    }
    if (PICTURE_KEYS.some((k) => old[k] !== s[k]) || old.adaptive !== s.adaptive)
      this.governor.reset();
    if (this.diagnostics.state === "skipped" && old.skipAbove !== s.skipAbove) {
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
    if (this.active) this.fail(new Error(e.error.message));
  };
  private fail(e: unknown) {
    this.stop();
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
    this.webgl?.destroy();
    this.webgl = undefined;
    this.region?.destroy();
    this.region = undefined;
    this.context?.unconfigure();
    this.context = undefined;
    this.device = undefined;
    this.plan = undefined;
    this.reset();
  }
  dispose() {
    this.disposed = true;
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
