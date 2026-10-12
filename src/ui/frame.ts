import "./frame.css";
import { attachHelp } from "./help";
const params = new URLSearchParams(location.hash.slice(1)),
  token = params.get("token"),
  role = params.get("role"),
  parentOrigin = params.get("parent");
const root = document.querySelector<HTMLElement>("#controls")!;
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
    root.innerHTML =
      '<button id="toggle" aria-label="Enhance this video">WebScaly</button><select id="quality" aria-label="Video quality" data-help="Anime4K detail level. Use Fast for lighter processing."><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="quality">Quality</option></select><button id="compare">Compare</button><button id="hud" data-help="Live performance numbers. Use to check processing speed.">HUD</button>';
    for (const action of ["toggle", "compare", "hud"])
      document
        .getElementById(action)!
        .addEventListener("click", () => send(action));
    document
      .getElementById("quality")!
      .addEventListener("change", (e) =>
        send("quality", (e.target as HTMLSelectElement).value),
      );
  } else {
    root.innerHTML =
      '<label class="comparison"><span>Original</span><input id="split" aria-label="Original enhanced split" type="range" min="0" max="100"><span>Enhanced</span></label>';
    const input = document.querySelector<HTMLInputElement>("input")!;
    input.addEventListener("input", () =>
      send("split", Number(input.value) / 100, false),
    );
    input.addEventListener("change", () =>
      send("split", Number(input.value) / 100, true),
    );
  }
  attachHelp(root);
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
    if (split && document.activeElement !== split)
      split.value = String(Math.round(s.split * 100));
    for (const [id, key] of [
      ["toggle", "enabled"],
      ["compare", "comparison"],
      ["hud", "hud"],
    ])
      document.getElementById(id)?.setAttribute("aria-pressed", String(s[key]));
    const quality = document.querySelector<HTMLSelectElement>("#quality");
    if (quality) {
      quality.value = s.quality;
      quality.disabled = s.algorithm !== "anime4k";
    }
  });
  send("ready");
}
