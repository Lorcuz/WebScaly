import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EMPTY } from "../../src/shared/settings-core";

let context: BrowserContext, worker: Worker, extension: string;
const pageErrors: string[] = [];
test.beforeAll(async () => {
  const directory = resolve("test-results/i18n-extension");
  await mkdir(directory, { recursive: true });
  await cp("dist", directory, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(resolve(directory, "manifest.json"), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(await mkdtemp(resolve("test-results/i18n-profile-")), {
    channel: "chromium", headless: true, locale: "en-US",
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  extension = `chrome-extension://${new URL(worker.url()).host}`;
});
test.afterAll(async () => { await context?.close(); });
test.afterEach(() => { expect(pageErrors).toEqual([]); });
test.beforeEach(async () => {
  pageErrors.length = 0;
  await worker.evaluate(async (config) => { await chrome.storage.local.set({ webscalyConfig: config }); }, EMPTY);
});

test("automatic language follows Chrome and old configurations remain readable", async () => {
  await worker.evaluate(async (config) => {
    const { language, ...preferences } = config.preferences;
    await chrome.storage.local.set({ webscalyConfig: { ...config, preferences } });
  }, EMPTY);
  const uiLanguage = await worker.evaluate(() => chrome.i18n.getUILanguage());
  const page = await context.newPage();
  await page.goto(`${extension}/options.html?section=Behavior`);
  await expect(page.locator("html")).toHaveAttribute("lang", /^ja(?:-|$)/i.test(uiLanguage) ? "ja" : "en");
  await expect(page.locator('select[aria-label="Language"], select[aria-label="言語"]')).toHaveValue("auto");
  await page.close();
});

test("manual language switches live in open popup and settings and survives reload", async () => {
  const page = await context.newPage(), popup = await context.newPage();
  await page.goto(`${extension}/options.html?section=Behavior`);
  await popup.goto(`${extension}/popup.html`);
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("ja");
  await expect(page.getByRole("heading", { name: "動作設定", exact: true })).toBeVisible();
  await expect(popup.getByRole("button", { name: "設定", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "言語", exact: true })).toHaveValue("ja");
  await page.getByRole("combobox", { name: "言語", exact: true }).selectOption("en");
  await expect(popup.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Behavior", exact: true })).toBeVisible();
  await popup.close(); await page.close();
});

test("Japanese settings, built-in presets and help fit; user preset names stay unchanged", async () => {
  await worker.evaluate(async (config) => {
    await chrome.storage.local.set({ webscalyConfig: { ...config,
      preferences: { ...config.preferences, language: "ja" },
      presets: [{ name: "Settings", settings: config.defaults }],
    } });
  }, EMPTY);
  const page = await context.newPage();
  await page.goto(`${extension}/options.html`);
  for (const section of ["映像補正", "ウェブサイト", "プリセット", "動作設定", "診断", "この拡張機能について", "使い方"]) {
    await page.getByRole("navigation").getByRole("button", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/i18n-${section}.png`, fullPage: true });
  }
  await page.getByRole("navigation").getByRole("button", { name: "プリセット", exact: true }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
  await expect(page.getByText("省電力向け", { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "映像補正", exact: true }).click();
  await page.getByRole("radiogroup", { name: "アルゴリズム", exact: true }).hover();
  await expect(page.locator("#webscaly-help")).toContainText("Anime4Kはアニメ");
  await page.screenshot({ path: "test-results/i18n-help.png", fullPage: true });
  await expect(page.getByText("自然な彩度", { exact: true })).toBeVisible();
  await expect(page.getByText("コントラスト", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 800, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/i18n-settings-800.png", fullPage: true });
  await page.close();
});

test("Japanese player controls switch without replacing the video or changing picture settings", async () => {
  const saved = { ...EMPTY, preferences: { ...EMPTY.preferences, language: "ja" as const },
    sites: [{ origin: "http://127.0.0.1", subdomains: false,
      settings: { ...EMPTY.defaults, controls: true, comparison: true, hud: true } }] };
  await worker.evaluate(async (config) => { await chrome.storage.local.set({ webscalyConfig: config }); }, saved);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/tests/browser/fixture.html");
  await page.evaluate(() => window.fixture.create(30, 640, true));
  const toolbar = page.frameLocator('iframe[title="WebScaly video controls"]');
  await expect(toolbar.getByRole("button", { name: "この動画を補正", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("combobox", { name: "動画の品質", exact: true })).toHaveValue("balanced");
  await expect(page.locator("webscaly-player output")).toContainText("元映像");
  await page.evaluate(() => {
    (window as any).originalI18nVideo = document.querySelector("video");
    (window as any).originalI18nCanvas = document.querySelector("webscaly-player")!.shadowRoot!.querySelector("canvas");
  });
  const videoTab = await worker.evaluate(async () => (await chrome.tabs.query({})).find((tab) => tab.url?.includes("/tests/browser/fixture.html"))!.id!);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 700 });
  await popup.goto(`${extension}/popup.html?tab=${videoTab}`);
  await expect(popup.getByRole("button", { name: "設定", exact: true })).toBeVisible();
  await expect(popup.getByRole("radiogroup", { name: "品質", exact: true })).toBeVisible();
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await popup.screenshot({ path: "test-results/i18n-popup.png", fullPage: true });
  await page.locator("video").hover();
  await expect(page.locator('iframe[title="WebScaly video controls"]')).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/i18n-player.png", fullPage: true });
  await worker.evaluate(async () => {
    const { webscalyConfig: config } = await chrome.storage.local.get("webscalyConfig") as any;
    await chrome.storage.local.set({ webscalyConfig: { ...config, preferences: { ...config.preferences, language: "en" } } });
  });
  await expect(toolbar.getByRole("button", { name: "Enhance this video", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).originalI18nVideo === document.querySelector("video"))).toBe(true);
  expect(await page.evaluate(() => (window as any).originalI18nCanvas === document.querySelector("webscaly-player")!.shadowRoot!.querySelector("canvas"))).toBe(true);
  await expect(popup.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await popup.close();
  const settings = await worker.evaluate(async () => (await chrome.storage.local.get("webscalyConfig") as any).webscalyConfig.sites[0].settings);
  expect(settings).toEqual(saved.sites[0].settings);
  await page.close();
});


test("compatibility player translates static instructions, help and live status", async () => {
  await worker.evaluate(async (config) => { await chrome.storage.local.set({
    webscalyConfig: { ...config, preferences: { ...config.preferences, language: "ja" } },
  }); }, EMPTY);
  const page = await context.newPage();
  await page.goto(`${extension}/viewer.html`);
  await expect(page).toHaveTitle("WebScaly 互換プレイヤー");
  await expect(page.getByRole("button", { name: "動画タブを選ぶ", exact: true })).toBeVisible();
  await expect(page.locator("#share")).toHaveAttribute("data-help", "映像に直接アクセスできない場合に、再生中の動画タブを共有します。");
  await expect(page.locator("#status")).toContainText("許可済みの動画タブ");
  await page.screenshot({ path: "test-results/i18n-viewer.png", fullPage: true });
  await worker.evaluate(async (config) => { await chrome.storage.local.set({ webscalyConfig: config }); }, EMPTY);
  await expect(page.getByRole("button", { name: "Choose video tab", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("WebScaly Compatibility Player");
  await page.close();
});
