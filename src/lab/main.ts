import { VideoRenderer } from "../core/renderer";
import { DEFAULTS, type Settings } from "../shared/settings";
import "../ui/styles.css";

const root = document.querySelector<HTMLDivElement>("#root")!;
root.innerHTML = `<main class="lab"><header class="brand"><img src="./icons/32.png" width="36" height="36" alt=""><div><h1>WebScaly</h1><p>Controlled video laboratory</p></div><span class="badge">LOCAL FIXTURE</span></header>
  <p>Procedural footage created on this computer. Choose a source, then start playback. No network video or camera access.</p>
  <div class="lab-controls"><label>Source FPS<select id="fps"><option>24</option><option selected>30</option><option>60</option></select></label>
  <label>Resolution<select id="resolution"><option value="640">360p</option><option value="1280" selected>720p</option><option value="1920">1080p</option></select></label>
  <label>Fixture<select id="fixture"><option value="motion">Motion and detail</option><option value="anime">Animation on twos</option><option value="cut">Scene cuts</option><option value="static">Static frame</option></select></label>
  <button id="start" class="primary">Create video</button><button id="enhance" disabled>Enable WebScaly</button></div>
  <div class="player"><video id="video" controls muted playsinline></video></div>
  <div class="lab-controls"><label>Algorithm<select id="algorithm" aria-label="Algorithm"><option value="spatial">Spatial detail</option><option value="anime4k">Anime4K CNN</option><option value="fsrcnnx">FSRCNNX x2</option></select></label>
  <label>Playback speed<select id="speed"><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select></label>
  <button id="pause">Pause / resume</button><button id="fullscreen">Player fullscreen</button><button id="remove">Remove player</button></div>
  <output id="status" class="lab-status" aria-live="polite">Ready to create a fixture.</output><pre id="diagnostics"></pre><a href="./options.html">Settings preview</a>
  <p class="muted">captureStream fixtures exercise decode callbacks and GPU access. Recorded playback/seek fixtures are covered by the automated tests.</p></main>`;
const video = document.querySelector<HTMLVideoElement>("#video")!;
let renderer: VideoRenderer | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let stream: MediaStream | undefined;
let settings: Settings = {
  ...DEFAULTS,
  scale: "2",
  hud: true,
  comparison: true,
  controls: true,
};
const state = document.querySelector<HTMLOutputElement>("#status")!;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d")!;
function renderFixture(index: number, fps: number, fixture: string) {
  const w = canvas.width,
    h = canvas.height;
  const time =
    (fixture === "anime"
      ? Math.floor(index / 2) * 2
      : fixture === "static"
        ? 0
        : index) / fps;
  const cut = fixture === "cut" && Math.floor(time / 2) % 2;
  ctx.fillStyle = cut ? "#a93447" : "#122332";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#3b566c";
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += w / 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  const x = w * (0.5 + 0.3 * Math.sin(time * 1.2));
  ctx.fillStyle = "#79dfbd";
  ctx.beginPath();
  ctx.arc(x, h * 0.45, h * 0.12, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#f4cb7d";
  ctx.fillRect(w - x - h * 0.09, h * 0.55, h * 0.18, h * 0.18);
  const visibleIndex =
    fixture === "anime"
      ? Math.floor(index / 2) * 2
      : fixture === "static"
        ? 0
        : index;
  ctx.font = `${Math.round(h * 0.045)}px system-ui`;
  ctx.fillStyle = "#edf3f7";
  ctx.fillText(
    `WebScaly · ${fps} FPS · frame ${visibleIndex}`,
    w * 0.04,
    h * 0.09,
  );
  ctx.font = `${Math.round(h * 0.031)}px system-ui`;
  ctx.fillText(
    "Fine lines / moving edges / synchronized comparison",
    w * 0.04,
    h * 0.88,
  );
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 100; i++)
    ctx.fillRect(w * 0.05 + i * 3, h * 0.2, 1, h * 0.1);
}
async function createFixture() {
  const enhance = document.querySelector<HTMLButtonElement>("#enhance")!;
  enhance.disabled = true;
  renderer?.dispose();
  renderer = undefined;
  clearInterval(interval);
  stream?.getTracks().forEach((t) => t.stop());
  const fps = Number(
    (document.querySelector("#fps") as HTMLSelectElement).value,
  );
  const width = Number(
    (document.querySelector("#resolution") as HTMLSelectElement).value,
  );
  canvas.width = width;
  canvas.height = Math.round((width * 9) / 16);
  const fixture = (document.querySelector("#fixture") as HTMLSelectElement)
    .value;
  let index = 0;
  renderFixture(index, fps, fixture);
  stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  interval = setInterval(() => {
    renderFixture(index++, fps, fixture);
    track.requestFrame();
  }, 1000 / fps);
  video.srcObject = stream;
  await video.play();
  await new Promise<void>((resolve) =>
    video.requestVideoFrameCallback(() => resolve()),
  );
  enhance.disabled = false;
  state.textContent = `Playing ${fps} FPS ${canvas.height}p procedural fixture.`;
  if (new URLSearchParams(location.search).has("gpu")) await enable();
}
async function enable() {
  if (!video.videoWidth) {
    state.textContent = "Create a video first.";
    return;
  }
  renderer?.dispose();
  renderer = new VideoRenderer(video, settings, (p) =>
    globalThis.chrome?.runtime?.id ? chrome.runtime.getURL(p) : `./${p}`,
  );
  await renderer.start();
  state.textContent = renderer.diagnostics.message;
}
document.querySelector("#start")!.addEventListener("click", () => {
  void createFixture();
});
document.querySelector("#enhance")!.addEventListener("click", () => {
  void enable();
});
document.querySelector("#algorithm")!.addEventListener("change", (e) => {
  settings = {
    ...settings,
    algorithm: (e.target as HTMLSelectElement).value as Settings["algorithm"],
  };
  void renderer?.configure(settings);
});
document.querySelector("#speed")!.addEventListener("change", (e) => {
  video.playbackRate = Number((e.target as HTMLSelectElement).value);
});
document.querySelector("#pause")!.addEventListener("click", () => {
  if (video.paused) void video.play();
  else video.pause();
});
document.querySelector("#fullscreen")!.addEventListener("click", () => {
  void document.querySelector(".player")!.requestFullscreen();
});
document.querySelector("#remove")!.addEventListener("click", () => {
  renderer?.dispose();
  renderer = undefined;
  video.remove();
  clearInterval(interval);
  stream?.getTracks().forEach((t) => t.stop());
  state.textContent = "Player removed. Renderer disposed.";
});
setInterval(() => {
  document.querySelector("#diagnostics")!.textContent = renderer
    ? JSON.stringify(renderer.diagnostics, null, 2)
    : "No renderer.";
}, 500);
window.addEventListener("pagehide", () => {
  renderer?.dispose();
  clearInterval(interval);
  stream?.getTracks().forEach((t) => t.stop());
});
