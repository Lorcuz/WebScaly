// Captures the real extension UI (popup states, every settings section, the
// in-player toolbar) for design review. Requires `npm run build` and the dev
// server (`npm run dev`) for the procedural fixture page.
import { resolve } from "node:path";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const { chromium, expect } = await import("@playwright/test");
const out = resolve(process.argv[2] ?? "test-results/design");
await mkdir(out, { recursive: true });
const extension = resolve("test-results/ui-extension");
await rm(extension, { recursive: true, force: true });
await cp("dist", extension, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(extension, "manifest.json"), "utf8"));
// Static loopback access stands in for the user's approval in this isolated profile.
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(resolve(extension, "manifest.json"), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(
  await mkdtemp(resolve("test-results/ui-profile-")),
  {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  },
);
try {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const configure = (settings, preferences = {}) =>
    worker.evaluate(
      async ([settings, preferences]) => {
        const base = {
          enabled: true, algorithm: "anime4k", quality: "balanced", scale: "auto", maxHeight: 1080,
          strength: 0.35, denoise: 0.12, deband: 0.2, vibrance: 0.1, contrast: 0, brightness: 0,
          skipAbove: 0, adaptive: true, hud: false, comparison: false, split: 0.5, controls: false,
        };
        await chrome.storage.local.set({
          webscalyConfig: {
            version: 2,
            defaults: base,
            sites: [
              { origin: "http://127.0.0.1", subdomains: false, settings: { ...base, ...settings } },
              { origin: "https://www.dailymotion.com", subdomains: false, settings: base },
              { origin: "https://example.org", subdomains: true, settings: { ...base, algorithm: "fsrcnnx" } },
            ],
            presets: [{ name: "Late-night anime", settings: { ...base, deband: 0.4 } }],
            preferences: { paused: false, batterySaver: false, welcomed: true, ...preferences },
          },
        });
      },
      [settings, preferences],
    );
  for (const page of context.pages()) await page.close().catch(() => {});
  await configure({ hud: true, controls: true, comparison: true, split: 0.42 });
  const video = await context.newPage();
  await video.setViewportSize({ width: 1280, height: 760 });
  await video.goto("http://127.0.0.1:5173/tests/browser/fixture.html");
  await video.evaluate(() => window.fixture.create(30, 640));
  await expect(video.locator("webscaly-player")).toHaveAttribute("data-state", "active", { timeout: 15000 });
  await video.waitForTimeout(1500);
  const tabId = await worker.evaluate(
    async () => (await chrome.tabs.query({ url: "http://127.0.0.1:5173/*" }))[0]?.id,
  );
  await video.locator("video").hover();
  await video.waitForTimeout(400);
  await video.screenshot({ path: resolve(out, "player-toolbar.png") });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 760 });
  const shoot = async (name) => {
    await popup.waitForTimeout(700);
    await popup.evaluate(() => document.fonts.ready);
    await popup.locator("main.popup").screenshot({ path: resolve(out, `popup-${name}.png`) });
  };
  await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await expect(popup.getByText("Enhancing ·")).toBeVisible({ timeout: 10000 });
  await shoot("active");
  await popup.getByText("Fine-tune").click();
  await shoot("finetune");
  await configure({ enabled: false });
  await popup.reload();
  await shoot("off");
  await configure({}, { paused: true });
  await popup.reload();
  await shoot("paused");
  await configure({});
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await shoot("no-tab");
  // A popup opened as a page cannot read an unapproved tab's address (the real
  // toolbar popup gets it from activeTab), so this page answers the tab lookup.
  const unapproved = await context.newPage();
  await unapproved.setViewportSize({ width: 360, height: 760 });
  await unapproved.addInitScript(() => {
    const tab = { id: 987654, url: "https://www.youtube.com/watch?v=WebScalyDemo", title: "Video" };
    chrome.tabs.get = async () => tab;
    chrome.tabs.query = async () => [tab];
  });
  await unapproved.goto(`chrome-extension://${id}/popup.html?tab=987654`);
  await expect(unapproved.getByRole("button", { name: "Allow on this website" })).toBeVisible();
  await unapproved.waitForTimeout(500);
  await unapproved.evaluate(() => document.fonts.ready);
  await unapproved.locator("main.popup").screenshot({ path: resolve(out, "popup-unapproved.png") });
  await unapproved.close();

  const settings = await context.newPage();
  for (const [section, width] of [
    ["Enhancement", 1280],
    ["Websites", 1280],
    ["Presets", 1280],
    ["Behavior", 1280],
    ["Diagnostics", 1280],
    ["About", 1280],
    ["Welcome", 1280],
    ["Enhancement", 390],
    ["Websites", 390],
  ]) {
    await settings.setViewportSize({ width, height: width > 600 ? 800 : 844 });
    await settings.goto(
      `chrome-extension://${id}/options.html?tab=${tabId}&section=${section}&profile=${encodeURIComponent("http://127.0.0.1")}`,
    );
    await settings.waitForTimeout(section === "Enhancement" || section === "Welcome" ? 2200 : 700);
    await settings.evaluate(() => document.fonts.ready);
    await settings.screenshot({
      path: resolve(out, `settings-${section.toLowerCase()}-${width}.png`),
      fullPage: true,
    });
  }
  console.log(`UI captures written to ${out}`);
} finally {
  await context.close();
}
