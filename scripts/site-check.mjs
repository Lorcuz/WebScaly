// Anonymous, bounded live checks. Reports stay private; media URLs and footage are never exported.
import { resolve } from "node:path";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const { chromium } = await import("@playwright/test");
const sites = [
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://www.twitch.tv",
  "https://player.twitch.tv",
  "https://www.dailymotion.com",
  "https://geo.dailymotion.com",
  "https://www.animeworld.ac",
  "https://www.animeunity.so",
  "https://vixcloud.co",
];
const cases = [
  ["YouTube", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
  ["Vimeo", "https://player.vimeo.com/video/76979871"],
  ["Twitch", "https://www.twitch.tv/twitchdev"],
  [
    "Dailymotion",
    "https://geo.dailymotion.com/player/x8lr5.html?video=x84sh87&mute=true",
  ],
  [
    "AnimeWorld",
    "https://www.animeworld.ac/play/the-exiled-heavy-knight-knows-how-to-game-the-system.3eEys/vSMeeE2jQ3",
  ],
  [
    "AnimeUnity / Vixcloud",
    "https://www.animeunity.so/anime/7534-snowball-earth-ita/110532",
  ],
];
const directory = resolve("test-results/site-extension");
await mkdir(directory, { recursive: true });
await cp("dist", directory, { recursive: true });
const manifest = JSON.parse(
  await readFile(resolve(directory, "manifest.json"), "utf8"),
);
manifest.host_permissions = sites.map((o) => `${o}/*`);
await writeFile(resolve(directory, "manifest.json"), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(
  await mkdtemp(resolve("test-results/site-profile-")),
  {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${directory}`,
      `--load-extension=${directory}`,
    ],
  },
);
const report = {
  version: "0.4.0",
  anonymous: true,
  testOnlyGrants: true,
  cases: [],
};
const safe = (text) =>
  String(text)
    .replace(/(?:https?|blob|chrome-extension):\/\/[^\s"'<>]+/g, "[resource]")
    .slice(0, 400);
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const defaults = {
    enabled: true,
    algorithm: "spatial",
    quality: "balanced",
    scale: "auto",
    maxHeight: 1080,
    strength: 0.35,
    denoise: 0.12,
    hud: false,
    comparison: false,
    split: 0.5,
    controls: false,
  };
  await worker.evaluate(
    (config) => chrome.storage.local.set({ webscalyConfig: config }),
    {
      version: 2,
      defaults,
      sites: sites.map((origin) => ({
        origin,
        subdomains: false,
        settings: defaults,
      })),
      presets: [],
    },
  );
  for (const [name, url] of cases) {
    const page = await context.newPage(),
      item = {
        name,
        origin: new URL(url).origin,
        outcome: "unverified",
        frames: [],
        controls: "unverified",
        note: "",
      };
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.bringToFront();
      const reject = page.getByRole("button", {
        name: /^Reject all$|^Rifiuta tutto$/,
      });
      if (await reject.count())
        await reject
          .first()
          .click({ timeout: 2000 })
          .catch(() => {});
      await page.waitForTimeout(3000);
      for (const frame of page.frames()) {
        let allowed = false;
        try {
          allowed = sites.includes(new URL(frame.url()).origin);
        } catch {}
        if (!allowed) continue;
        const video = frame.locator("video").first();
        if (await video.count()) {
          await video.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          await video
            .evaluate((v) => {
              v.muted = true;
              void v.play().catch(() => {});
            })
            .catch(() => {});
        } else {
          const play = frame.getByRole("button", {
            name: /^Play$|^Riproduci$|^Play \(k\)$/,
          });
          if (await play.count())
            await play
              .first()
              .click({ timeout: 2000 })
              .catch(() => {});
        }
      }
      await page.waitForTimeout(5000);
      const tabId = await worker.evaluate(
        async (target) =>
          (await chrome.tabs.query({})).find((t) => t.url === target)?.id,
        page.url(),
      );
      const panel = await context.newPage();
      await panel.goto(
        `chrome-extension://${id}/options.html?tab=${tabId ?? 0}`,
      );
      const status = await panel.evaluate(async (tabId) => {
        const reply = await chrome.runtime.sendMessage({
          type: "webscaly:tab-status",
          tabId,
        });
        return reply.value;
      }, tabId);
      item.diagnostics = status;
      for (const renderer of item.diagnostics?.renderers ?? [])
        renderer.message = safe(renderer.message);
      for (const frame of page.frames()) {
        let allowed = false;
        try {
          allowed = sites.includes(new URL(frame.url()).origin);
        } catch {}
        if (!allowed) continue;
        item.frames.push(
          await frame
            .evaluate(() => ({
              origin: location.origin,
              videos: [...document.querySelectorAll("video")].map((v) => ({
                ready: v.readyState,
                width: v.videoWidth,
                height: v.videoHeight,
                paused: v.paused,
                time: v.currentTime,
                error: v.error?.code ?? null,
                protected: !!v.mediaKeys,
              })),
            }))
            .catch(() => ({ origin: "inaccessible" })),
        );
      }
      const active = status?.renderers.find(
          (r) => r.state === "active" && r.outputFps > 5,
        ),
        blocked = status?.renderers.find((r) => r.state === "unavailable");
      item.outcome = active
        ? "direct enhancement"
        : blocked
          ? "blocked"
          : "unverified";
      item.note = active
        ? `${active.backend} native-rate output observed.`
        : blocked
          ? safe(blocked.message)
          : "No sustained decoded playback was available in the anonymous test.";
      if (status?.renderers.some((r) => r.state === "active")) {
        await worker.evaluate(async () => {
          const c = (await chrome.storage.local.get("webscalyConfig"))
            .webscalyConfig;
          for (const s of c.sites)
            s.settings = { ...s.settings, controls: true, comparison: true };
          await chrome.storage.local.set({ webscalyConfig: c });
        });
        await page.bringToFront();
        await page.waitForTimeout(600);
        for (const frame of page.frames())
          if (
            await frame
              .locator('iframe[title="WebScaly video controls"]')
              .count()
          ) {
            const before = await frame
              .locator("video")
              .first()
              .evaluate((v) => v.paused);
            await frame.evaluate(() => {
              window.webscalyNativeEvents = 0;
              for (const name of ["pointerdown", "click", "keydown"])
                document.addEventListener(
                  name,
                  () => window.webscalyNativeEvents++,
                  true,
                );
            });
            const controls = frame.frameLocator(
                'iframe[title="WebScaly video controls"]',
              ),
              slider = frame
                .frameLocator('iframe[title="WebScaly comparison"]')
                .getByRole("slider");
            await controls
              .getByRole("button", { name: "HUD", exact: true })
              .click({ timeout: 3000 });
            const box = await slider.boundingBox({ timeout: 3000 });
            if (box) {
              await page.mouse.move(
                box.x + box.width * 0.8,
                box.y + box.height / 2,
              );
              await page.mouse.down();
              await page.mouse.move(
                box.x + box.width * 0.3,
                box.y + box.height / 2,
                { steps: 8 },
              );
              await page.mouse.up();
            }
            const kept = await frame
                .locator("webscaly-player")
                .getAttribute("data-state"),
              after = await frame
                .locator("video")
                .first()
                .evaluate((v) => v.paused),
              events = await frame.evaluate(() => window.webscalyNativeEvents);
            item.controls =
              kept === "active" &&
              (await slider.isVisible()) &&
              before === after &&
              events === 0
                ? "toolbar and drag passed"
                : "unverified";
            if (
              name === "AnimeUnity / Vixcloud" &&
              (await frame.locator(".jwplayer").count())
            ) {
              await frame
                .locator("video")
                .first()
                .evaluate((v) => v.pause());
              await frame.locator(".jwplayer").hover();
              await frame
                .locator(".jwplayer")
                .screenshot({ path: "test-results/vixcloud-controls.png" });
              item.nativeLayers = await frame
                .locator("video")
                .first()
                .evaluate((v) => ({
                  video: getComputedStyle(v).zIndex,
                  enhancement: getComputedStyle(
                    v.parentElement.querySelector("webscaly-player"),
                  ).zIndex,
                  controls: getComputedStyle(
                    document.querySelector(".jw-controls"),
                  ).zIndex,
                }));
            }
            break;
          }
      }
      await panel.close();
    } catch (error) {
      item.note = safe(error.message);
    }
    report.cases.push(item);
    await writeFile(
      "test-results/live-sites.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        name: item.name,
        outcome: item.outcome,
        controls: item.controls,
        note: item.note,
      }),
    );
    await page.close();
  }
} finally {
  await context.close();
}
