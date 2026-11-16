// C8 and C9: video discovery in the real extension. Late shadow roots are found on
// pages with thousands of custom elements (no silent ceiling, no long tasks), and hover previews and thumbnail
// clips get no renderer while real players, small or large, still do.
import { test, expect, chromium, type BrowserContext, type Worker, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULTS, EMPTY, type Settings } from "../../src/shared/settings";

let context: BrowserContext, worker: Worker;
const origin = "http://127.0.0.1",
  url = origin + ":5173/tests/browser/fixture.html";
test.beforeAll(async () => {
  const directory = resolve("test-results/extension-discovery");
  await mkdir(directory, { recursive: true });
  // WEBSCALY_EXTENSION_DIR runs the same checks against an unpacked release ZIP (default: the dist build).
  await cp(process.env.WEBSCALY_EXTENSION_DIR ?? "dist", directory, { recursive: true });
  const m = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  m.host_permissions = ["http://127.0.0.1/*"]; // static loopback grant, as in extension.spec.ts
  await writeFile(resolve(directory, "manifest.json"), JSON.stringify(m));
  context = await chromium.launchPersistentContext(await mkdtemp(resolve("test-results/discovery-profile-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  for (const p of context.pages()) await p.close();
});
test.afterAll(async () => {
  await context?.close();
});
async function configure(s: Settings = DEFAULTS) {
  await worker.evaluate(
    async (c) => {
      await chrome.storage.local.set({ webscalyConfig: c });
    },
    { ...EMPTY, preferences: { ...EMPTY.preferences, welcomed: true }, sites: [{ origin, subdomains: false, settings: s }] },
  );
}
/** A playing <video> fed by a procedural canvas stream (no network, no codec dependence). */
async function addStreams(page: Page) {
  await page.evaluate(() => {
    (window as any).streamVideo = (video: HTMLVideoElement, width = 640) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = Math.round((width * 9) / 16);
      const x = c.getContext("2d")!;
      let f = 0;
      setInterval(() => {
        x.fillStyle = "#142539";
        x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = "#7ee1bf";
        x.fillRect((f++ * 7) % (c.width - 40), 20, 40, 40);
      }, 33);
      video.srcObject = c.captureStream(30);
      video.playsInline = true;
      return video.play();
    };
    // Counts every overlay WebScaly ever creates on this page (a renderer each).
    (window as any).created = 0;
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) if (n instanceof Element && n.localName === "webscaly-player") (window as any).created++;
    }).observe(document, { childList: true, subtree: true });
  });
}

test("a player whose shadow root appears late is found on a page with thousands of custom elements", async () => {
  await configure();
  const page = await context.newPage();
  await page.goto(url);
  await addStreams(page);
  const tasks = await page.evaluate(() => {
    // Real pages (component libraries, comment threads) can hold thousands of custom elements without players.
    const list = document.createElement("div");
    for (let i = 0; i < 4000; i++) list.append(document.createElement(`x-card`));
    document.body.append(list);
    return true;
  });
  expect(tasks).toBe(true);
  await page.waitForTimeout(2500); // the content script has walked and remembered all of them
  await page.evaluate(() => {
    (window as any).longTasks = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as any).longTasks.push(e.duration))).observe({ type: "longtask" });
    const host = document.createElement("late-player");
    host.id = "late";
    document.body.append(host);
  });
  // The custom element upgrades later and only then attaches its open shadow root with the video. Until then
  // only the heartbeat runs (checking every remembered host): it must not block the page.
  await page.waitForTimeout(4000);
  const long = await page.evaluate(() => (window as any).longTasks as number[]);
  expect(long.filter((d) => d > 50)).toEqual([]);
  await page.evaluate(() => {
    const video = document.createElement("video");
    video.muted = true;
    video.controls = true;
    video.style.cssText = "width:640px;height:360px;display:block";
    document.querySelector("#late")!.attachShadow({ mode: "open" }).append(video);
    return (window as any).streamVideo(video);
  });
  await expect(page.locator("#late webscaly-player")).toHaveAttribute("data-state", "active", { timeout: 20000 });
  await page.close();
});

test("hover previews and thumbnail clips get no renderer; small and large real players still do", async () => {
  await configure();
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => document.querySelector("#video")?.remove());
  await addStreams(page);
  // A grid of linked thumbnails whose muted clips play on hover, one after another.
  await page.evaluate(async () => {
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4,280px);gap:8px";
    for (let i = 0; i < 8; i++) {
      const a = document.createElement("a"),
        v = document.createElement("video");
      a.href = `#video-${i}`;
      v.muted = true;
      v.loop = true;
      v.style.cssText = "width:280px;height:158px;display:block";
      a.append(v);
      grid.append(a);
    }
    document.body.prepend(grid);
    for (const v of grid.querySelectorAll("video")) {
      await (window as any).streamVideo(v, 320);
      await new Promise((f) => setTimeout(f, 700));
      v.pause();
    }
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).created)).toBe(0);
  // A small real player (controls, not a looping link clip) is still enhanced.
  await page.evaluate(() => {
    const v = document.createElement("video");
    v.id = "small";
    v.muted = true;
    v.controls = true;
    v.style.cssText = "width:400px;height:225px;display:block";
    document.body.prepend(v);
    return (window as any).streamVideo(v);
  });
  await expect(page.locator("webscaly-player")).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  // A large muted autoplay loop (a hero or feed player) is still enhanced.
  await page.evaluate(() => {
    document.querySelector("#small")!.remove();
    const v = document.createElement("video");
    v.id = "hero";
    v.muted = true;
    v.loop = true;
    v.style.cssText = "width:960px;height:540px;display:block";
    document.body.prepend(v);
    return (window as any).streamVideo(v);
  });
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active", { timeout: 15000 });
  await page.close();
});
