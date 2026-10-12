import { expect, test } from "vitest";
import { pixelCrop } from "../../src/core/crop";
test("cropping a tab to an embedded 720p player stays inside the captured pixels", () => {
  expect(
    pixelCrop(1920, 1080, {
      left: 320 / 1920,
      top: 180 / 1080,
      width: 1280 / 1920,
      height: 720 / 1080,
    }),
  ).toEqual({ x: 320, y: 180, width: 1280, height: 720 });
  expect(
    pixelCrop(1920, 1080, { left: 0.9, top: 0.9, width: 1, height: 1 }),
  ).toEqual({ x: 1728, y: 972, width: 192, height: 108 });
  expect(
    pixelCrop(1920, 1080, { left: NaN, top: -1, width: 0, height: 2 }),
  ).toEqual({ x: 0, y: 0, width: 1, height: 1080 });
});
