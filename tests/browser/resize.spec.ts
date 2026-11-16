// G5: a player resize or fullscreen transition changes only the display size, so the
// renderer keeps its pipeline (networks, compiled pipelines, working surfaces) and resizes only the display
// surface, without stopping, hiding the canvas or showing an unconfigured one.
import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    watch: {
      on: boolean;
      restarts: number;
      pipelines: number;
      hidden: number;
      bad: number;
      frames: number;
      states: Set<string>;
      engines: Set<unknown>;
    };
  }
}
const active = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => window.harness.renderer?.diagnostics.state), { timeout: 20000 })
    .toBe("active");
async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/tests/browser/renderer.html");
  await page.waitForFunction(() => !!window.harness);
  return errors;
}
/** Instruments the running renderer: restarts, pipeline compilations and, on every animation frame, whether
 * an active renderer's canvas is hidden, unconfigured or out of step with the engine's output size. */
async function watch(page: Page) {
  // The content hint compiles its small pipeline once, about 3 s after activation; wait for it so the count
  // below measures resizes only.
  await page.waitForFunction(() => !!(window.harness.renderer as any)?.enhancement?.hint, undefined, { timeout: 10000 });
  await page.evaluate(() => {
    const r = window.harness.renderer as any;
    const w = (window.watch = {
      on: true,
      restarts: 0,
      pipelines: 0,
      hidden: 0,
      bad: 0,
      frames: 0,
      states: new Set<string>(),
      engines: new Set<unknown>(),
    });
    const restart = r.restart.bind(r);
    r.restart = (...a: unknown[]) => {
      w.restarts++;
      return restart(...a);
    };
    const device = r.device;
    for (const m of ["createComputePipelineAsync", "createComputePipeline", "createRenderPipelineAsync", "createRenderPipeline"]) {
      const f = device[m].bind(device);
      device[m] = (...a: unknown[]) => {
        w.pipelines++;
        return f(...a);
      };
    }
    const loop = () => {
      if (!w.on) return;
      w.frames++;
      w.states.add(r.diagnostics.state);
      w.engines.add(r.enhancement);
      if (r.diagnostics.state === "active") {
        if (!r.view.canvasShown) w.hidden++;
        if (r.view.canvasShown && !r.context && !r.webgl) w.bad++;
        const size = r.enhancement?.outputSize;
        if (size && (size[0] !== r.view.canvas.width || size[1] !== r.view.canvas.height)) w.bad++;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
const report = (page: Page) =>
  page.evaluate(() => {
    const w = window.watch;
    w.on = false;
    return { restarts: w.restarts, pipelines: w.pipelines, hidden: w.hidden, bad: w.bad, frames: w.frames, states: [...w.states], engines: w.engines.size };
  });
/** Canvas size and the size the renderer wants for the current display. */
const sizes = (page: Page) =>
  page.evaluate(() => {
    const r = window.harness.renderer as any;
    return { canvas: [r.view.canvas.width, r.view.canvas.height], wanted: r.outputFor(r.plan.settings), resizes: r.resizes };
  });
const settle = (page: Page) => page.waitForTimeout(600);
/** Mean of the centre of the player in a real screenshot (what the compositor shows). */
async function centreBrightness(page: Page) {
  const box = (await page.locator("video").boundingBox())!;
  const png = await page.screenshot({ clip: { x: box.x + box.width / 2 - 40, y: box.y + box.height / 2 - 40, width: 80, height: 80 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height),
      x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4) / 3;
  }, png.toString("base64"));
}

test("resizing the player keeps the neural pipeline and resizes only the display surface", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k", quality: "balanced" }));
  await active(page);
  await settle(page);
  const before = await page.evaluate(() => {
    const r = window.harness.renderer as any;
    return { engine: r.enhancement, neural: r.enhancement.neural };
  });
  expect(before.engine).toBeTruthy();
  await watch(page);
  await page.evaluate(() => {
    const r = window.harness.renderer as any;
    (window as any).kept = { engine: r.enhancement, neural: r.enhancement.neural };
    window.harness.resizePlayer(1280);
  });
  await settle(page);
  const w = await report(page);
  const s = await sizes(page);
  const kept = await page.evaluate(() => {
    const r = window.harness.renderer as any,
      k = (window as any).kept;
    return { engine: r.enhancement === k.engine, neural: r.enhancement.neural === k.neural };
  });
  expect(s.canvas).toEqual(s.wanted);
  expect(s.canvas).toEqual([1280, 720]);
  expect(kept).toEqual({ engine: true, neural: true });
  expect(w).toMatchObject({ restarts: 0, pipelines: 0, hidden: 0, bad: 0, states: ["active"], engines: 1 });
  expect(errors).toEqual([]);
});

test("entering and leaving player fullscreen repeatedly never stops or rebuilds the pipeline", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "fsrcnnx" }));
  await active(page);
  await settle(page);
  await watch(page);
  const seen: number[][] = [];
  for (let i = 0; i < 3; i++) {
    await page.click("#fullscreen-player");
    await page.waitForFunction(() => !!document.fullscreenElement);
    await settle(page);
    const inside = await sizes(page);
    expect(inside.canvas).toEqual(inside.wanted);
    seen.push(inside.canvas);
    expect(await centreBrightness(page)).toBeGreaterThan(12);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await settle(page);
    const outside = await sizes(page);
    expect(outside.canvas).toEqual(outside.wanted);
    seen.push(outside.canvas);
    expect(await centreBrightness(page)).toBeGreaterThan(12);
  }
  const w = await report(page);
  expect(new Set(seen.map(String)).size).toBe(2); // the display size really changed each time
  expect(w).toMatchObject({ restarts: 0, pipelines: 0, hidden: 0, bad: 0, states: ["active"], engines: 1 });
  expect(errors).toEqual([]);
});

test("rapid resizing settles to one in-place resize at the final size", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await settle(page);
  await watch(page);
  const startResizes = (await sizes(page)).resizes ?? 0;
  for (let i = 0; i < 20; i++) {
    await page.evaluate((w) => window.harness.resizePlayer(w), 700 + i * 20);
    await page.waitForTimeout(15);
  }
  await settle(page);
  const s = await sizes(page);
  const w = await report(page);
  expect(s.canvas).toEqual(s.wanted);
  expect(s.canvas[0]).toBeGreaterThan(1060); // 1080 px player, rounded from the video box
  expect(s.resizes - startResizes).toBe(1);
  expect(w).toMatchObject({ restarts: 0, hidden: 0, bad: 0, states: ["active"], engines: 1 });
  expect(errors).toEqual([]);
});

test("a source resolution change during a resize rebuilds for the new source at the new display size", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k" }));
  await active(page);
  await settle(page);
  await page.evaluate(async () => {
    window.harness.resizePlayer(1280);
    await new Promise((f) => setTimeout(f, 40));
    window.harness.resizeSource(960);
  });
  await expect
    .poll(() => page.evaluate(() => (window.harness.renderer as any).diagnostics.source?.join("x")), { timeout: 15000 })
    .toBe("960x540");
  await active(page);
  await settle(page);
  const s = await sizes(page);
  expect(s.canvas).toEqual(s.wanted);
  expect(s.canvas).toEqual([1280, 720]);
  expect(errors).toEqual([]);
});

test("switching engine during a resize ends active with the new engine at the new size", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k" }));
  await active(page);
  await settle(page);
  await page.evaluate(async () => {
    const r = window.harness.renderer as any;
    window.harness.resizePlayer(1280);
    await new Promise((f) => setTimeout(f, 60));
    await r.configure({ ...r.settings, algorithm: "fsrcnnx" });
  });
  await active(page);
  await settle(page);
  const s = await sizes(page);
  expect(await page.evaluate(() => window.harness.renderer!.diagnostics.algorithm)).toBe("fsrcnnx");
  expect(s.canvas).toEqual(s.wanted);
  expect(s.canvas).toEqual([1280, 720]);
  expect(errors).toEqual([]);
});

test("a resize while the GPU pipeline is being built is applied once it is ready", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  // Resize the player in the middle of initialization (while the first pipeline compiles).
  await page.evaluate(async () => {
    const proto = GPUDevice.prototype as any,
      original = proto.createComputePipelineAsync;
    let done = false;
    proto.createComputePipelineAsync = function (...a: unknown[]) {
      if (!done) {
        done = true;
        window.harness.resizePlayer(1280);
      }
      return original.apply(this, a);
    };
    await window.harness.start({ algorithm: "anime4k" });
    proto.createComputePipelineAsync = original;
  });
  await active(page);
  await settle(page);
  const s = await sizes(page);
  expect(s.canvas).toEqual(s.wanted);
  expect(s.canvas).toEqual([1280, 720]);
  expect(errors).toEqual([]);
});

test("Anime4K adds and drops its 2x stage in place when fullscreen crosses the working size", async ({ page }) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.harness.resizePlayer(640));
  // 1280x720 in a 640 px player: output = source size = working size, so only the restore network runs.
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k", quality: "balanced" }));
  await active(page);
  await settle(page);
  const stages = () =>
    page.evaluate(() => {
      const r = window.harness.renderer as any;
      return { n: r.enhancement.neural.stages.length, restore: r.enhancement.neural.stages[0] === (window as any).restore };
    });
  await page.evaluate(() => {
    (window as any).restore = (window.harness.renderer as any).enhancement.neural.stages[0];
  });
  expect((await stages()).n).toBe(1);
  await watch(page);
  await page.click("#fullscreen-player");
  await page.waitForFunction(() => !!document.fullscreenElement);
  await settle(page);
  expect(await stages()).toEqual({ n: 2, restore: true });
  const inside = await sizes(page);
  expect(inside.canvas).toEqual([1920, 1080]);
  expect(await centreBrightness(page)).toBeGreaterThan(12);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await settle(page);
  expect(await stages()).toEqual({ n: 1, restore: true });
  const w = await report(page);
  expect((await sizes(page)).canvas).toEqual([1280, 720]);
  expect(w).toMatchObject({ restarts: 0, hidden: 0, bad: 0, states: ["active"], engines: 1 });
  expect(errors).toEqual([]);
});

// ---- 0.5.1 review fixes
test("a resize while the source is emptied waits for the next source and then follows the display", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await settle(page);
  await page.evaluate(() => {
    const r = window.harness.renderer as any;
    (window as any).kept = { engine: r.enhancement, resizes: r.resizes, canvas: [r.view.canvas.width, r.view.canvas.height] };
    window.harness.resizePlayer(1280);
    // A player swapping sources: the element is emptied while the new display size settles.
    window.harness.stopSource();
    window.harness.video.srcObject = null;
  });
  await settle(page);
  const during = await page.evaluate(() => {
    const r = window.harness.renderer as any,
      k = (window as any).kept;
    return { engine: r.enhancement === k.engine, resizes: r.resizes - k.resizes, canvas: [r.view.canvas.width, r.view.canvas.height], before: k.canvas };
  });
  // Nothing is sized from an empty source (0×0 gave NaN sizes, a thrown allocation and a restart).
  expect(during).toEqual({ engine: true, resizes: 0, canvas: during.before, before: during.before });
  expect(during.before).not.toEqual([1280, 720]);
  await page.evaluate(() => window.harness.stream(640, 30));
  await active(page);
  await expect.poll(async () => (await sizes(page)).canvas).toEqual([1280, 720]);
  const s = await sizes(page);
  expect(s.canvas).toEqual(s.wanted);
  expect(errors).toEqual([]);
});

test("a display-size allocation that throws still releases the surface it replaces", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await page.evaluate(() => window.harness.resizePlayer(1280));
  await expect.poll(async () => (await sizes(page)).canvas).toEqual([1280, 720]);
  const result = await page.evaluate(() => {
    const e = (window.harness.renderer as any).enhancement,
      old = e.scaled as GPUTexture | undefined;
    let destroyed = false,
      threw = false;
    if (old) {
      const destroy = old.destroy.bind(old);
      old.destroy = () => {
        destroyed = true;
        destroy();
      };
    }
    try {
      e.resize([Number.NaN, Number.NaN]); // GPUExtent3D rejects NaN synchronously (TypeError)
    } catch {
      threw = true;
    }
    return { had: !!old, threw, destroyed };
  });
  expect(result).toEqual({ had: true, threw: true, destroyed: true });
});

test("GPU errors from the first frame after a failed resize allocation lead to a rebuild, not a stopped renderer", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await settle(page);
  await page.evaluate(() => {
    const r = window.harness.renderer as any,
      device = r.device as GPUDevice,
      create = device.createTexture.bind(device);
    let armed = true,
      delayed = 0;
    // The resize's own error-scope result arrives late (the order of that result and the frame's uncaptured
    // errors is not specified), so the frame's errors are reported first.
    const pop = device.popErrorScope.bind(device);
    device.popErrorScope = () => {
      const result = pop();
      if (delayed <= 0) return result;
      delayed--;
      return result.then((e) => new Promise((resolve) => setTimeout(() => resolve(e), 400)));
    };
    // The next display-size surface is invalid (a validation error inside the resize's error scope); the frame
    // drawn right after the resize then uses it and raises uncaptured validation errors.
    device.createTexture = (d: GPUTextureDescriptor) => {
      if (armed && d.label === "WebScaly display-size frame") {
        armed = false;
        delayed = 2; // the validation and out-of-memory scopes around this allocation
        return create({ ...d, mipLevelCount: 99 });
      }
      return create(d);
    };
    const states = ((window as any).states = new Set<string>());
    const loop = () => {
      states.add(r.diagnostics.state);
      if ((window as any).states === states) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.harness.resizePlayer(1280);
  });
  await page.waitForTimeout(1500);
  await active(page);
  const states = await page.evaluate(() => {
    const s = [...(window as any).states];
    (window as any).states = null;
    return s;
  });
  expect(states).not.toContain("unavailable");
  const s = await sizes(page);
  expect(s.canvas).toEqual([1280, 720]);
  expect(s.canvas).toEqual(s.wanted);
  const before = await page.evaluate(() => window.harness.renderer!.diagnostics.decoded);
  await expect.poll(async () => (await page.evaluate(() => window.harness.renderer!.diagnostics.decoded)) - before).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test("GPU errors from one renderer's failed resize do not stop another renderer on the same device", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.harness.stream(640, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await active(page);
  await settle(page);
  // A second player on the page (the content script enhances up to two), outside the resized player box.
  await page.evaluate(async () => {
    const r = window.harness.renderer as any,
      v = document.createElement("video");
    v.muted = true;
    v.style.cssText = "display:block;width:480px;height:270px";
    v.srcObject = window.harness.video.srcObject;
    document.body.append(v);
    await v.play();
    const other = new r.constructor(v, { ...r.settings }, (p: string) => `/${p}`);
    (window as any).other = other;
    await other.start();
  });
  await expect.poll(() => page.evaluate(() => (window as any).other.diagnostics.state), { timeout: 20000 }).toBe("active");
  expect(await page.evaluate(() => (window as any).other.device === (window.harness.renderer as any).device)).toBe(true);
  await page.evaluate(() => {
    const r = window.harness.renderer as any,
      other = (window as any).other,
      device = r.device as GPUDevice,
      create = device.createTexture.bind(device),
      pop = device.popErrorScope.bind(device);
    let armed = true,
      delayed = 0;
    device.popErrorScope = () => {
      const result = pop();
      if (delayed <= 0) return result;
      delayed--;
      return result.then((e) => new Promise((resolve) => setTimeout(() => resolve(e), 400)));
    };
    device.createTexture = (d: GPUTextureDescriptor) => {
      if (armed && d.label === "WebScaly display-size frame") {
        armed = false;
        delayed = 2;
        return create({ ...d, mipLevelCount: 99 });
      }
      return create(d);
    };
    const states = ((window as any).otherStates = new Set<string>());
    const loop = () => {
      states.add(other.diagnostics.state);
      if ((window as any).otherStates === states) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.harness.resizePlayer(1280);
  });
  await page.waitForTimeout(1500);
  await active(page);
  const states = await page.evaluate(() => {
    const s = [...(window as any).otherStates];
    (window as any).otherStates = null;
    return s;
  });
  expect(states).not.toContain("unavailable");
  expect(await page.evaluate(() => (window as any).other.diagnostics.state)).toBe("active");
  await page.evaluate(() => (window as any).other.dispose());
  expect(errors).toEqual([]);
});
