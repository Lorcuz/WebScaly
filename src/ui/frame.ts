import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./frame.css";
const params = new URLSearchParams(location.hash.slice(1)),
  token = params.get("token"),
  role = params.get("role"),
  parentOrigin = params.get("parent");
const root = document.querySelector<HTMLElement>("#controls")!;
const icon = (path: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  power: icon('<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>'),
  compare: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/>'),
  original: icon('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>'),
  snapshot: icon('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>'),
  fullscreen: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};
if (
  token &&
  /^[\da-f-]{36}$/.test(token) &&
  ["toolbar", "compare"].includes(role ?? "") &&
  parentOrigin &&
  /^(https?:\/\/|chrome-extension:\/\/)/.test(parentOrigin)
) {
  const send = (action: string, value?: unknown, commit?: boolean) =>
    parent.postMessage(
      { type: "webscaly:ui", token, action, value, commit },
      parentOrigin,
    );
  if (role === "toolbar") {
    root.className = "toolbar";
    root.innerHTML = `<button id="toggle" class="power" aria-label="Enhance this video" title="Turn enhancement on or off for this video.">${ICONS.power}<span>WebScaly</span></button>
      <span class="sep" aria-hidden="true"></span>
      <select id="engine" aria-label="Engine" title="Spatial Detail is lightest; Anime4K suits animation; FSRCNNX restores fine detail.">
        <option value="spatial">Spatial</option><option value="anime4k">Anime4K</option><option value="fsrcnnx">FSRCNNX</option></select>
      <select id="quality" aria-label="Video quality" title="Fast is lightest; Quality uses the sharpest upscaling.">
        <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select>
      <span class="sep" aria-hidden="true"></span>
      <button id="compare" class="icon" aria-label="Compare" title="Original and enhanced, side by side.">${ICONS.compare}</button>
      <button id="original" class="icon" aria-label="Hold to show original" title="Press and hold to see the original video.">${ICONS.original}</button>
      <button id="hud" class="text" title="Live performance numbers.">HUD</button>
      <button id="snapshot" class="icon" aria-label="Save snapshot" title="Save the current enhanced frame as an image.">${ICONS.snapshot}</button>
      <button id="fullscreen" class="icon" aria-label="Fullscreen with enhancement" title="Fullscreen that keeps the enhanced picture.">${ICONS.fullscreen}</button>`;
    for (const action of ["toggle", "compare", "hud", "snapshot", "fullscreen"])
      document
        .getElementById(action)!
        .addEventListener("click", () => send(action));
    const original = document.getElementById("original")!;
    const hold = (on: boolean) => {
      original.setAttribute("aria-pressed", String(on));
      send("original", on);
    };
    original.addEventListener("pointerdown", (e) => {
      original.setPointerCapture(e.pointerId);
      hold(true);
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      original.addEventListener(event, () => {
        if (original.getAttribute("aria-pressed") === "true") hold(false);
      });
    original.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) hold(true);
    });
    original.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") hold(false);
    });
    for (const id of ["engine", "quality"])
      document
        .getElementById(id)!
        .addEventListener("change", (e) =>
          send(id, (e.target as HTMLSelectElement).value),
        );
  } else {
    root.className = "compare";
    root.innerHTML =
      '<label class="comparison"><span>Original</span><input id="split" aria-label="Original enhanced split" type="range" min="0" max="100" step="1"><span class="after">Enhanced</span></label>';
    const input = document.querySelector<HTMLInputElement>("input")!;
    const paint = () =>
      input.style.setProperty("--progress", `${input.value}%`);
    input.addEventListener("input", () => {
      paint();
      send("split", Number(input.value) / 100, false);
    });
    input.addEventListener("change", () =>
      send("split", Number(input.value) / 100, true),
    );
  }
  root.addEventListener("pointerenter", () => send("hover", true));
  root.addEventListener("pointerleave", () => send("hover", false));
  root.addEventListener("focusin", () => send("focus", true));
  root.addEventListener("focusout", () => send("focus", false));
  // The parent sizes this frame to exactly its controls, so the transparent
  // remainder never sits over the video catching clicks.
  new ResizeObserver(() => {
    const r = root.getBoundingClientRect();
    send("size", { width: r.width, height: r.height });
  }).observe(root);
  window.addEventListener("message", (e) => {
    if (
      e.source !== parent ||
      e.origin !== parentOrigin ||
      e.data?.token !== token ||
      e.data?.type !== "webscaly:state" ||
      e.data.role !== role
    )
      return;
    const s = e.data.settings;
    if (!s || typeof s.enabled !== "boolean") return;
    const split = document.querySelector<HTMLInputElement>("#split");
    if (split && document.activeElement !== split) {
      split.value = String(Math.round(s.split * 100));
      split.style.setProperty("--progress", `${split.value}%`);
    }
    for (const [id, key] of [
      ["toggle", "enabled"],
      ["compare", "comparison"],
      ["hud", "hud"],
    ])
      document.getElementById(id)?.setAttribute("aria-pressed", String(s[key]));
    root.dataset.state = typeof e.data.state === "string" ? e.data.state : "";
    for (const [id, key] of [
      ["engine", "algorithm"],
      ["quality", "quality"],
    ] as const) {
      const select = document.querySelector<HTMLSelectElement>(`#${id}`);
      if (select) {
        select.value = s[key];
        select.disabled = !s.enabled;
      }
    }
    const fullscreen = document.getElementById("fullscreen");
    fullscreen?.setAttribute("aria-pressed", String(e.data.fullscreen === true));
  });
  send("ready");
}
