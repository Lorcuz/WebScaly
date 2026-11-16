// Drives the real VideoRenderer directly (no extension) so tests can reach its lifecycle edge cases.
import { VideoRenderer } from "../../src/core/renderer";
import { DEFAULTS, type Settings } from "../../src/shared/settings";

const video = document.querySelector<HTMLVideoElement>("video")!;
let source: HTMLCanvasElement | undefined,
  timer: ReturnType<typeof setInterval> | undefined,
  stream: MediaStream | undefined;
const harness = {
  DEFAULTS,
  video,
  renderer: undefined as VideoRenderer | undefined,
  /** A procedural captureStream source whose size can change mid-stream. */
  async stream(width = 1280, fps = 30) {
    harness.stopSource();
    source = document.createElement("canvas");
    source.width = width;
    source.height = Math.round((width * 9) / 16);
    const ctx = source.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = "#142539";
      ctx.fillRect(0, 0, source!.width, source!.height);
      ctx.fillStyle = "#7ee1bf";
      ctx.fillRect((frame * 9) % Math.max(1, source!.width - 80), 40, 80, 80);
      frame++;
    };
    draw();
    stream = source.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    timer = setInterval(() => {
      draw();
      track.requestFrame();
    }, 1000 / fps);
    video.removeAttribute("src");
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((r) => video.requestVideoFrameCallback(() => r()));
  },
  /** Sets the CSS width of the player box (the video keeps 16:9). */
  resizePlayer(width: number) {
    document.querySelector<HTMLElement>(".player")!.style.width = `${width}px`;
  },
  resizeSource(width: number) {
    source!.width = width;
    source!.height = Math.round((width * 9) / 16);
  },
  async file(url: string) {
    harness.stopSource();
    video.srcObject = null;
    video.loop = true;
    video.src = url;
    await video.play();
    await new Promise<void>((r) => video.requestVideoFrameCallback(() => r()));
  },
  stopSource() {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
  },
  async start(settings: Partial<Settings> = {}) {
    harness.renderer?.dispose();
    harness.renderer = new VideoRenderer(
      video,
      { ...DEFAULTS, ...settings },
      (p) => `/${p}`,
    );
    await harness.renderer.start();
    return harness.renderer.diagnostics.state;
  },
};
declare global {
  interface Window {
    harness: typeof harness;
  }
}
window.harness = harness;
document.querySelector("#fullscreen-video")!.addEventListener("click", () => {
  void video.requestFullscreen();
});
// Fullscreen on the player container, as the in-player toolbar does: the enhanced canvas stays visible.
document.querySelector("#fullscreen-player")!.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.querySelector<HTMLElement>(".player")!.requestFullscreen();
});
