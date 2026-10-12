import { test, expect, chromium } from "@playwright/test";
test("Chrome tab sharing feeds a cropped compatibility player and stops cleanly", async () => {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: [
      "--auto-select-tab-capture-source-by-title=WebScaly extension fixture",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  try {
    const source = await context.newPage();
    await source.goto("http://127.0.0.1:5173/tests/browser/fixture.html");
    await source.locator("#play").click();
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5175/viewer.html");
    await page
      .getByRole("button", { name: "Choose video tab", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText("Sharing locally");
    expect(
      await page
        .locator("video")
        .evaluate(
          (v: HTMLVideoElement) =>
            (v.srcObject as MediaStream).getAudioTracks().length,
        ),
    ).toBe(0);
    await page
      .getByRole("button", { name: "Select video area", exact: true })
      .click();
    const r = (await page.locator(".capture-preview video").boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.05, r.y + r.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.7, r.y + r.height * 0.65, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.locator("#status")).toContainText("Video area selected");
    await page
      .getByRole("button", { name: "Enhance selected area", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect
      .poll(async () =>
        Number(
          await page.locator("webscaly-player").getAttribute("data-output-fps"),
        ),
      )
      .toBeGreaterThan(5);
    await page.bringToFront();
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          element: document.fullscreenElement?.className,
          status: document.querySelector("#status")?.textContent,
        })),
      )
      .toMatchObject({ element: "capture-preview" });
    await page
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement))
      .toBe(null);
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.screenshot({ path: "docs/evidence/compatibility-player.png" });
    await page
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveCount(0);
    expect(
      await page
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.srcObject),
    ).toBe(null);
    expect(
      await source.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    ).toBe(false);
  } finally {
    await browser.close();
  }
});
