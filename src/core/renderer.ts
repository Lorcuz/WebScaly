import { checkedShader, gpuDevice } from "./device";
import { Enhancement } from "./enhancement";
import { GpuTimer } from "./gpu-timer";
import { FpsEstimator, outputSize, RateCounter } from "./timing";
import { PlayerOverlay, type Diagnostics } from "./overlay";
import type { Settings } from "../shared/settings";
import { captureError, releaseSnapshot, snapshot } from "./source-frame";
import { WebGLSpatial } from "./webgl";
import { pixelCrop, type Crop } from "./crop";
import captureCode from "./shaders/capture.wgsl?raw";

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
    private services?: { crop?: Crop },
  ) {
    this.diagnostics = {
      state: "idle",
      message: "Ready",
      algorithm: settings.algorithm,
      sourceFps: 0,
      outputFps: 0,
      gpuMs: null,
      dropped: 0,
      decoded: 0,
      resolution: "",
      backend: "",
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
      },
      asset,
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
    for (const event of ["loadeddata", "seeked", "play", "loadedmetadata"])
      video.addEventListener(
        event,
        () => {
          if (!this.active) {
            if (this.settings.enabled) void this.start();
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
        if (!document.hidden && this.active)
          this.render(video.currentTime, false);
      },
      options,
    );
    this.resize = new ResizeObserver(() => {
      this.view.layout();
      if (!this.active || this.settings.scale !== "auto") return;
      const limit =
        this.device?.limits.maxTextureDimension2D ??
        Number(this.webgl?.gl.getParameter(this.webgl.gl.MAX_TEXTURE_SIZE));
      const r = pixelCrop(this.width, this.height, this.services?.crop),
        [w, h] = outputSize(
          r.width,
          r.height,
          video.clientHeight * devicePixelRatio,
          this.settings,
          limit,
        );
      if (w !== this.view.canvas.width || h !== this.view.canvas.height) {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
          if (!this.disposed) void this.restart();
        }, 200);
      }
    });
    this.resize.observe(video);
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
      settings = { ...this.settings },
      region = pixelCrop(
        this.video.videoWidth,
        this.video.videoHeight,
        this.services?.crop,
      ),
      neural = settings.algorithm !== "spatial";
    // CNN surfaces (including their 2x output) stay bounded independently of display size.
    const cap = neural ? Math.min(720, settings.maxHeight) : settings.maxHeight,
      limit = device.limits.maxTextureDimension2D / (neural ? 2 : 1);
    const ratio = Math.min(
      1,
      cap / region.height,
      limit / region.width,
      limit / region.height,
      Math.sqrt((neural ? 921600 : 2073600) / (region.width * region.height)),
    );
    const w = Math.max(1, Math.floor(region.width * ratio)),
      h = Math.max(1, Math.floor(region.height * ratio));
    const [ow, oh] = outputSize(
      region.width,
      region.height,
      this.video.clientHeight * devicePixelRatio,
      settings,
      device.limits.maxTextureDimension2D,
    );
    const context = this.view.canvas.getContext("webgpu");
    if (!context) {
      this.view.resetCanvas();
      this.initializeWebGL();
      return;
    }
    let engine = new Enhancement(device, w, h, settings),
      buffer: GPUBuffer | undefined,
      committed = false,
      fallback = false;
    try {
      try {
        await engine.initialize(
          navigator.gpu.getPreferredCanvasFormat(),
          ow > w || oh > h,
        );
      } catch (e) {
        engine.destroy();
        if (!neural) throw e;
        fallback = true;
        engine = new Enhancement(device, w, h, {
          ...settings,
          algorithm: "spatial",
        });
        await engine.initialize(
          navigator.gpu.getPreferredCanvasFormat(),
          ow > w || oh > h,
        );
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
      context.configure({
        device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "opaque",
      });
      this.device = device;
      this.context = context;
      this.enhancement = engine;
      this.region = buffer;
      this.pipeline = pipeline;
      this.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
      this.timer = new GpuTimer(device, (ms) => {
        if (!this.disposed) this.diagnostics.gpuMs = ms;
      });
      this.diagnostics.backend = "WebGPU";
      this.diagnostics.algorithm = fallback ? "spatial" : settings.algorithm;
      this.diagnostics.resolution = `${w}×${h} → ${ow}×${oh}`;
      this.runningMessage = fallback
        ? "Neural processing is unavailable on this device. Spatial detail is active."
        : "Video enhancement active";
      committed = true;
      this.activate();
      const reference = new WeakRef(this);
      void device.lost.then(() => {
        const r = reference.deref();
        if (r?.device === device && r.active) {
          r.stop();
          r.view.resetCanvas();
          try {
            r.initializeWebGL();
          } catch (e) {
            r.fail(e);
          }
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
    const engine = new WebGLSpatial(
      this.view.canvas,
      this.settings,
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
        [w, h] = outputSize(
          r.width,
          r.height,
          this.video.clientHeight * devicePixelRatio,
          this.settings,
          limit,
        );
      this.view.canvas.width = w;
      this.view.canvas.height = h;
      this.webgl = engine;
      this.diagnostics.backend = engine.backend;
      this.diagnostics.algorithm = "spatial";
      this.diagnostics.gpuMs = null;
      this.diagnostics.resolution = `${r.width}×${r.height} → ${w}×${h}`;
      this.runningMessage = `${engine.backend} spatial detail is active. Neural engines require WebGPU.`;
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
    this.view.layout();
    if (this.busy) {
      if (decoded) this.diagnostics.dropped++;
      else this.redraw = true;
      return;
    }
    this.redraw = false;
    const epoch = this.epoch;
    try {
      if (this.webgl) this.webgl.render(this.video, mediaTime);
      else {
        const device = this.device!,
          engine = this.enhancement!,
          frame = snapshot(this.video, mediaTime);
        try {
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
          engine.encode(
            encoder,
            engine.work,
            this.context!.getCurrentTexture(),
          );
          this.timer!.end(encoder, timing);
          device.queue.submit([encoder.finish()]);
          this.timer!.read(timing);
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
      this.lastTime = mediaTime;
      this.failures = 0;
      if (decoded) {
        this.source.observe(mediaTime);
        this.output.add(performance.now());
        this.diagnostics.decoded++;
      }
      this.diagnostics.sourceFps = this.source.fps;
      this.diagnostics.outputFps = this.video.paused
        ? 0
        : this.output.value(performance.now());
      this.view.showCanvas(true);
      this.setState("active", this.runningMessage);
    } catch (e) {
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
  async configure(s: Settings) {
    const old = this.settings;
    this.settings = s;
    this.view.update(s);
    if (!s.enabled) {
      this.stop();
      this.setState("disabled", "Native playback");
      return;
    }
    const rebuild = ["algorithm", "quality", "scale", "maxHeight"].some(
      (k) => old[k as keyof Settings] !== s[k as keyof Settings],
    );
    if (rebuild || !this.active) await this.restart();
    else {
      this.enhancement?.update(s);
      this.webgl?.update(s);
      this.render(this.video.currentTime, false);
    }
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
  private setState(state: string, message: string) {
    this.diagnostics.state = state;
    this.diagnostics.message = message;
    this.view.status(this.diagnostics);
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
