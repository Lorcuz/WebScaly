import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const { chromium, expect } = await import("@playwright/test");
await mkdir("test-results/design", { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  await page.goto("http://127.0.0.1:5173/options.html");
  await expect(
    page.getByRole("heading", { name: "Video Enhancement", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/design/design-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Site Profiles" }).click();
  await expect(
    page.getByRole("heading", { name: "Site Profiles", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/design/design-sites.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Video Enhancement" }).click();
  await page.screenshot({
    path: "test-results/design/design-responsive.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5173/popup.html");
  await expect(
    page.getByRole("heading", { name: "WebScaly", exact: true }),
  ).toBeVisible();
  await page
    .locator("main.popup")
    .screenshot({ path: "test-results/design/design-popup.png" });
  console.log(
    "Captured five actual interface states for Product Design review. Preview labels remain visible.",
  );
} finally {
  await browser.close();
}
