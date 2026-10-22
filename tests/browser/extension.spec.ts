import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Worker,
  type Page,
} from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { DEFAULTS, EMPTY, type Settings } from "../../src/shared/settings";
import sharp from "sharp";
let context: BrowserContext, worker: Worker, id: string;
const origin = "http://127.0.0.1",
  url = origin + ":5173/tests/browser/fixture.html";
async function configure(s: Settings = DEFAULTS, embedded = false) {
  await worker.evaluate(
    async (c) => {
      await chrome.storage.local.set({ webscalyConfig: c });
    },
    {
      ...EMPTY,
      sites: [
        { origin, subdomains: false, settings: s },
        ...(embedded
          ? [{ origin: "http://localhost", subdomains: false, settings: s }]
          : []),
      ],
    },
  );
}
async function fixture(record = false) {
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(
    (record) => window.fixture.create(30, 640, record),
    record,
  );
  return page;
}
async function options(page?: Page) {
  page ??= await context.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  return page;
}
test.beforeAll(async () => {
  const directory = resolve("test-results/extension");
  await mkdir(directory, { recursive: true });
  await mkdir(resolve("test-results/ui"), { recursive: true });
  await cp("dist", directory, { recursive: true });
  const m = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  // Static loopback grants exercise injected extension code. Native approval callbacks are unit-tested separately.
  m.host_permissions = [
    "http://127.0.0.1/*",
    "http://localhost/*",
    "http://plain.webscaly.test/*",
  ];
  await writeFile(resolve(directory, "manifest.json"), JSON.stringify(m));
  context = await chromium.launchPersistentContext(
    await mkdtemp(resolve("test-results/extension-profile-")),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${directory}`,
        `--load-extension=${directory}`,
        // A non-loopback name, so the page is not a secure context.
        "--host-resolver-rules=MAP plain.webscaly.test 127.0.0.1",
      ],
    },
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  id = new URL(worker.url()).host;
});
test.afterAll(async () => context?.close());
test.beforeEach(async () => {
  await worker.evaluate(async (c) => {
    await chrome.storage.local.set({ webscalyConfig: c });
  }, EMPTY);
});
test("approval is required and all player UI starts hidden", async () => {
  const page = await fixture();
  await expect(page.locator("webscaly-player")).toHaveCount(0);
  await configure();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.locator('iframe[title^="WebScaly"]')).toHaveCount(0);
  await expect(page.locator("webscaly-player output")).toBeHidden();
  await page.close();
});
test("settings persist, revocation removes processing immediately and after refresh, reapproval works", async () => {
  await configure();
  const page = await fixture(true),
    settings = await options();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await settings.getByLabel("Editing profile").selectOption(origin);
  await settings.getByRole("radio", { name: /^Anime4K/ }).check();
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            (await chrome.storage.local.get("webscalyConfig"))
              .webscalyConfig as any
          ).sites[0].settings.algorithm,
      ),
    )
    .toBe("anime4k");
  await settings.reload();
  await settings.getByLabel("Editing profile").selectOption(origin);
  await expect(
    settings.getByRole("radio", { name: /^Anime4K/ }),
  ).toBeChecked();
  await settings.getByRole("button", { name: "Websites" }).click();
  await settings
    .getByRole("button", { name: "Remove 127.0.0.1", exact: true })
    .click();
  await settings.getByRole("button", { name: "Remove website", exact: true }).click();
  await expect(page.locator("webscaly-player")).toHaveCount(0);
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(false);
  await page.reload();
  await page.click("#play");
  await expect(page.locator("webscaly-player")).toHaveCount(0);
  await configure();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.close();
  await settings.close();
});
test("controls frames never post to a document that is not the extension page", async () => {
  await configure({ ...DEFAULTS, controls: true, comparison: false });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(url);
  await page.evaluate(() => window.fixture.create(30, 640, false));
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  const iframe = page.locator('iframe[title="WebScaly video controls"]');
  await expect(iframe).toBeVisible();
  // Settings changes, a second frame appearing, and a container move that
  // reloads the frame: each used to post while the frame held about:blank.
  await configure({ ...DEFAULTS, controls: true, comparison: true });
  await expect(page.locator('iframe[title="WebScaly comparison"]')).toBeVisible();
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="WebScaly video controls"]')!;
    const holder = document.createElement("div");
    document.body.append(holder);
    holder.append(frame);
  });
  await configure({ ...DEFAULTS, controls: true, comparison: false, hud: true });
  await page.waitForTimeout(1200);
  await expect(page.locator("webscaly-player output")).toBeVisible();
  expect(problems.filter((t) => /postMessage|target origin|origin/i.test(t))).toEqual([]);
  await page.close();
});
test("isolated controls and slider preserve playback and capture-phase native handlers", async () => {
  await configure({ ...DEFAULTS, controls: true, comparison: true });
  const page = await fixture();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.evaluate(() => {
    (window as any).nativeEvents = 0;
    for (const name of ["pointerdown", "click", "keydown"])
      document.addEventListener(
        name,
        () => {
          (window as any).nativeEvents++;
        },
        true,
      );
  });
  const controls = page.frameLocator('iframe[title="WebScaly video controls"]'),
    compare = page.frameLocator('iframe[title="WebScaly comparison"]');
  await expect(
    controls.getByRole("button", { name: "Enhance this video" }),
  ).toBeVisible();
  await controls.getByRole("button", { name: "HUD", exact: true }).click();
  await expect(page.locator("webscaly-player output")).toBeVisible();
  // The controls frame is sized to its toolbar, so no transparent band covers the video.
  const frameBox = (await page
    .locator('iframe[title="WebScaly video controls"]')
    .boundingBox())!;
  expect(frameBox.height).toBeLessThan(60);
  expect(frameBox.width).toBeLessThan(600);
  const slider = compare.getByRole("slider");
  await slider.focus();
  await slider.press("End");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            (await chrome.storage.local.get("webscalyConfig"))
              .webscalyConfig as any
          ).sites[0].settings.split,
      ),
    )
    .toBe(1);
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (
            (await chrome.storage.local.get("webscalyConfig"))
              .webscalyConfig as any
          ).sites[0].settings.split,
      ),
    )
    .toBeLessThan(0.4);
  expect(await page.evaluate(() => (window as any).nativeEvents)).toBe(0);
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(false);
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(compare.getByRole("slider")).toBeVisible();
  await page.close();
});
test("enhancement preserves the complete native Chrome control row", async () => {
  await configure({ ...DEFAULTS, enabled: false });
  const page = await fixture(true);
  await page.locator("video").evaluate((video: HTMLVideoElement) => video.pause());
  await page.locator("video").hover();
  const box = (await page.locator("video").boundingBox())!;
  const pixels = async () =>
    sharp(
      await page.screenshot({
        clip: { x: box.x + 12, y: box.y + box.height - 67, width: 220, height: 18 },
      }),
    ).removeAlpha().raw().toBuffer();
  const original = await pixels();
  const bright = (data: Buffer) => {
    let count = 0;
    for (let i = 0; i < data.length; i += 3)
      if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) count++;
    return count;
  };
  expect(bright(original)).toBeGreaterThan(5);
  await configure();
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  await page.locator("video").hover();
  const enhanced = await pixels();
  expect(bright(enhanced)).toBeGreaterThanOrEqual(bright(original) * 0.8);
  const difference = original.reduce((sum, value, i) => sum + Math.abs(value - enhanced[i]), 0) / original.length;
  expect(difference).toBeLessThan(3);
  await page.close();
});

test("enhancement preserves the visible native JW/Vixcloud toolbar and captions", async () => {
  await configure({ ...DEFAULTS, controls: true, comparison: true });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/tests/browser/players.html?player=jw");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.click("#play");
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  const pixels = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return (
      await sharp(
        await page.screenshot({
          clip: {
            x: box.x + box.width - 30,
            y: box.y + 8,
            width: 10,
            height: 10,
          },
        }),
      ).stats()
    ).channels.map((c) => c.mean);
  };
  const nativeVisible = async () => {
    const toolbar = await pixels(".native-controls");
    expect(toolbar[0]).toBeGreaterThan(200);
    expect(toolbar[1]).toBeLessThan(100);
    const captions = await pixels(".jw-captions");
    expect(captions[0]).toBeGreaterThan(200);
    expect(captions[1]).toBeGreaterThan(150);
  };
  await nativeVisible();
  await page.click("#native-pause");
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(true);
  await page
    .frameLocator('iframe[title="WebScaly video controls"]')
    .getByRole("button", { name: "HUD", exact: true })
    .click();
  await nativeVisible();
  await page.click("#native-pause");
  expect(
    await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(false);
  await page.click("#fullscreen");
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await nativeVisible();
  await page.keyboard.press("Escape");
  await page.close();
});

for (const kind of ["jw", "videojs", "plyr", "hls", "dash"])
  test(`${kind} player enhances native video through pause, seek and fullscreen`, async () => {
    await configure({ ...DEFAULTS, controls: true, comparison: true });
    const page = await context.newPage();
    await page.goto(
      `http://127.0.0.1:5173/tests/browser/players.html?player=${kind}`,
    );
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.click("#play");
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
    const video = page.locator("video");
    await video.evaluate((v: HTMLVideoElement) => {
      v.pause();
      v.currentTime = 1;
    });
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    const controls = page.frameLocator(
      'iframe[title="WebScaly video controls"]',
    );
    await controls.getByRole("button", { name: "HUD", exact: true }).click();
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await video.evaluate((v: HTMLVideoElement) => v.play());
    await page.click("#fullscreen");
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(true);
    await expect(
      controls.getByRole("button", { name: "HUD", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("webscaly-player")).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.close();
  });
test("a player host alone cannot process a frame under an unapproved parent", async () => {
  await worker.evaluate(
    async (c) => chrome.storage.local.set({ webscalyConfig: c }),
    {
      ...EMPTY,
      sites: [
        { origin: "http://localhost", subdomains: false, settings: DEFAULTS },
      ],
    },
  );
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => {
    const f = document.createElement("iframe");
    f.src = "http://localhost:5173/tests/browser/fixture.html";
    f.width = "1000";
    f.height = "600";
    document.body.prepend(f);
  });
  await page.frameLocator("iframe").locator("#play").click();
  await expect(
    page.frameLocator("iframe").locator("webscaly-player"),
  ).toHaveCount(0);
  await page.close();
});
test("parent revocation stops approved cross-origin players while retaining the player profile", async () => {
  await configure(DEFAULTS, true);
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => {
    const f = document.createElement("iframe");
    f.src = "http://localhost:5173/tests/browser/fixture.html";
    f.width = "1000";
    f.height = "600";
    document.body.prepend(f);
  });
  const frame = page.frameLocator("iframe");
  await frame.locator("#play").click();
  await expect(frame.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  const settings = await options();
  await settings.evaluate(
    (origin) => chrome.runtime.sendMessage({ type: "webscaly:remove", origin }),
    origin,
  );
  await expect(frame.locator("webscaly-player")).toHaveCount(0);
  expect(
    await worker.evaluate(async () =>
      (
        (await chrome.storage.local.get("webscalyConfig")).webscalyConfig as any
      ).sites.map((s: any) => s.origin),
    ),
  ).toEqual(["http://localhost"]);
  await page.reload();
  await page.evaluate(() => {
    const f = document.createElement("iframe");
    f.src = "http://localhost:5173/tests/browser/fixture.html";
    f.width = "1000";
    f.height = "600";
    document.body.prepend(f);
  });
  await page.frameLocator("iframe").locator("#play").click();
  await expect(
    page.frameLocator("iframe").locator("webscaly-player"),
  ).toHaveCount(0);
  await page.close();
  await settings.close();
});
test("dynamic source replacement, fullscreen, removal and open Shadow DOM stay bounded", async () => {
  await configure({ ...DEFAULTS, controls: true });
  const page = await fixture();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.evaluate(() => window.fixture.create(60, 1280));
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.click("#fullscreen");
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(
    page
      .frameLocator('iframe[title="WebScaly video controls"]')
      .getByRole("button", { name: "HUD" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const e = document.createElement("div");
    document.querySelector(".player")!.append(e);
    e.attachShadow({ mode: "open" }).append(document.querySelector("video")!);
  });
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.locator("video").evaluate((v) => v.remove());
  await expect(page.locator("webscaly-player")).toHaveCount(0);
  await expect(page.locator('iframe[title^="WebScaly"]')).toHaveCount(0);
  await page.close();
});
test("popup is compact, options are keyboard accessible and old generation options are absent", async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/popup.html`);
  await expect(page.getByRole("heading", { name: "WebScaly" })).toBeVisible();
  const size = await page.locator("main.popup").evaluate((e) => ({
    width: e.getBoundingClientRect().width,
    height: e.getBoundingClientRect().height,
    scroll: e.scrollHeight > e.clientHeight,
  }));
  expect(size.width).toBe(360);
  expect(size.height).toBeLessThanOrEqual(600);
  expect(size.scroll).toBe(false);
  await page.getByRole("button", { name: "Settings" }).focus();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page
    .locator("main.popup")
    .screenshot({
      animations: "disabled",
      path: "test-results/ui/popup-access-off.png",
    });
  await page.setViewportSize({ width: 1904, height: 913 });
  await options(page);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/ui/settings.png",
    fullPage: true,
  });
  await page.getByRole("radio", { name: /^Spatial Detail/ }).focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await options(page);
  for (const section of ["Websites", "Presets", "Behavior", "Diagnostics", "About"]) {
    await page.getByRole("button", { name: section }).click();
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText("Frame Generation", { exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
  await page.close();
});

test("technical help waits for hover, stays readable and dismisses with Escape", async () => {
  const page = await options();
  const algorithm = page.getByRole("radiogroup", { name: "Algorithm" });
  await algorithm.hover();
  await page.waitForTimeout(350);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(240);
  expect(box!.height).toBeLessThan(80);
  await tip.hover();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
  await page.getByRole("button", { name: "Websites" }).hover();
  await page.waitForTimeout(800);
  await expect(tip).toHaveCount(0);
  await page.close();
});

test("About keeps donations opt-in and contacts local until followed", async () => {
  const page = await options();
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByLabel("Editing profile")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /notlorcuz@gmail.com/ }),
  ).toHaveAttribute("href", "mailto:notlorcuz@gmail.com");
  await expect(page.getByRole("link", { name: /Discord/ })).toHaveAttribute(
    "href",
    "https://discord.com/users/754255237195235369",
  );
  await expect(
    page.getByRole("img", { name: "PayPal donation QR code" }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/ui/about.png",
    fullPage: true,
  });
  const support = page.getByRole("button", { name: "Support WebScaly" });
  await support.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Hide QR code" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("img", { name: "PayPal donation QR code" }),
  ).toBeVisible();
  await expect(page.locator(".qr-window img")).toHaveJSProperty(
    "naturalWidth",
    815,
  );
  await expect(page.locator(".italy-flag")).toHaveJSProperty("complete", true);
  expect(
    await page
      .locator(".italy-flag")
      .evaluate((e) => (e as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/ui/about-support.png",
    fullPage: true,
  });
  await page
    .locator(".qr-window")
    .screenshot({
      animations: "disabled",
      path: "test-results/ui/donation-qr.png",
    });
  await expect(
    page.getByText("by Lorenzo Gresio", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("img", { name: "PayPal donation QR code" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Behavior", exact: true }).click();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Support WebScaly" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(externalRequests).toEqual([]);
  await page.close();
});

test("settings remain usable on small screens and with reduced motion", async () => {
  const page = await options();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const section of [
    "Enhancement",
    "Websites",
    "Presets",
    "Behavior",
    "Diagnostics",
    "Getting started",
    "About",
  ]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".page")
        .evaluate((e) => getComputedStyle(e).animationName),
    ).toBe("none");
  }
  await page.getByRole("button", { name: "Support WebScaly" }).click();
  await expect(
    page.getByRole("img", { name: "PayPal donation QR code" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/ui/about-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
test("late open shadow roots and inherited-origin frames are discovered and revoked", async () => {
  await configure({ ...DEFAULTS, controls: true, comparison: true });
  const page = await fixture();
  await expect(page.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.evaluate(() => {
    const host = document.createElement("fixture-player");
    host.id = "shadow-host";
    document.body.prepend(host);
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const source = document.querySelector("video")!,
      copy = source.cloneNode(true) as HTMLVideoElement;
    copy.style.cssText = "width:640px;height:360px;display:block";
    copy.srcObject = source.srcObject;
    document
      .querySelector("#shadow-host")!
      .attachShadow({ mode: "open" })
      .append(copy);
    void copy.play();
    source.remove();
  });
  await expect(page.locator("#shadow-host webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.dataset.player = "inherited";
    frame.srcdoc = "<!doctype html><html><body></body></html>";
    frame.style.cssText = "width:900px;height:600px";
    document.body.prepend(frame);
  });
  const frame = page.frameLocator('iframe[data-player="inherited"]');
  await expect(frame.locator("body")).toBeAttached();
  await expect
    .poll(() => page.frames().some((f) => f.url() === "about:srcdoc"))
    .toBe(true);
  await page.evaluate(() => {
    const source = document
      .querySelector("#shadow-host")!
      .shadowRoot!.querySelector("video")!;
    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[data-player="inherited"]',
    )!;
    const copy = source.cloneNode(true) as HTMLVideoElement;
    copy.srcObject = source.srcObject;
    frame.contentDocument!.body.append(copy);
    void copy.play();
  });
  await expect(frame.locator("webscaly-player")).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(
    frame
      .frameLocator('iframe[title="WebScaly video controls"]')
      .getByRole("button", { name: "HUD", exact: true }),
  ).toBeVisible();
  await frame
    .frameLocator('iframe[title="WebScaly video controls"]')
    .getByRole("button", { name: "HUD", exact: true })
    .click();
  await expect(frame.locator("webscaly-player output")).toBeVisible();
  const settings = await options();
  await settings.evaluate(
    (origin) => chrome.runtime.sendMessage({ type: "webscaly:remove", origin }),
    origin,
  );
  await expect(frame.locator("webscaly-player")).toHaveCount(0);
  await expect(page.locator("#shadow-host webscaly-player")).toHaveCount(0);
  await settings.close();
  await page.close();
});
test("approved and embedded-access popup states fit, and full errors remain available in settings", async () => {
  await configure();
  const source = await fixture();
  await source.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "http://localhost:5173/tests/browser/fixture.html";
    frame.style.cssText = "width:900px;height:600px";
    document.body.append(frame);
  });
  const tabId = await worker.evaluate(
    async (url) =>
      (await chrome.tabs.query({})).find((t) => t.url === url)!.id!,
    source.url(),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
  await expect(
    page.getByRole("button", { name: "Allow localhost", exact: true }),
  ).toBeVisible();
  const fits = async () => {
    const size = await page.locator("main.popup").evaluate((e) => ({
      width: e.getBoundingClientRect().width,
      height: e.getBoundingClientRect().height,
      scroll: e.scrollHeight > e.clientHeight,
    }));
    expect(size.width).toBe(360);
    expect(size.height).toBeLessThanOrEqual(600);
    expect(size.scroll).toBe(false);
  };
  await fits();
  await expect(
    page.getByRole("switch", { name: "Enhancement", exact: true }),
  ).toBeChecked();
  await page
    .locator("main.popup")
    .screenshot({
      animations: "disabled",
      path: "test-results/ui/popup-approved-embed.png",
    });
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = ((m: any, ...args: any[]) =>
      m.type === "webscaly:remove"
        ? Promise.resolve({
            ok: false,
            error:
              "Action could not be completed. " +
              "Diagnostic detail. ".repeat(30),
          })
        : Reflect.apply(original, chrome.runtime, [
            m,
            ...args,
          ])) as typeof original;
  });
  await page
    .getByRole("button", { name: "Remove website access", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Settings → Diagnostics");
  await fits();
  await page.goto(`chrome-extension://${id}/options.html?tab=${tabId}`);
  await page.getByRole("button", { name: "Diagnostics", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Last action error" }),
  ).toBeVisible();
  await expect(page.locator("pre").first()).toContainText("Diagnostic detail.");
  await page.getByRole("button", { name: "Clear error", exact: true }).click();
  await page.close();
  await source.close();
});
test("imports grant no access and isolated UI frames cannot manage website permissions", async () => {
  const page = await options();
  const incoming = {
    ...EMPTY,
    sites: [
      { origin: "https://example.com", subdomains: false, settings: DEFAULTS },
    ],
  };
  expect(
    (
      await page.evaluate(
        (c) =>
          chrome.runtime.sendMessage({ type: "webscaly:import", config: c }),
        incoming,
      )
    ).ok,
  ).toBe(true);
  expect(
    await worker.evaluate(() =>
      chrome.permissions.contains({ origins: ["https://example.com/*"] }),
    ),
  ).toBe(false);
  await page.goto(`chrome-extension://${id}/ui-frame.html`);
  const rejected = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "webscaly:approve",
      origin: "https://example.com",
    }),
  );
  expect(rejected.ok).toBe(false);
  await page.close();
});
test("sharp sources are skipped, and global pause clears and restores processing", async () => {
  await configure({ ...DEFAULTS, skipAbove: 720 });
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => window.fixture.create(30, 1920));
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "skipped");
  await configure();
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  const tabId = await worker.evaluate(
    async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.id!,
    page.url(),
  );
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe("ON");
  await worker.evaluate(async () => {
    const { webscalyConfig: c } = (await chrome.storage.local.get("webscalyConfig")) as any;
    await chrome.storage.local.set({
      webscalyConfig: { ...c, preferences: { ...c.preferences, paused: true } },
    });
  });
  await expect(page.locator("webscaly-player")).toHaveCount(0);
  expect(await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe("II");
  await configure();
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  await page.close();
});
test("the toolbar saves an enhanced snapshot without touching playback", async () => {
  await configure({ ...DEFAULTS, controls: true });
  const page = await fixture();
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  await page.locator("video").hover();
  const download = page.waitForEvent("download");
  await page
    .frameLocator('iframe[title="WebScaly video controls"]')
    .getByRole("button", { name: "Save snapshot", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^webscaly-127\.0\.0\.1-.+\.png$/);
  const png = await sharp(await file.path()).metadata();
  expect(png.format).toBe("png");
  expect(png.width).toBeGreaterThanOrEqual(640);
  expect(await page.locator("video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.close();
});

test("plain http:// websites get the overlay and the WebGL fallback", async () => {
  // Generated footage on a page that is not a secure context: no WebGPU and
  // no crypto.randomUUID.
  const page_ = `<!doctype html><video muted playsinline width="640" height="360"></video><script>
    const c = document.createElement("canvas"); c.width = 640; c.height = 360;
    const g = c.getContext("2d"); let i = 0;
    setInterval(() => { g.fillStyle = "#234"; g.fillRect(0, 0, 640, 360); g.fillStyle = "#9cf"; g.fillRect((i += 6) % 600, 120, 40, 120); }, 33);
    const v = document.querySelector("video"); v.srcObject = c.captureStream(30); v.play();
  </script>`;
  const server = createServer((_, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(page_);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const plain = `http://plain.webscaly.test:${(server.address() as AddressInfo).port}`;
  try {
    await worker.evaluate(async (c) => chrome.storage.local.set({ webscalyConfig: c }), {
      ...EMPTY,
      sites: [{ origin: plain, subdomains: false, settings: { ...DEFAULTS, controls: true } }],
    });
    const page = await context.newPage();
    await page.goto(plain + "/");
    expect(await page.evaluate(() => isSecureContext)).toBe(false);
    const player = page.locator("webscaly-player");
    await expect(player).toHaveAttribute("data-state", "active");
    await expect(player).toHaveAttribute("data-backend", /WebGL/);
    await expect
      .poll(() =>
        page
          .locator('iframe[title="WebScaly video controls"]')
          .evaluate((f: HTMLIFrameElement) => f.offsetWidth),
      )
      .toBeGreaterThan(100);
    await page.close();
  } finally {
    server.close();
  }
});

test("seeking and buffering keep the same renderer", async () => {
  await configure({ ...DEFAULTS, comparison: true });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator("video").evaluate(async (v: HTMLVideoElement) => {
    v.src = "/test-results/media/progressive.mp4";
    await v.play();
    v.pause();
  });
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  const replaced = await page.locator("video").evaluate(async (v: HTMLVideoElement) => {
    const first = document.querySelector("webscaly-player");
    let count = 0;
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => {
        v.addEventListener("seeked", r, { once: true });
        v.currentTime = ((i * 37) % 170) / 30 + 1 / 60;
      });
      await new Promise((r) => requestAnimationFrame(r));
      if (document.querySelector("webscaly-player") !== first) count++;
    }
    return count;
  });
  expect(replaced).toBe(0);
  await expect(page.locator("webscaly-player")).toHaveAttribute("data-state", "active");
  await page.close();
});
