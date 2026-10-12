import { test, expect } from "@playwright/test";
async function start(page: any) {
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable WebScaly", exact: true })
    .click();
}
test("packaged laboratory uses native-rate enhancement with its own entry point", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5175/lab.html");
  await start(page);
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
    .toBeGreaterThan(15);
  await expect(page.getByLabel("Neural interpolation")).toHaveCount(0);
});
for (const kind of ["missing", "canvas", "webgl1"])
  test(`${kind} WebGPU capability uses spatial WebGL fallback`, async ({
    page,
  }) => {
    await page.addInitScript((kind) => {
      if (kind !== "canvas")
        Object.defineProperty(Navigator.prototype, "gpu", {
          get: () => undefined,
          configurable: true,
        });
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        k: string,
        ...args: unknown[]
      ) {
        return (kind === "canvas" && k === "webgpu") ||
          (kind === "webgl1" && k === "webgl2")
          ? null
          : Reflect.apply(original, this, [k, ...args]);
      } as typeof original;
    }, kind);
    await page.goto("/lab.html");
    await start(page);
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.locator("#diagnostics")).toContainText(
      kind === "webgl1" ? "WebGL spatial" : "WebGL2",
    );
    await expect
      .poll(async () =>
        Number(
          await page.locator("webscaly-player").getAttribute("data-output-fps"),
        ),
      )
      .toBeGreaterThan(15);
    expect(
      await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    ).toBe(false);
  });
test("no graphics API preserves native playback without opening on-video errors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "gpu", {
      get: () => undefined,
      configurable: true,
    });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      k: string,
      ...args: unknown[]
    ) {
      return k.startsWith("webgl")
        ? null
        : Reflect.apply(original, this, [k, ...args]);
    } as typeof original;
  });
  await page.goto("/lab.html");
  await start(page);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "unavailable",
  );
  await expect(page.locator("webscaly-player details")).toHaveCount(0);
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(false);
});
test("temporary decoder unavailability recovers at native rate", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = VideoFrame;
    let failures = 4;
    window.VideoFrame = new Proxy(Original, {
      construct(target, args) {
        if (failures-- > 0)
          throw new DOMException(
            "Decoder frame unavailable",
            "InvalidStateError",
          );
        return Reflect.construct(target, args);
      },
    });
  });
  await page.goto("/lab.html");
  await start(page);
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
    .toBeGreaterThan(15);
});
test("missing optional GPU features keeps WebGPU enhancement and omits GPU timing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const gpu = navigator.gpu,
      request = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (options) => {
      const adapter = await request(options);
      return (
        adapter &&
        new Proxy(adapter, {
          get(target, key) {
            if (key === "features") return new Set();
            const value = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        })
      );
    };
  });
  await page.goto("/lab.html");
  await start(page);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-backend",
    "WebGPU",
  );
  await expect(page.locator("#diagnostics")).toContainText('"gpuMs": null');
  await expect
    .poll(async () =>
      Number(
        await page.locator("webscaly-player").getAttribute("data-output-fps"),
      ),
    )
    .toBeGreaterThan(15);
});
test("reported low texture limits bound working and output surfaces", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (options) {
      const device = await original.call(this, options),
        limits = device.limits;
      Object.defineProperty(device, "limits", {
        value: new Proxy(limits, {
          get(target, key) {
            return key === "maxTextureDimension2D"
              ? 256
              : Reflect.get(target, key, target);
          },
        }),
      });
      return device;
    };
  });
  await page.goto("/lab.html");
  await start(page);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  const size = await page
    .locator("webscaly-player canvas")
    .evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(Math.max(...size)).toBeLessThanOrEqual(256);
  await expect
    .poll(async () =>
      Number(
        await page.locator("webscaly-player").getAttribute("data-output-fps"),
      ),
    )
    .toBeGreaterThan(15);
});
test("device loss moves the active renderer to spatial WebGL without pausing video", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (options) {
      const device = await original.call(this, options);
      (window as any).testDevice = device;
      return device;
    };
  });
  await page.goto("/lab.html");
  await start(page);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-backend",
    "WebGPU",
  );
  await page.evaluate(() => (window as any).testDevice.destroy());
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-backend",
    "WebGL2",
  );
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(false);
});
test("a rejected neural pipeline falls back to spatial enhancement with an explanation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = GPUDevice.prototype.createComputePipelineAsync;
    GPUDevice.prototype.createComputePipelineAsync = function (descriptor) {
      if (descriptor.label?.startsWith("FSRCNNX"))
        return Promise.reject(new Error("Neural pipeline unavailable"));
      return original.call(this, descriptor);
    };
  });
  await page.goto("/lab.html");
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  await page.getByLabel("Algorithm", { exact: true }).selectOption("fsrcnnx");
  await page
    .getByRole("button", { name: "Enable WebScaly", exact: true })
    .click();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.locator("#diagnostics")).toContainText(
    "Neural processing is unavailable",
  );
  await expect(page.locator("#diagnostics")).toContainText(
    '"algorithm": "spatial"',
  );
});
test("blocked interactive frames preserve enhancement and report popup controls as the fallback", async ({
  page,
}) => {
  await page.route("**/ui-frame.html*", (route) => route.abort());
  await page.goto("/lab.html");
  await start(page);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.locator("#diagnostics")).toContainText(
    '"controlsAvailable": false',
  );
  await expect
    .poll(async () =>
      Number(
        await page.locator("webscaly-player").getAttribute("data-output-fps"),
      ),
    )
    .toBeGreaterThan(15);
});
