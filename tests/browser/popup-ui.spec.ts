// U1–U4 and popup accessibility: real extension popup over a real enhanced video.
import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULTS, EMPTY } from "../../src/shared/settings";

let context: BrowserContext, worker: Worker, id: string;
const origin = "http://127.0.0.1",
  url = origin + ":5173/tests/browser/fixture.html";
test.beforeAll(async () => {
  const directory = resolve("test-results/extension-popup-ui");
  await mkdir(directory, { recursive: true });
  // WEBSCALY_EXTENSION_DIR runs the same checks against an unpacked release ZIP (default: the dist build).
  await cp(process.env.WEBSCALY_EXTENSION_DIR ?? "dist", directory, { recursive: true });
  const m = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"));
  m.host_permissions = ["http://127.0.0.1/*"]; // static loopback grant, as in extension.spec.ts
  await writeFile(resolve(directory, "manifest.json"), JSON.stringify(m));
  context = await chromium.launchPersistentContext(await mkdtemp(resolve("test-results/popup-ui-profile-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  id = new URL(worker.url()).host;
  for (const p of context.pages()) await p.close();
});
test.afterAll(async () => {
  await context?.close();
});

test("the popup separates toggles from actions, explains skipped frames and keeps stable names", async () => {
  await worker.evaluate(
    async (c) => chrome.storage.local.set({ webscalyConfig: c }),
    { ...EMPTY, preferences: { ...EMPTY.preferences, welcomed: true }, sites: [{ origin, subdomains: false, settings: { ...DEFAULTS, comparison: true } }] },
  );
  const video = await context.newPage();
  await video.goto(url);
  await video.evaluate(() => window.fixture.create(30, 640));
  await expect(video.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  const tabId = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id, url);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 600 });
  await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);

  // U1: the header carries the state; the card carries how ("WebGPU · Anime4K Balanced"), not "Enhancing" again.
  await expect(popup.getByRole("status").first()).toHaveText(/Enhancing/);
  const card = popup.getByRole("region", { name: "Live enhancement" });
  await expect(card.locator(".engine")).toHaveText(/^WebGPU · \S+/);
  await expect(card).not.toContainText("Enhancing");

  // U2: toggles expose their state; actions are plain buttons with their own group.
  const toggles = popup.getByRole("group", { name: "Show on the video" });
  for (const name of ["Compare", "Controls", "HUD"])
    await expect(toggles.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", /true|false/);
  await expect(toggles.getByRole("button", { name: "Compare", exact: true })).toHaveAttribute("aria-pressed", "true");
  const actions = popup.getByRole("group", { name: "Actions" });
  for (const name of ["Hold for original", "Snapshot"]) {
    const b = actions.getByRole("button", { name, exact: true });
    await expect(b).toBeVisible();
    expect(await b.getAttribute("aria-pressed")).toBeNull();
  }
  await toggles.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(toggles.getByRole("button", { name: "Compare", exact: true })).toHaveAttribute("aria-pressed", "false");

  // U3: "skipped" is explained on keyboard focus (and hover), as a described tooltip.
  const skipped = card.getByText(/\d+ skipped/);
  // Keyboard use (the mouse was used above; tooltips follow the input device).
  await popup.keyboard.press("Shift");
  await skipped.focus();
  const tip = popup.getByRole("tooltip");
  await expect(tip).toContainText("GPU was still busy");
  await expect(tip).toContainText("Playback is unaffected");
  expect(await skipped.getAttribute("aria-describedby")).toContain(await tip.getAttribute("id"));

  // The pause button keeps one name; its state is in aria-pressed.
  const pause = popup.getByRole("button", { name: "Pause WebScaly everywhere", exact: true });
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await pause.click();
  await expect(popup.getByRole("button", { name: "Pause WebScaly everywhere", exact: true })).toHaveAttribute("aria-pressed", "true");
  await popup.getByRole("button", { name: "Pause WebScaly everywhere", exact: true }).click();
  await expect(popup.getByRole("button", { name: "Pause WebScaly everywhere", exact: true })).toHaveAttribute("aria-pressed", "false");

  // The per-site switch has a visible label that is also its name.
  await expect(popup.getByRole("switch", { name: "Enhance", exact: true })).toBeVisible();
  await expect(popup.getByText("Enhance", { exact: true })).toBeVisible();
  await popup.close();
  await video.close();
});

test("before access is granted, the popup says what WebScaly reads next to the Allow action", async () => {
  await worker.evaluate(async (c) => chrome.storage.local.set({ webscalyConfig: c }), EMPTY);
  const popup = await context.newPage();
  // A popup opened as a page cannot read an unapproved tab's address (the toolbar popup gets it from activeTab).
  await popup.addInitScript(() => {
    const tab = { id: 987654, url: "https://video.example/watch", title: "Video" };
    chrome.tabs.get = (async () => tab) as unknown as typeof chrome.tabs.get;
    chrome.tabs.query = (async () => [tab]) as unknown as typeof chrome.tabs.query;
  });
  await popup.goto(`chrome-extension://${id}/popup.html?tab=987654`);
  await expect(popup.getByRole("button", { name: "Allow on this website" })).toBeVisible();
  const disclosure = popup.getByRole("list", { name: "How WebScaly works" });
  await expect(disclosure).toContainText("address and video frames");
  await expect(disclosure).toContainText("Nothing is uploaded");
  await expect(disclosure).toContainText("Runs only on websites you allow");
  // The longer disclosure must still fit the 360 × 600 popup without scrolling.
  const size = await popup.locator("main.popup").evaluate((e) => ({
    width: e.getBoundingClientRect().width,
    height: e.getBoundingClientRect().height,
    scroll: e.scrollHeight > e.clientHeight,
  }));
  expect(size.width).toBe(360);
  expect(size.height).toBeLessThanOrEqual(600);
  expect(size.scroll).toBe(false);
  await popup.screenshot({ path: "test-results/popup-unapproved.png" });
  await popup.close();
});
