// Renderer lifecycle regressions found in the 0.5 audit. Each test drives the real
// VideoRenderer on a local procedural source through tests/browser/renderer.html.
import { test, expect, type Page } from "@playwright/test";

const active = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => window.harness.renderer?.diagnostics.state), {
      timeout: 20000,
    })
    .toBe("active");
async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tests/browser/renderer.html");
  await page.waitForFunction(() => !!window.harness);
  return errors;
}

test("an adaptive step that only lowers quality is applied in place, without a rebuild", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial", quality: "quality", adaptive: true }));
  await active(page);
  const result = await page.evaluate(async () => {
    const r = window.harness.renderer as any,
      engine = r.enhancement,
      g = r.governor,
      observe = g.observe.bind(g);
    let forced = false;
    g.observe = (s: unknown, limit: number) => {
      if (!forced) {
        forced = true;
        g.level++;
        return true;
      }
      return observe(s, limit);
    };
    const states = new Set<string>();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      states.add(r.diagnostics.state);
      await new Promise((f) => requestAnimationFrame(f));
    }
    return { forced, sameEngine: r.enhancement === engine, states: [...states], quality: r.diagnostics.quality, note: r.diagnostics.adaptive };
  });
  expect(result.forced).toBe(true);
  expect(result.sameEngine).toBe(true);
  expect(result.states).toEqual(["active"]);
  expect(result.quality).toBe("balanced");
  expect(result.note).toContain("Adaptive");
  expect(errors).toEqual([]);
});

test("an adaptive rebuild never shows a canvas that has no configured context", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  // Anime4K changes networks with quality, so this step needs a real rebuild.
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k", quality: "quality", adaptive: true }));
  await active(page);
  const violations = await page.evaluate(async () => {
    const r = window.harness.renderer as any,
      g = r.governor;
    let forced = false;
    const observe = g.observe.bind(g);
    g.observe = (s: unknown, limit: number) => {
      if (!forced) {
        forced = true;
        g.level++;
        return true;
      }
      return observe(s, limit);
    };
    let bad = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      if (r.view.canvasShown && !r.context && !r.webgl) bad++;
      await new Promise((f) => requestAnimationFrame(f));
    }
    return bad;
  });
  expect(violations).toBe(0);
  await active(page);
  expect(errors).toEqual([]);
});

test("cosmetic slider changes keep the adaptive level", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial", adaptive: true }));
  await active(page);
  const level = await page.evaluate(async () => {
    const r = window.harness.renderer as any;
    r.governor.level = 1;
    await r.configure({ ...r.settings, brightness: 0.1, strength: 0.5 });
    return r.governor.level;
  });
  expect(level).toBe(1);
});

test("lowering skip-above during playback applies immediately", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(1920, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await page.evaluate(async () => {
    const r = window.harness.renderer as any;
    await r.configure({ ...r.settings, skipAbove: 720 });
  });
  await expect
    .poll(() => page.evaluate(() => window.harness.renderer?.diagnostics.state))
    .toBe("skipped");
});

test("frames are not processed while the video element itself is fullscreen", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await page.click("#fullscreen-video");
  await page.waitForFunction(() => document.fullscreenElement === window.harness.video);
  const during = await page.evaluate(async () => {
    const r = window.harness.renderer!;
    await new Promise((f) => setTimeout(f, 300));
    const a = r.diagnostics.decoded;
    await new Promise((f) => setTimeout(f, 1000));
    return r.diagnostics.decoded - a;
  });
  expect(during).toBe(0);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await expect
    .poll(async () => {
      const a = await page.evaluate(() => window.harness.renderer!.diagnostics.decoded);
      await page.waitForTimeout(400);
      return (await page.evaluate(() => window.harness.renderer!.diagnostics.decoded)) - a;
    })
    .toBeGreaterThan(3);
});

test("a cross-origin video fails once and is not rebuilt on every play and seek", async ({ page }) => {
  await open(page);
  // localhost and 127.0.0.1 are different origins; the file has no CORS headers, so its frames are tainted.
  await page.evaluate(() => window.harness.file("http://localhost:5173/test-results/media/progressive.mp4"));
  const result = await page.evaluate(async () => {
    const h = window.harness;
    await h.start({ algorithm: "spatial" });
    const r = h.renderer as any;
    let inits = 0;
    const initialize = r.initialize.bind(r);
    r.initialize = (g: number) => {
      inits++;
      return initialize(g);
    };
    const t0 = performance.now();
    while (r.diagnostics.state !== "unavailable" && performance.now() - t0 < 10000)
      await new Promise((f) => setTimeout(f, 50));
    const failed = r.diagnostics.state;
    const before = inits;
    for (let i = 0; i < 4; i++) {
      h.video.pause();
      await h.video.play();
      h.video.currentTime = (i + 1) * 0.7;
      await new Promise((f) => h.video.addEventListener("seeked", f, { once: true }));
      await new Promise((f) => setTimeout(f, 150));
    }
    await r.configure({ ...r.settings, strength: 0.6 });
    await new Promise((f) => setTimeout(f, 300));
    return { failed, message: r.diagnostics.message, reason: r.diagnostics.reason, retries: inits - before, state: r.diagnostics.state };
  });
  expect(result.failed).toBe("unavailable");
  expect(result.reason).toBe("cross-origin");
  expect(result.message).toContain("cross-origin");
  expect(result.retries).toBe(0);
  expect(result.state).toBe("unavailable");
  // An explicit retry from the toolbar still tries again.
  const retried = await page.evaluate(async () => {
    const r = window.harness.renderer as any;
    let inits = 0;
    const initialize = r.initialize.bind(r);
    r.initialize = (g: number) => {
      inits++;
      return initialize(g);
    };
    r.view.actions.toggle();
    await new Promise((f) => setTimeout(f, 500));
    return inits;
  });
  expect(retried).toBeGreaterThan(0);
});

test("a resolution change during initialization rebuilds for the new size", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  const source = await page.evaluate(async () => {
    const h = window.harness;
    // Deterministic race: the source grows while the first pipeline compiles, i.e. after the renderer has
    // read the video size but before it commits its surfaces.
    const proto = GPUDevice.prototype as any,
      compile = proto.createComputePipelineAsync;
    let resized = false;
    proto.createComputePipelineAsync = async function (...args: unknown[]) {
      if (!resized) {
        resized = true;
        h.resizeSource(1280);
        const t0 = performance.now();
        while (h.video.videoWidth !== 1280 && performance.now() - t0 < 3000)
          await new Promise((f) => setTimeout(f, 20));
      }
      return compile.apply(this, args);
    };
    try {
      await h.start({ algorithm: "spatial" });
    } finally {
      proto.createComputePipelineAsync = compile;
    }
    const r = h.renderer as any;
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      if (r.diagnostics.state === "active" && r.diagnostics.source?.[0] === 1280) break;
      await new Promise((f) => setTimeout(f, 50));
    }
    return { resized, source: r.diagnostics.source, video: h.video.videoWidth };
  });
  expect(source.resized).toBe(true);
  expect(source.video).toBe(1280);
  expect(source.source).toEqual([1280, 720]);
  expect(errors).toEqual([]);
});

test("the shared GPU device is reused across quick restarts and released once no renderer needs it", async ({ page }) => {
  test.setTimeout(60000);
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  const result = await page.evaluate(async () => {
    const h = window.harness;
    const first = (h.renderer as any).device as GPUDevice;
    h.renderer!.dispose();
    // A new renderer within the grace period (engine switch, SPA navigation) gets the same device.
    await new Promise((f) => setTimeout(f, 1000));
    await h.start({ algorithm: "spatial" });
    const t0 = performance.now();
    while ((h.renderer as any).diagnostics.state !== "active" && performance.now() - t0 < 10000)
      await new Promise((f) => setTimeout(f, 50));
    const second = (h.renderer as any).device as GPUDevice;
    const reused = first === second;
    h.renderer!.dispose();
    h.renderer = undefined;
    const lost = await Promise.race([
      second.lost.then((info) => info.reason as string),
      new Promise<string>((f) => setTimeout(() => f("still alive"), 20000)),
    ]);
    return { reused, lost };
  });
  expect(result.reused).toBe(true);
  expect(result.lost).toBe("destroyed");
});

test("a device without WebGPU or WebGL reports a graphics reason and keeps native playback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, k: string, ...args: unknown[]) {
      return k.startsWith("webgl") ? null : Reflect.apply(original, this, [k, ...args]);
    } as typeof original;
  });
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await expect
    .poll(() => page.evaluate(() => window.harness.renderer?.diagnostics.state))
    .toBe("unavailable");
  expect(await page.evaluate(() => window.harness.renderer?.diagnostics.reason)).toBe("graphics");
  expect(await page.evaluate(() => window.harness.video.paused)).toBe(false);
});

test("a tab hidden for long releases its GPU pipeline and rebuilds it when shown again", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k" }));
  await active(page);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await page.evaluate(() => {
    ((window.harness.renderer as any).constructor as { hiddenReleaseMs: number }).hiddenReleaseMs = 400;
  });
  await setHidden(true);
  await page.waitForTimeout(900);
  const hidden = await page.evaluate(() => {
    const r = window.harness.renderer as any;
    return { state: r.diagnostics.state, enhancement: !!r.enhancement, holding: !!r.releaseDevice, paused: window.harness.video.paused };
  });
  expect(hidden).toEqual({ state: "waiting", enhancement: false, holding: false, paused: false });
  await setHidden(false);
  await active(page);
  const before = await page.evaluate(() => window.harness.renderer!.diagnostics.decoded);
  await expect.poll(async () => (await page.evaluate(() => window.harness.renderer!.diagnostics.decoded)) - before).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test("a renderer that starts while the tab is already hidden is released as well", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await page.evaluate(() => {
    ((window.harness.renderer as any).constructor as { hiddenReleaseMs: number }).hiddenReleaseMs = 400;
    // Already in the background when the next renderer starts (e.g. global pause lifted from another tab).
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  });
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await page.waitForTimeout(900);
  const hidden = await page.evaluate(() => {
    const r = window.harness.renderer as any;
    return { state: r.diagnostics.state, enhancement: !!r.enhancement, holding: !!r.releaseDevice };
  });
  expect(hidden).toEqual({ state: "waiting", enhancement: false, holding: false });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await active(page);
  expect(errors).toEqual([]);
});

test("a short tab switch keeps the pipeline", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  const engine = await page.evaluate(() => {
    const r = window.harness.renderer as any;
    (window as any).kept = r.enhancement;
    const set = (h: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    set(true);
    return new Promise<boolean>((resolve) =>
      setTimeout(() => {
        set(false);
        resolve(r.enhancement === (window as any).kept);
      }, 500),
    );
  });
  expect(engine).toBe(true);
  await active(page);
});
