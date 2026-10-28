import { bindLocale, localize } from "../shared/i18n/dom";
import { getLocale, initializeLocale, subscribeLocale, translateMessage } from "../shared/i18n";
import { gpuDevice, texture } from "../core/device";
import { Enhancement } from "../core/enhancement";
import { DEFAULTS, type Algorithm } from "../shared/settings";
import "../ui/styles.css";
import "./gpu-validation";
import { validateGpu } from "./gpu-validation";
document.querySelector("#root")!.innerHTML =
  `<main class="lab"><h1>WebScaly GPU benchmark</h1><p>Runs 90 GPU submissions on a generated 720p frame. Queue-completion wall time includes submission overhead. This is a pipeline benchmark, not video output FPS.</p><button id="run" class="primary">Run benchmark</button><pre id="result" data-user-text>Ready.</pre><canvas id="output" width="1920" height="1080"></canvas><a href="./options.html">Settings</a></main>`;
const validateButton = document.createElement("button");
validateButton.textContent = "Validate GPU algorithms";
document.querySelector("#run")!.after(validateButton);
const root = document.querySelector<HTMLElement>("#root")!;
const resultNode = document.querySelector<HTMLElement>("#result")!;
let status = "Ready.";
const showStatus = (message: string) => {
  status = message;
  resultNode.textContent = translateMessage(message);
};
const refresh = () => {
  document.documentElement.lang = getLocale();
  document.title = translateMessage("WebScaly · GPU benchmark");
  localize(root);
  if (status) resultNode.textContent = translateMessage(status);
};
bindLocale(root);
subscribeLocale(refresh);
void initializeLocale().then(refresh);
validateButton.addEventListener("click", async () => {
  validateButton.disabled = true;
  showStatus("Validating…");
  try {
    const report = await validateGpu();
    status = "";
    document.querySelector("#result")!.textContent = JSON.stringify(
      report,
      null,
      2,
    );
  } catch (e) {
    showStatus(String(e));
  } finally {
    validateButton.disabled = false;
  }
});
document.querySelector("#run")!.addEventListener("click", async () => {
  const result = document.querySelector("#result")!;
  (document.querySelector("#run") as HTMLButtonElement).disabled = true;
  const records = [];
  try {
    const { device, adapter } = await gpuDevice();
    const canvas = document.querySelector<HTMLCanvasElement>("#output")!;
    const context = canvas.getContext("webgpu")!;
    context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: "opaque",
    });
    const input = texture(device, 1280, 720, "Benchmark source");
    const pixels = new Uint8Array(1280 * 720 * 4);
    for (let y = 0; y < 720; y++)
      for (let x = 0; x < 1280; x++) {
        const p = (y * 1280 + x) * 4;
        pixels[p] = (x * 3) % 256;
        pixels[p + 1] = (y * 2) % 256;
        pixels[p + 2] = ((x + y) * 7) % 256;
        pixels[p + 3] = 255;
      }
    device.queue.writeTexture(
      { texture: input },
      pixels,
      { bytesPerRow: 1280 * 4 },
      [1280, 720],
    );
    for (const algorithm of ["spatial", "anime4k", "fsrcnnx"] as Algorithm[]) {
      showStatus(`Benchmarking ${algorithm}…`);
      const engine = new Enhancement(device, 1280, 720, [1920, 1080], {
        ...DEFAULTS,
        algorithm,
        quality: "balanced",
        deband: 0.2,
      });
      try {
        await engine.initialize(navigator.gpu.getPreferredCanvasFormat(), true);
        const times = [];
        for (let i = 0; i < 95; i++) {
          const start = performance.now();
          const encoder = device.createCommandEncoder();
          engine.load(encoder, input);
          engine.encode(encoder, context.getCurrentTexture());
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          if (i >= 5) times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        records.push({
          algorithm,
          input: "1280×720",
          output: "1920×1080",
          samples: times.length,
          medianQueueWallMs: times[45],
          p95QueueWallMs: times[85],
        });
      } finally {
        engine.destroy();
      }
    }
    input.destroy();
    context.unconfigure();
    const report = {
      browser: navigator.userAgent,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description,
        isFallbackAdapter: adapter.info.isFallbackAdapter,
      },
      conditions:
        "Synthetic texture; sequential queue fences; 5 warmups; no decode or frame generation",
      records,
    };
    status = "";
    result.textContent = JSON.stringify(report, null, 2);
  } catch (e) {
    showStatus(String(e));
  } finally {
    (document.querySelector("#run") as HTMLButtonElement).disabled = false;
  }
});
