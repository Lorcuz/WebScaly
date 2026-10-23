import { beforeEach, it, expect, vi } from "vitest";
import {
  DEFAULTS,
  EMPTY,
  normalizeConfiguration,
} from "../../src/shared/settings";
import { permissionCovers } from "../../src/shared/permissions";
let listener: any,
  local: Record<string, any>,
  session: Record<string, any>,
  scopes: Set<string>,
  allow: (v: boolean) => void,
  gesture: boolean,
  requestGesture: boolean,
  requests: number,
  messages: { tabId: number; message: any; options?: any }[],
  frameWrites: number,
  status: any;
const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
async function setup(pending: Record<string, unknown> = {}) {
  vi.resetModules();
  local = { webscalyConfig: structuredClone(EMPTY) };
  session = { webscalyApprovalIntents: pending };
  scopes = new Set();
  gesture = false;
  requestGesture = false;
  requests = 0;
  messages = [];
  frameWrites = 0;
  status = {};
  const area = (state: Record<string, any>) => ({
    get: async (key: string) => ({ [key]: structuredClone(state[key]) }),
    set: async (v: object) => {
      if ("webscalyFrames" in v) frameWrites++;
      Object.assign(state, structuredClone(v));
    },
  });
  (globalThis as any).chrome = {
    runtime: {
      id: "test",
      getURL: (p: string) => "chrome-extension://test/" + p,
      onMessage: {
        addListener: (fn: any) => {
          listener = fn;
        },
      },
      onInstalled: event(),
      onStartup: event(),
    },
    storage: { local: area(local), session: area(session), onChanged: event() },
    permissions: {
      request: () => {
        requests++;
        requestGesture = gesture;
        return new Promise<boolean>((resolve) => {
          allow = (value) => {
            if (value) scopes.add("https://example.com/*");
            resolve(value);
          };
        });
      },
      contains: async ({ origins }: any) =>
        origins.every((o: string) => scopes.has(o)),
      getAll: async () => ({ origins: [...scopes] }),
      remove: async ({ origins }: any) => {
        origins.forEach((o: string) => scopes.delete(o));
        return true;
      },
      onAdded: event(),
      onRemoved: event(),
    },
    tabs: {
      query: async () => [],
      get: async () => ({ url: "https://parent.test" }),
      sendMessage: async (tabId: number, message: any, options?: any) => {
        messages.push({ tabId, message, options });
        return message.type === "webscaly:status" ? status : {};
      },
      onRemoved: event(),
      onUpdated: event(),
      create: vi.fn(async () => ({})),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setBadgeTextColor: vi.fn(async () => {}),
    },
    commands: { onCommand: event() },
    scripting: {
      getRegisteredContentScripts: async () => [],
      unregisterContentScripts: async () => {},
      registerContentScripts: vi.fn(async () => {}),
      executeScript: async () => [],
    },
  };
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
}
function send(
  message: object,
  sender: any = { id: "test", url: "chrome-extension://test/popup.html" },
) {
  return new Promise<any>((resolve) => listener(message, sender, resolve));
}
beforeEach(() => setup());
it("starts the worker permission request in the gesture turn and completes without a popup", async () => {
  gesture = true;
  const result = send({
    type: "webscaly:approve",
    origin: "https://example.com",
    settings: DEFAULTS,
  });
  gesture = false;
  expect(requestGesture).toBe(true);
  allow(true);
  expect((await result).ok).toBe(true);
  expect(local.webscalyConfig.sites).toHaveLength(1);
  expect(session.webscalyApprovalIntents).toEqual({});
});
it("denial adds no website and concurrent duplicates request only once", async () => {
  gesture = true;
  const a = send({ type: "webscaly:approve", origin: "https://example.com" }),
    b = send({ type: "webscaly:approve", origin: "https://example.com" });
  gesture = false;
  expect(requests).toBe(1);
  allow(false);
  expect((await a).ok).toBe(false);
  expect((await b).ok).toBe(false);
  expect(local.webscalyConfig.sites).toEqual([]);
});
it("recovers a granted pending approval after a new worker instance", async () => {
  const intent = {
    id: "pending",
    origin: "https://example.com",
    subdomains: false,
    settings: DEFAULTS,
    created: Date.now(),
  };
  session.webscalyApprovalIntents = { pending: intent };
  scopes.add("https://example.com/*");
  // Recovery is also invoked on installation/startup/permission events; reimport models worker restart.
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(local.webscalyConfig.sites.map((s: any) => s.origin)).toEqual([
    "https://example.com",
  ]);
  expect(session.webscalyApprovalIntents).toEqual({});
});
it("ungranted recovered intents never authorize a site", async () => {
  session.webscalyApprovalIntents = {
    pending: {
      id: "pending",
      origin: "https://example.com",
      subdomains: false,
      settings: DEFAULTS,
      created: Date.now(),
    },
  };
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(local.webscalyConfig.sites).toEqual([]);
});
it("retains an unresolved prompt across restarts and finishes after its late grant", async () => {
  session.webscalyApprovalIntents = {
    pending: {
      id: "pending",
      origin: "https://example.com",
      subdomains: false,
      settings: DEFAULTS,
      created: Date.now(),
    },
  };
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(local.webscalyConfig.sites).toEqual([]);
  expect(session.webscalyApprovalIntents.pending).toBeDefined();
  scopes.add("https://example.com/*");
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(local.webscalyConfig.sites).toHaveLength(1);
  expect(session.webscalyApprovalIntents).toEqual({});
});
it("keeps cancellation across restarts so a late Allow is revoked", async () => {
  session.webscalyApprovalIntents = {
    pending: {
      id: "pending",
      origin: "https://example.com",
      subdomains: false,
      settings: DEFAULTS,
      created: Date.now(),
      cancelled: true,
    },
  };
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(session.webscalyApprovalIntents.pending).toBeDefined();
  scopes.add("https://example.com/*");
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  expect(local.webscalyConfig.sites).toEqual([]);
  expect(scopes.size).toBe(0);
  expect(session.webscalyApprovalIntents).toEqual({});
});
it("removal wins over a pending approval callback", async () => {
  const approval = send({
    type: "webscaly:approve",
    origin: "https://example.com",
  });
  await send({ type: "webscaly:remove", origin: "https://example.com" });
  allow(true);
  await approval;
  expect(local.webscalyConfig.sites).toEqual([]);
  expect(scopes.size).toBe(0);
  expect(session.webscalyApprovalIntents).toEqual({});
});
it("requires both the parent and the embedded origin to remain approved", async () => {
  local.webscalyConfig = {
    ...EMPTY,
    sites: [
      { origin: "https://parent.test", subdomains: false, settings: DEFAULTS },
      { origin: "https://player.test", subdomains: false, settings: DEFAULTS },
    ],
  };
  scopes.add("https://parent.test/*");
  scopes.add("https://player.test/*");
  const sender = {
    id: "test",
    url: "https://player.test/video",
    tab: { id: 4 },
    frameId: 2,
  };
  expect(
    (await send({ type: "webscaly:authorized" }, sender)).value.origin,
  ).toBe("https://player.test");
  await send({ type: "webscaly:remove", origin: "https://parent.test" });
  expect((await send({ type: "webscaly:authorized" }, sender)).value).toBe(
    null,
  );
  expect(scopes.has("https://player.test/*")).toBe(true);
});
it("removes overlapping exact and subdomain approvals and prevents UI frames from approving", async () => {
  local.webscalyConfig = {
    ...EMPTY,
    sites: [
      { origin: "https://example.com", subdomains: true, settings: DEFAULTS },
      {
        origin: "https://a.example.com",
        subdomains: false,
        settings: DEFAULTS,
      },
    ],
  };
  scopes.add("https://*.example.com/*");
  scopes.add("https://a.example.com/*");
  await send({ type: "webscaly:remove", origin: "https://a.example.com" });
  expect(local.webscalyConfig.sites).toEqual([]);
  expect(scopes.size).toBe(0);
  expect(
    (
      await send(
        { type: "webscaly:approve", origin: "https://example.com" },
        { id: "test", url: "chrome-extension://test/ui-frame.html" },
      )
    ).ok,
  ).toBe(false);
  expect(requests).toBe(0);
});
it("migrates version one only once, keeps enhancements and strips retired fields", () => {
  const old = {
    ...DEFAULTS,
    controls: true,
    hud: true,
    comparison: true,
    algorithm: "anime4k",
    strength: 0.8,
    targetFps: 120,
    interpolation: "2x",
  };
  const c = normalizeConfiguration({
    version: 1,
    defaults: old,
    sites: [{ origin: "https://example.com", settings: old }],
    presets: [{ name: "Old", settings: old }],
  });
  for (const s of [c.defaults, c.sites[0].settings, c.presets[0].settings]) {
    expect(s.algorithm).toBe("anime4k");
    expect(s.strength).toBe(0.8);
    expect(s.controls || s.hud || s.comparison).toBe(false);
    expect(s).not.toHaveProperty("interpolation");
    expect(s).not.toHaveProperty("targetFps");
  }
  c.defaults.controls = true;
  expect(normalizeConfiguration(c).defaults.controls).toBe(true);
  expect(c.version).toBe(2);
});
it("scope matching does not revoke unrelated hosts or HTTPS grants for HTTP", () => {
  expect(
    permissionCovers("https://*.example.com/*", "https://a.example.com"),
  ).toBe(true);
  expect(
    permissionCovers("https://*.example.com/*", "https://badexample.com"),
  ).toBe(false);
  expect(permissionCovers("https://example.com/*", "http://example.com")).toBe(
    false,
  );
});
it("authorizes inherited-origin frames while rejecting opaque sandbox origins", async () => {
  local.webscalyConfig = {
    ...EMPTY,
    sites: [
      { origin: "https://parent.test", subdomains: false, settings: DEFAULTS },
    ],
  };
  scopes.add("https://parent.test/*");
  const sender = {
    id: "test",
    url: "about:blank",
    origin: "https://parent.test",
    tab: { id: 4 },
    frameId: 2,
  };
  expect(
    (await send({ type: "webscaly:authorized" }, sender)).value.origin,
  ).toBe("https://parent.test");
  expect(
    (await send({ type: "webscaly:authorized" }, { ...sender, origin: "null" }))
      .value,
  ).toBe(null);
});

const content = (origin = "https://example.com", tab = 4, frameId = 0) => ({
  id: "test",
  url: origin + "/watch",
  tab: { id: tab },
  frameId,
});
function approved(...origins: string[]) {
  local.webscalyConfig = {
    ...EMPTY,
    sites: origins.map((origin) => ({ origin, subdomains: false, settings: DEFAULTS })),
  };
  for (const origin of origins) scopes.add(origin + "/*");
}
it("settings-only edits neither re-register scripts nor broadcast to every tab", async () => {
  approved("https://example.com");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [{ id: 1, url: "https://example.com/" }];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  const registrations = chrome.scripting.registerContentScripts.mock.calls.length;
  messages = [];
  for (const strength of [0.2, 0.3, 0.4])
    await send({ type: "webscaly:site", origin: "https://example.com", patch: { strength } });
  expect(local.webscalyConfig.sites[0].settings.strength).toBe(0.4);
  expect(messages).toEqual([]);
  expect(chrome.scripting.registerContentScripts.mock.calls.length).toBe(registrations);
  await send({ type: "webscaly:remove", origin: "https://example.com" });
  expect(messages.map((m) => m.message.type)).toContain("webscaly:invalidate");
});
it("authorization reports preferences and writes the frame registry only when it changes", async () => {
  approved("https://example.com");
  local.webscalyConfig.preferences = { paused: true, batterySaver: false, welcomed: true };
  (globalThis as any).chrome.tabs.get = async () => ({ url: "https://example.com/watch" });
  const first = await send({ type: "webscaly:authorized" }, content());
  expect(first.value.preferences.paused).toBe(true);
  await send({ type: "webscaly:authorized" }, content());
  await send({ type: "webscaly:authorized" }, content());
  expect(frameWrites).toBe(1);
});
it("imports merge by default and only a replace revokes missing sites", async () => {
  approved("https://keep.test");
  const file = {
    ...EMPTY,
    sites: [{ origin: "https://new.test", subdomains: false, settings: DEFAULTS }],
  };
  await send({ type: "webscaly:import", config: file });
  expect(local.webscalyConfig.sites.map((s: any) => s.origin)).toEqual([
    "https://keep.test",
    "https://new.test",
  ]);
  expect(scopes.has("https://keep.test/*")).toBe(true);
  await send({ type: "webscaly:import", config: file, mode: "replace" });
  expect(local.webscalyConfig.sites.map((s: any) => s.origin)).toEqual(["https://new.test"]);
  expect(scopes.has("https://keep.test/*")).toBe(false);
});
it("keyboard commands change only the profile rendering in the active tab", async () => {
  approved("https://example.com", "https://other.test");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.get = async () => ({ id: 7, url: "https://example.com/watch" });
  status = {
    origin: "https://example.com",
    videos: 1,
    renderers: [{ state: "active" }],
    embeds: [],
  };
  let result = await send({ type: "webscaly:command", command: "toggle-enhancement", tabId: 7 });
  expect(result.ok).toBe(true);
  expect(local.webscalyConfig.sites[0].settings.enabled).toBe(false);
  expect(local.webscalyConfig.sites[1].settings.enabled).toBe(true);
  await send({ type: "webscaly:command", command: "cycle-engine", tabId: 7 });
  expect(local.webscalyConfig.sites[0].settings.algorithm).toBe("anime4k");
  expect(local.webscalyConfig.sites[0].settings.enabled).toBe(true);
  await send({ type: "webscaly:command", command: "toggle-pause", tabId: 7 });
  expect(local.webscalyConfig.preferences.paused).toBe(true);
  result = await send({ type: "webscaly:command", command: "format-disk", tabId: 7 });
  expect(result.ok).toBe(false);
  expect(
    (await send({ type: "webscaly:command", command: "toggle-pause", tabId: 7 }, content())).ok,
  ).toBe(false);
});
it("combines frame reports into one per-tab toolbar badge", async () => {
  const chrome = (globalThis as any).chrome;
  await send({ type: "webscaly:report", state: "active" }, content("https://example.com", 3, 2));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "ON" });
  await send({ type: "webscaly:report", state: "unavailable" }, content("https://example.com", 3, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "ON" });
  await send({ type: "webscaly:report", state: "idle" }, content("https://example.com", 3, 2));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "!" });
  await send({ type: "webscaly:report", state: "bogus" }, content("https://example.com", 3, 0));
  await send({ type: "webscaly:report", state: "active" });
  expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(3);
});
it("stores preference patches from settings pages only", async () => {
  await send({ type: "webscaly:preferences", patch: { batterySaver: true, extra: 1 } });
  expect(local.webscalyConfig.preferences).toEqual({ language: "auto", paused: false, batterySaver: true, welcomed: false });
  expect(
    (await send({ type: "webscaly:preferences", patch: { paused: true } }, content())).ok,
  ).toBe(false);
});
