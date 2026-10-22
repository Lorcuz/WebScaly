import { VideoRenderer } from "../core/renderer";
import { DEFAULTS, type Settings } from "../shared/settings";
import { fixtureStream, type FixtureKind } from "../shared/fixture";
import "../ui/styles.css";

const root = document.querySelector<HTMLDivElement>("#root")!;
root.innerHTML = `<main class="lab"><header class="brand"><img src="./icons/32.png" width="36" height="36" alt=""><div><h1>WebScaly</h1><p>Controlled video laboratory</p></div><span class="badge">Local fixture</span></header>
  <p>Procedural footage created on this computer. Choose a source, then start playback. No network video or camera access.</p>
  <div class="lab-controls"><label>Source FPS<select id="fps"><option>24</option><option selected>30</option><option>60</option></select></label>
  <label>Resolution<select id="resolution"><option value="640">360p</option><option value="1280" selected>720p</option><option value="1920">1080p</option></select></label>
  <label>Fixture<select id="fixture"><option value="motion">Motion and detail</option><option value="anime">Animation on twos</option><option value="cut">Scene cuts</option><option value="static">Static frame</option><option value="preview">Test card</option></select></label>
  <button id="start" class="primary">Create video</button><button id="enhance" disabled>Enable WebScaly</button></div>
  <div class="player"><video id="video" controls muted playsinline></video></div>
  <div class="lab-controls"><label>Algorithm<select id="algorithm" aria-label="Algorithm"><option value="spatial">Spatial detail</option><option value="anime4k">Anime4K CNN</option><option value="fsrcnnx">FSRCNNX x2</option></select></label>
  <label>Quality<select id="quality" aria-label="Quality"><option value="fast">Fast</option><option value="balanced" selected>Balanced</option><option value="quality">Quality</option></select></label>
  <label>Playback speed<select id="speed"><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select></label>
  <button id="pause">Pause / resume</button><button id="fullscreen">Player fullscreen</button><button id="remove">Remove player</button></div>
  <output id="status" class="lab-status" aria-live="polite">Ready to create a fixture.</output><pre id="diagnostics"></pre><a href="./options.html">Settings preview</a>
  <p class="muted">captureStream fixtures exercise decode callbacks and GPU access. Recorded playback/seek fixtures are covered by the automated tests.</p></main>`;
const video = document.querySelector<HTMLVideoElement>("#video")!;
let renderer: VideoRenderer | undefined;
let source: ReturnType<typeof fixtureStream> | undefined;
let settings: Settings = {
  ...DEFAULTS,
  scale: "2",
  hud: true,
  comparison: true,
  controls: true,
};
const state = document.querySelector<HTMLOutputElement>("#status")!;
async function createFixture() {
  const enhance = document.querySelector<HTMLButtonElement>("#enhance")!;
  enhance.disabled = true;
  renderer?.dispose();
  renderer = undefined;
  source?.stop();
  const fps = Number(
    (document.querySelector("#fps") as HTMLSelectElement).value,
  );
  const width = Number(
    (document.querySelector("#resolution") as HTMLSelectElement).value,
  );
  const height = Math.round((width * 9) / 16);
  const fixture = (document.querySelector("#fixture") as HTMLSelectElement)
    .value as FixtureKind;
  source = fixtureStream(width, height, fps, fixture);
  const stream = source.stream;
  video.srcObject = stream;
  await video.play();
  await new Promise<void>((resolve) =>
    video.requestVideoFrameCallback(() => resolve()),
  );
  enhance.disabled = false;
  state.textContent = `Playing ${fps} FPS ${height}p procedural fixture.`;
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
document.querySelector("#quality")!.addEventListener("change", (e) => {
  settings = {
    ...settings,
    quality: (e.target as HTMLSelectElement).value as Settings["quality"],
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
  source?.stop();
  state.textContent = "Player removed. Renderer disposed.";
});
setInterval(() => {
  document.querySelector("#diagnostics")!.textContent = renderer
    ? JSON.stringify(renderer.diagnostics, null, 2)
    : "No renderer.";
}, 500);
window.addEventListener("pagehide", () => {
  renderer?.dispose();
  source?.stop();
});
