import { attachHelp } from "../ui/help";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "../ui/styles.css";
import "./viewer.css";
import { VideoRenderer } from "../core/renderer";
import { DEFAULTS, type Settings } from "../shared/settings";
import type { Crop } from "../core/crop";

const root = document.querySelector<HTMLDivElement>("#root")!;
root.innerHTML = `<main class="viewer" data-step="1">
  <header class="viewer-head"><img src="./icons/32.png" width="28" height="28" alt=""><h1>WebScaly</h1><span class="label">Compatibility player</span></header>
  <p id="source" class="lede">For players that block direct frame access: share the playing tab with this page and WebScaly enhances the shared picture locally.</p>
  <ol class="viewer-steps">
    <li data-step="1"><span class="n" aria-hidden="true">1</span><div><strong>Share the playing tab</strong><p>Chrome asks which tab. Only the picture is shared; sound stays in the original tab. Nothing is recorded or uploaded.</p></div><button id="share" class="btn primary">Choose video tab</button></li>
    <li data-step="2"><span class="n" aria-hidden="true">2</span><div><strong>Select the video area</strong><p>Drag a rectangle over the video to leave out page borders and player controls.</p></div><button id="crop" class="btn" disabled>Select video area</button></li>
    <li data-step="3"><span class="n" aria-hidden="true">3</span><div><strong>Enhance</strong><p>Pick an engine and start. Keep the source tab playing; control playback there.</p></div><div class="step-controls"><label class="field"><span class="visually-hidden">Enhancement algorithm</span><select id="algorithm" class="select" aria-label="Enhancement algorithm"><option value="spatial">Spatial Detail</option><option value="anime4k">Anime4K</option><option value="fsrcnnx">FSRCNNX</option></select></label><button id="enhance" class="btn" disabled>Enhance selected area</button></div></li>
  </ol>
  <p id="status" role="status" aria-live="polite">Select a tab to begin.</p>
  <div class="capture-preview"><video muted playsinline></video><div id="selection" hidden></div><button id="exit-fullscreen" class="btn">Exit fullscreen</button></div>
  <div class="viewer-bar"><button id="fullscreen" class="btn" disabled>Fullscreen</button><button id="stop" class="btn quiet" disabled>Stop sharing</button><span class="muted">Tab sharing captures displayed pixels, not the original encoded resolution. Protected video may stay black.</span></div>
</main>`;
const video = root.querySelector<HTMLVideoElement>("video")!;
const preview = root.querySelector<HTMLDivElement>(".capture-preview")!;
const selection = root.querySelector<HTMLDivElement>("#selection")!;
const status = root.querySelector<HTMLParagraphElement>("#status")!;
const share = root.querySelector<HTMLButtonElement>("#share")!,
  cropButton = root.querySelector<HTMLButtonElement>("#crop")!,
  enhance = root.querySelector<HTMLButtonElement>("#enhance")!,
  stopButton = root.querySelector<HTMLButtonElement>("#stop")!,
  fullscreen = root.querySelector<HTMLButtonElement>("#fullscreen")!;
let sharingEpoch = 0;
const main = root.querySelector<HTMLElement>(".viewer")!;
const step = (n: number) => (main.dataset.step = String(n));
let stream: MediaStream | undefined,
  renderer: VideoRenderer | undefined,
  crop: Crop | undefined,
  selecting = false,
  anchor: { x: number; y: number } | undefined;
let settings: Settings = { ...DEFAULTS, enabled: true, scale: "2" };
const sourceTab = Number(new URLSearchParams(location.search).get("source"));
if (chrome?.runtime?.id && sourceTab > 0) {
  share.disabled = true;
  void chrome.runtime
    .sendMessage({ type: "webscaly:viewer-config", tabId: sourceTab })
    .then((result) => {
      if (!result?.ok) {
        share.disabled = true;
        status.textContent =
          result?.error ?? "Approve the source website first.";
        return;
      }
      settings = {
        ...result.value.settings,
        enabled: true,
        controls: false,
        comparison: false,
        hud: false,
      };
      root.querySelector("#source")!.textContent =
        `Source website: ${new URL(result.value.origin).hostname}. Share its playing tab and WebScaly enhances the picture locally.`;
      (root.querySelector("#algorithm") as HTMLSelectElement).value =
        settings.algorithm;
      share.disabled = false;
    })
    .catch(() => {
      share.disabled = true;
      status.textContent = "Reload WebScaly and open this player again.";
    });
}
function stop() {
  sharingEpoch++;
  renderer?.dispose();
  renderer = undefined;
  stream?.getTracks().forEach((t) => t.stop());
  stream = undefined;
  video.srcObject = null;
  share.disabled = false;
  cropButton.disabled =
    enhance.disabled =
    stopButton.disabled =
    fullscreen.disabled =
      true;
  selection.hidden = true;
  selecting = false;
  anchor = undefined;
  preview.classList.remove("selecting");
  status.textContent = "Tab sharing stopped.";
  step(1);
}
share.addEventListener("click", async () => {
  stop();
  share.disabled = true;
  const expected = sharingEpoch;
  try {
    // Chrome's chooser is the permission boundary; no screenshot polling or CORS proxy.
    const chosen = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: { ideal: 60, max: 60 } },
      audio: false,
      selfBrowserSurface: "exclude",
      monitorTypeSurfaces: "exclude",
      surfaceSwitching: "exclude",
    } as DisplayMediaStreamOptions);
    if (expected !== sharingEpoch) {
      chosen.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = chosen;
    await validateSource();
    if (expected !== sharingEpoch) return;
    const track = stream.getVideoTracks()[0];
    if (track.getSettings().displaySurface !== "browser")
      throw new Error("Choose a Chrome tab rather than a window or screen.");
    track.addEventListener("ended", stop, { once: true });
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) =>
      video.requestVideoFrameCallback(() => resolve()),
    );
    crop = undefined;
    cropButton.disabled =
      enhance.disabled =
      stopButton.disabled =
      fullscreen.disabled =
        false;
    status.textContent =
      "Sharing locally. Select video area, then drag a rectangle over the video.";
    step(2);
  } catch (error) {
    stop();
    status.textContent = `Tab sharing was not started. ${(error as Error).message}`;
  }
});
cropButton.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  renderer?.dispose();
  renderer = undefined;
  selecting = true;
  selection.hidden = true;
  preview.classList.add("selecting");
  status.textContent =
    "Drag from one corner of the video to the opposite corner.";
});
fullscreen.addEventListener("click", () => {
  void preview.requestFullscreen().catch((error) => {
    status.textContent = (error as Error).message;
  });
});
root.querySelector("#exit-fullscreen")!.addEventListener("click", () => {
  void document.exitFullscreen().catch((error) => {
    status.textContent = (error as Error).message;
  });
});
function position(event: PointerEvent) {
  const r = video.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
  };
}
preview.addEventListener("pointerdown", (e) => {
  if (!selecting) return;
  anchor = position(e);
  preview.setPointerCapture(e.pointerId);
  e.preventDefault();
});
preview.addEventListener("pointermove", (e) => {
  if (!anchor || !selecting) return;
  const p = position(e);
  crop = {
    left: Math.min(p.x, anchor.x),
    top: Math.min(p.y, anchor.y),
    width: Math.abs(p.x - anchor.x),
    height: Math.abs(p.y - anchor.y),
  };
  selection.hidden = false;
  Object.assign(selection.style, {
    left: `${crop.left * 100}%`,
    top: `${crop.top * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  });
});
preview.addEventListener("pointerup", () => {
  if (!anchor) return;
  anchor = undefined;
  selecting = false;
  preview.classList.remove("selecting");
  if (!crop || crop.width < 0.02 || crop.height < 0.02) {
    crop = undefined;
    selection.hidden = true;
    status.textContent = "Area is too small. Select a larger video area.";
  } else {
    status.textContent = "Video area selected. Click Enhance selected area.";
    step(3);
  }
});
async function enable() {
  if (!stream) return;
  renderer?.dispose();
  selection.hidden = true;
  renderer = new VideoRenderer(
    video,
    settings,
    (p) => (chrome?.runtime?.id ? chrome.runtime.getURL(p) : `./${p}`),
    (_s, patch) => {
      settings = { ...settings, ...patch };
    },
    { crop },
  );
  await renderer.start();
  status.textContent = renderer.diagnostics.message;
}
enhance.addEventListener("click", () => {
  void enable();
});
stopButton.addEventListener("click", stop);
root.querySelector("#algorithm")!.addEventListener("change", (e) => {
  settings = {
    ...settings,
    algorithm: (e.target as HTMLSelectElement).value as Settings["algorithm"],
  };
  void enable();
});
window.addEventListener("pagehide", stop);

async function validateSource() {
  if (!globalThis.chrome?.runtime?.id || sourceTab <= 0) return;
  try {
    const r = await chrome.runtime.sendMessage({
      type: "webscaly:viewer-config",
      tabId: sourceTab,
    });
    if (!r?.ok) {
      stop();
      share.disabled = true;
      status.textContent = "Source website access was removed.";
    }
  } catch {
    stop();
    share.disabled = true;
  }
}
if (globalThis.chrome?.runtime?.id) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.webscalyConfig) void validateSource();
  });
  chrome.permissions.onRemoved.addListener(() => {
    void validateSource();
  });
}

if (globalThis.chrome?.runtime?.id && !(sourceTab > 0)) {
  share.disabled = true;
  status.textContent =
    "Open this player from the popup on an approved video tab.";
}
const hints: Record<string, string> = {
  share:
    "Share the playing video tab. Use this when direct frame access is blocked.",
  crop: "Select the video area. Use it to exclude page borders and controls.",
  enhance: "Enhance the selected area locally. Keep the original tab playing.",
  fullscreen:
    "Fullscreen enlarges this viewer. Use the source tab to control playback.",
  stop: "Stop sharing ends capture immediately. Use it when finished.",
  algorithm:
    "Spatial is light, Anime4K restores animation, and FSRCNNX reconstructs fine detail.",
};
for (const [id, text] of Object.entries(hints)) {
  const e = document.getElementById(id);
  if (e) e.dataset.help = text;
}
attachHelp(root);
