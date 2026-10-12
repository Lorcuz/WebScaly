import { test, expect } from "@playwright/test";
test("real GPU algorithms produce nontrivial opaque output with no validation errors", async ({
  page,
}) => {
  await page.goto("/benchmark.html");
  const report = await page.evaluate(() => window.webscalyValidateGpu());
  expect(report.adapter.isFallbackAdapter).toBe(false);
  expect(report.validationErrors).toEqual([]);
  for (const result of report.results) {
    expect(result.outputNonBlack).toBe(true);
    expect(result.changedPixels).toBeGreaterThan(100);
    expect(result.opaquePixels).toBe(result.outputPixels);
  }
});
for (const fps of [24, 30, 60])
  test(`procedural ${fps} FPS video executes, pauses and restores native playback`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/lab.html");
    await page.locator("#fps").selectOption(String(fps));
    await page.locator("#resolution").selectOption("1280");
    await page
      .getByRole("button", { name: "Create video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Enable WebScaly", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
      { timeout: 20000 },
    );
    await expect
      .poll(async () =>
        Number(
          await page.locator("webscaly-player").getAttribute("data-output-fps"),
        ),
      )
      .toBeGreaterThan(fps * 0.5);
    await page.getByRole("button", { name: "Pause / resume" }).click();
    expect(
      await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    ).toBe(true);
    await page.locator("video").scrollIntoViewIfNeeded();
    await page.locator("video").hover();
    await page
      .frameLocator('iframe[title="WebScaly video controls"]')
      .getByRole("button", { name: "Enhance this video", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "disabled",
    );
    await page
      .frameLocator('iframe[title="WebScaly video controls"]')
      .getByRole("button", { name: "Enhance this video", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    await page
      .getByRole("button", { name: "Remove player", exact: true })
      .click();
    await expect(page.locator("webscaly-player")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
