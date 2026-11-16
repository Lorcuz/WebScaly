// G8 and G10: WebGL fallback recovery after a lost context, and explicit release of
// WebGL resources. WebGPU is hidden from these pages so the renderer takes its WebGL path; context loss and
// restoration are driven deterministically with WEBGL_lose_context.
import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, { webgpu = false } = {}) {
  const errors: string[] = [],
    warnings: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "warning" || m.type() === "error") warnings.push(m.text());
  });
  if (!webgpu)
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true });
    });
  await page.goto("/tests/browser/renderer.html");
  await page.waitForFunction(() => !!window.harness);
  return { errors, warnings };
}
const state = (page: Page) => page.evaluate(() => window.harness.renderer?.diagnostics.state);
const decoded = (page: Page) => page.evaluate(() => window.harness.renderer!.diagnostics.decoded);
/** The renderer's current WebGL context and its WEBGL_lose_context extension. */
const loseContext = (page: Page, action: "loseContext" | "restoreContext") =>
  page.evaluate((a) => {
    const r = window.harness.renderer as any;
    (window as any).loser ??= r.webgl.gl.getExtension("WEBGL_lose_context");
    (window as any).loser[a]();
  }, action);

test("a lost WebGL context switches to native video, then recovers and enhances again when restored", async ({ page }) => {
  const { errors } = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await expect.poll(() => state(page)).toBe("active");
  expect(await page.evaluate(() => window.harness.renderer!.diagnostics.backend)).toMatch(/^WebGL/);
  await loseContext(page, "loseContext");
  await expect.poll(() => state(page)).toBe("waiting");
  const during = await page.evaluate(async () => {
    const r = window.harness.renderer as any,
      a = r.diagnostics.decoded;
    await new Promise((f) => setTimeout(f, 800));
    return { shown: r.view.canvasShown, processed: r.diagnostics.decoded - a, paused: window.harness.video.paused, message: r.diagnostics.message };
  });
  // No draws with the dead context, the native video keeps playing, and the message says what happens.
  expect(during).toMatchObject({ shown: false, processed: 0, paused: false });
  expect(during.message).toContain("Reconnecting");
  await loseContext(page, "restoreContext");
  await expect.poll(() => state(page)).toBe("active");
  const before = await decoded(page);
  await expect.poll(async () => (await decoded(page)) - before).toBeGreaterThan(5);
  expect(await page.evaluate(() => (window.harness.renderer as any).view.canvasShown)).toBe(true);
  expect(errors).toEqual([]);
});

test("a WebGL context that never comes back ends in an accurate graphics state without stopping playback", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await expect.poll(() => state(page)).toBe("active");
  await loseContext(page, "loseContext");
  await expect.poll(() => state(page), { timeout: 10000 }).toBe("unavailable");
  const d = await page.evaluate(() => window.harness.renderer!.diagnostics);
  expect(d.reason).toBe("graphics");
  expect(d.message).toMatch(/did not come back/i);
  expect(d.message).not.toMatch(/\(\d{4,}\)/); // no raw GL error code
  expect(await page.evaluate(() => window.harness.video.paused)).toBe(false);
});

test("repeated WebGL starts and stops release every context instead of exhausting the browser's limit", async ({ page }) => {
  const { errors, warnings } = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
    await expect.poll(() => state(page)).toBe("active");
  }
  // Chrome warns "Too many active WebGL contexts. Oldest context will be lost." once 16 are alive.
  expect(warnings.filter((w) => /too many active webgl contexts/i.test(w))).toEqual([]);
  expect(await page.evaluate(() => (window.harness.renderer as any).webgl.gl.isContextLost())).toBe(false);
  expect(errors).toEqual([]);
});

test("a lost WebGPU device falls back to one WebGL engine and releases every WebGPU resource", async ({ page }) => {
  const { errors } = await open(page, { webgpu: true });
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "anime4k" }));
  await expect.poll(() => state(page), { timeout: 20000 }).toBe("active");
  await page.evaluate(() => (window.harness.renderer as any).device.destroy());
  await expect.poll(() => page.evaluate(() => window.harness.renderer!.diagnostics.backend)).toMatch(/^WebGL/);
  await expect.poll(() => state(page)).toBe("active");
  const r = await page.evaluate(() => {
    const x = window.harness.renderer as any;
    return {
      enhancement: !!x.enhancement,
      device: !!x.device,
      context: !!x.context,
      timer: !!x.timer,
      region: !!x.region,
      holding: !!x.releaseDevice,
      webgl: !!x.webgl,
      canvases: document.querySelectorAll("webscaly-player").length,
    };
  });
  expect(r).toEqual({ enhancement: false, device: false, context: false, timer: false, region: false, holding: false, webgl: true, canvases: 1 });
  const before = await decoded(page);
  await expect.poll(async () => (await decoded(page)) - before).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test("a media event while a lost context is awaited does not start a second pipeline that the restore deadline then stops", async ({ page }) => {
  const { errors } = await open(page);
  await page.evaluate(() => window.harness.stream(1280, 30));
  await page.evaluate(() => window.harness.start({ algorithm: "spatial" }));
  await expect.poll(() => state(page)).toBe("active");
  await loseContext(page, "loseContext");
  await expect.poll(() => state(page)).toBe("waiting");
  // Players fire these on seeks, loops and source changes; each normally (re)starts an inactive renderer.
  const waiting = await page.evaluate(async () => {
    const r = window.harness.renderer as any,
      lost = r.webgl;
    for (const t of ["seeked", "play", "loadeddata"]) window.harness.video.dispatchEvent(new Event(t));
    // While the restore is awaited, nothing replaces the lost engine and the renderer keeps waiting.
    const seen = new Set<string>();
    let same = true;
    for (let i = 0; i < 10; i++) {
      await new Promise((f) => setTimeout(f, 50));
      seen.add(r.diagnostics.state);
      same &&= r.webgl === lost;
    }
    return { same, states: [...seen] };
  });
  expect(waiting).toEqual({ same: true, states: ["waiting"] });
  await loseContext(page, "restoreContext");
  await expect.poll(() => state(page)).toBe("active");
  // Past the 4 s restore deadline the restored renderer must still be enhancing.
  await page.waitForTimeout(4500);
  expect(await state(page)).toBe("active");
  const before = await decoded(page);
  await expect.poll(async () => (await decoded(page)) - before).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
