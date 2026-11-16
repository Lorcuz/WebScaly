import { test, expect } from "@playwright/test";
test("real GPU algorithms produce nontrivial opaque output with no validation errors", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/benchmark.html");
  const report = await page.evaluate(() => window.webscalyValidateGpu());
  expect(report.adapter.isFallbackAdapter).toBe(false);
  expect(report.validationErrors).toEqual([]);
  for (const result of report.results) {
    expect(result.outputNonBlack).toBe(true);
    expect(result.changedPixels).toBeGreaterThan(100);
    expect(result.opaquePixels).toBe(result.outputPixels);
  }
  // G7: every engine and quality mode (CNNx2VL and restore-only Anime4K included) at 2x, 1:1 and a second size,
  // checked for size, opacity, finite intermediates and the expected image transformation.
  expect(report.cases.length).toBeGreaterThanOrEqual(16);
  const failed = report.cases
    .filter((c) => !c.ok)
    .map((c) => `${c.label}: ${c.errors.join("; ")} ${Object.entries(c.checks).filter(([, x]) => !x.ok).map(([k, x]) => `${k}=${x.value} (${x.limit})`).join(", ")}`);
  expect(failed).toEqual([]);
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

test("GPU validation works again on a new device after the previous one was destroyed", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/tests/browser/renderer.html");
  const result = await page.evaluate(async () => {
    const { qualityCase, qualityCases } = await import("/src/lab/gpu-quality.ts" as string);
    const c = qualityCases().find((x: { algorithm: string; quality: string }) => x.algorithm === "spatial" && x.quality === "fast");
    const device = async () => (await (await navigator.gpu.requestAdapter())!.requestDevice());
    const first = await device();
    const a = await qualityCase(first, c);
    first.destroy();
    // The shared device is released when idle and created again later: the validation must not reuse
    // pipelines that belong to the destroyed one.
    const second = await device();
    const b = await qualityCase(second, c);
    second.destroy();
    return { a: { ok: a.ok, errors: a.errors }, b: { ok: b.ok, errors: b.errors } };
  });
  expect(result.a).toEqual({ ok: true, errors: [] });
  expect(result.b).toEqual({ ok: true, errors: [] });
});
