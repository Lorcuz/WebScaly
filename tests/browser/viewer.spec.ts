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
    // 0.5.1 review fix: Escape in the middle of a new drag keeps the area that was in use.
    const canvasWidth = () =>
      page.evaluate(() => document.querySelector("webscaly-player")!.shadowRoot!.querySelector("canvas")!.width);
    const selectedWidth = await canvasWidth();
    await page
      .getByRole("button", { name: "Select video area", exact: true })
      .click();
    await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.33, r.y + r.height * 0.34, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("#status")).toContainText("previous area is kept");
    expect(await page.locator("#selection").isHidden()).toBe(true);
    await page
      .getByRole("button", { name: "Enhance selected area", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(await canvasWidth()).toBe(selectedWidth);
    // A too-small drag also keeps the area that was in use.
    await page
      .getByRole("button", { name: "Select video area", exact: true })
      .click();
    await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.505, r.y + r.height * 0.505, { steps: 2 });
    await page.mouse.up();
    await expect(page.locator("#status")).toContainText("previous area is kept");
    await page
      .getByRole("button", { name: "Enhance selected area", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(await canvasWidth()).toBe(selectedWidth);
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
