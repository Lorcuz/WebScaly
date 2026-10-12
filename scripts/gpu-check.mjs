import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.WEBSCALY_TEST_URL ?? "http://127.0.0.1:5173/benchmark.html",
  );
  const report = await page.evaluate(() => window.webscalyValidateGpu());
  report.pageErrors = errors;
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/gpu-local.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    report.validationErrors.length ||
    errors.length ||
    report.results.some((r) => !r.outputNonBlack || r.changedPixels === 0)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
