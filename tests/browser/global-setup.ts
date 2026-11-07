import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const pages = ["fixture.html", "players.html"].map(
  (p) => `http://127.0.0.1:5173/tests/browser/${p}`,
);
export default async function setup() {
  execFileSync(process.execPath, ["scripts/make-fixtures.mjs"], {
    stdio: "inherit",
  });
  // A cold Vite dev server optimizes its dependencies on the first page load
  // and reloads that page, which aborted the navigation of the first tests.
  // Loading the pages once here lets the optimizer finish before any test runs.
  const browser = await chromium.launch({ channel: "chromium" });
  try {
    for (let round = 0; round < 2; round++)
      for (const url of pages) {
        const page = await browser.newPage();
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
        } catch {
          /* The reload this warm-up exists to absorb may abort a navigation. */
        }
        await page.close();
      }
  } finally {
    await browser.close();
  }
}
