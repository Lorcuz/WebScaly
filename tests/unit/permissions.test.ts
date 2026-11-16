import { beforeEach, it, expect, vi } from "vitest";
import {
  DEFAULTS,
  EMPTY,
  normalizeConfiguration,
} from "../../src/shared/settings";
import { invalidates, permissionCovers } from "../../src/shared/permissions";
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

/** Whether a message the worker sent would stop a frame of `origin` (same rule as the content script). */
const stopsFrame = (message: any, origin: string) =>
  message?.type === "webscaly:invalidate" && invalidates(message, origin);
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
it("a merge import keeps the current Default profile when the file carries none", async () => {
  approved("https://keep.test");
  local.webscalyConfig.defaults = { ...DEFAULTS, strength: 0.77 };
  await send({
    type: "webscaly:import",
    config: { version: 2, sites: [{ origin: "https://new.test", subdomains: false, settings: DEFAULTS }] },
  });
  expect(local.webscalyConfig.defaults.strength).toBe(0.77);
  await send({
    type: "webscaly:import",
    config: { version: 2, defaults: { ...DEFAULTS, strength: 0.5 }, sites: [] },
  });
  expect(local.webscalyConfig.defaults.strength).toBe(0.5);
});
it("a merge import cannot widen an approved website to a scope Chrome has not granted", async () => {
  approved("https://keep.test");
  await send({
    type: "webscaly:import",
    config: { ...EMPTY, sites: [{ origin: "https://keep.test", subdomains: true, settings: { ...DEFAULTS, strength: 0.9 } }] },
  });
  const site = local.webscalyConfig.sites.find((s: any) => s.origin === "https://keep.test");
  expect(site.settings.strength).toBe(0.9);
  expect(site.subdomains).toBe(false);
  expect(scopes.has("https://keep.test/*")).toBe(true);
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
  expect(local.webscalyConfig.preferences).toEqual({ paused: false, batterySaver: true, welcomed: false });
  expect(
    (await send({ type: "webscaly:preferences", patch: { paused: true } }, content())).ok,
  ).toBe(false);
});
it("a replace import of the same websites switches approved tabs back on after invalidating them", async () => {
  approved("https://example.com");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [{ id: 1, url: "https://example.com/" }];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  messages = [];
  await send({
    type: "webscaly:import",
    config: { ...EMPTY, sites: [{ origin: "https://example.com", subdomains: false, settings: DEFAULTS }] },
    mode: "replace",
  });
  const tab = messages.filter((m) => m.tabId === 1),
    stops = tab.filter((m) => stopsFrame(m.message, "https://example.com"));
  // 0.5.1 (W2): the website is kept, so its tab is never stopped; if it were, a refresh must follow.
  expect(stops).toEqual([]);
  const types = tab.map((m) => m.message.type);
  if (types.includes("webscaly:invalidate"))
    expect(types.lastIndexOf("webscaly:refresh")).toBeGreaterThan(types.indexOf("webscaly:invalidate"));
  expect(scopes.has("https://example.com/*")).toBe(true);
});
it("removing a website that is already gone still leaves other approved tabs enhancing", async () => {
  approved("https://example.com");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [{ id: 1, url: "https://example.com/" }];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  messages = [];
  await send({ type: "webscaly:remove", origin: "https://gone.test" });
  const tab = messages.filter((m) => m.tabId === 1);
  // 0.5.1 (W2): nothing covering example.com was removed, so its tab is never stopped.
  expect(tab.filter((m) => stopsFrame(m.message, "https://example.com"))).toEqual([]);
  const types = tab.map((m) => m.message.type);
  if (types.includes("webscaly:invalidate"))
    expect(types.lastIndexOf("webscaly:refresh")).toBeGreaterThan(types.indexOf("webscaly:invalidate"));
});
it("a restarted worker does not re-broadcast when approvals are unchanged", async () => {
  approved("https://example.com");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [{ id: 1, url: "https://example.com/" }];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  expect(session.webscalyReconciled).toBeTruthy();
  // Simulate the MV3 worker being stopped and started again: module state is lost, session storage is kept.
  messages = [];
  vi.resetModules();
  await import("../../src/extension/background");
  await send({ type: "webscaly:read" });
  await new Promise((r) => setTimeout(r, 0));
  expect(messages.filter((m) => m.message.type === "webscaly:refresh")).toEqual([]);
});
it("a replace import that widens a kept website's scope keeps the grant it already has", async () => {
  approved("https://example.com");
  await send({
    type: "webscaly:import",
    config: { ...EMPTY, sites: [{ origin: "https://example.com", subdomains: true, settings: DEFAULTS }] },
    mode: "replace",
  });
  expect(scopes.has("https://example.com/*")).toBe(true);
  const site = local.webscalyConfig.sites.find((s: any) => s.origin === "https://example.com");
  expect(site.subdomains).toBe(false);
});

// ---- 0.5.1 hardening: W2 (scoped invalidation), W7 (frame registry races), C10 (badge across restarts)
it("removing one website stops only its own tabs and frames, once, and leaves other websites enhancing", async () => {
  approved("https://example.com", "https://other.test", "https://player.test");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [
    { id: 1, url: "https://example.com/watch" },
    { id: 2, url: "https://other.test/" },
    { id: 3, url: "https://other.test/embeds" },
  ];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  messages = [];
  await send({ type: "webscaly:remove", origin: "https://example.com" });
  // Grant revocation by the worker itself also reaches onRemoved, which Chrome reports with the patterns.
  for (const [fn] of chrome.permissions.onRemoved.addListener.mock.calls) fn({ origins: ["https://example.com/*"] });
  await send({ type: "webscaly:ping" });
  await new Promise((r) => setTimeout(r, 0));
  const stops = (tabId: number, origin: string) =>
    messages.filter((m) => m.tabId === tabId && stopsFrame(m.message, origin)).length;
  expect(stops(1, "https://example.com")).toBeGreaterThan(0); // the removed website's tab
  expect(stops(1, "https://player.test")).toBeGreaterThan(0); // an embedded player inside that page
  expect(stops(2, "https://other.test")).toBe(0); // an unrelated tab
  expect(stops(3, "https://other.test")).toBe(0);
  expect(stops(3, "https://player.test")).toBe(0); // the same player embedded in an unrelated page
  expect(stops(3, "https://example.com")).toBeGreaterThan(0); // a frame of the removed website elsewhere
  expect(scopes.has("https://example.com/*")).toBe(false);
  expect(scopes.has("https://other.test/*")).toBe(true);
});
it("removing an exact website also stops frames that only an overlapping subdomain grant covered", async () => {
  local.webscalyConfig = {
    ...EMPTY,
    sites: [
      { origin: "https://example.com", subdomains: false, settings: DEFAULTS },
      { origin: "https://www.example.com", subdomains: true, settings: DEFAULTS },
    ],
  };
  scopes.add("https://example.com/*");
  scopes.add("https://*.www.example.com/*");
  const chrome = (globalThis as any).chrome;
  chrome.tabs.query = async () => [{ id: 1, url: "https://unrelated.test/" }];
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  messages = [];
  await send({ type: "webscaly:remove", origin: "https://www.example.com" });
  const scoped = messages.find((m) => m.message.type === "webscaly:invalidate")!.message;
  expect(invalidates(scoped, "https://www.example.com")).toBe(true);
  expect(invalidates(scoped, "https://a.www.example.com")).toBe(true);
  expect(invalidates(scoped, "https://example.com")).toBe(false);
  expect(invalidates(scoped, "https://unrelated.test")).toBe(false);
  expect(local.webscalyConfig.sites.map((s: any) => s.origin)).toEqual(["https://example.com"]);
});
it("an invalidation without a readable scope stops every frame (fails closed)", () => {
  expect(invalidates({}, "https://example.com")).toBe(true);
  expect(invalidates({ scopes: "https://example.com/*" }, "https://other.test")).toBe(true);
  expect(invalidates({ scopes: [], all: true }, "https://other.test")).toBe(true);
  expect(invalidates({ scopes: ["https://example.com/*"] }, "https://other.test")).toBe(false);
});
it("concurrent authorizations from many frames keep every frame in the registry", async () => {
  approved("https://example.com", "https://player.test");
  (globalThis as any).chrome.tabs.get = async () => ({ url: "https://example.com/watch" });
  const frames = Array.from({ length: 24 }, (_, i) => i);
  const answers = await Promise.all(
    frames.map((id) => send({ type: "webscaly:authorized" }, content(id % 2 ? "https://player.test" : "https://example.com", 9, id))),
  );
  expect(answers.every((a) => a.ok && a.value)).toBe(true);
  const registry = session.webscalyFrames[9];
  expect(Object.keys(registry).map(Number).sort((a, b) => a - b)).toEqual(frames);
  expect(registry[3]).toBe("https://player.test");
  // Navigation of a frame to another origin, racing with new frames, keeps the registry consistent.
  await Promise.all([
    send({ type: "webscaly:authorized" }, content("https://example.com", 9, 3)),
    ...[30, 31, 32].map((id) => send({ type: "webscaly:authorized" }, content("https://player.test", 9, id))),
  ]);
  expect(session.webscalyFrames[9][3]).toBe("https://example.com");
  expect(Object.keys(session.webscalyFrames[9])).toHaveLength(27);
  // Closing the tab removes it.
  for (const [fn] of (globalThis as any).chrome.tabs.onRemoved.addListener.mock.calls) fn(9);
  await send({ type: "webscaly:ping" });
  await new Promise((r) => setTimeout(r, 0));
  expect(session.webscalyFrames[9]).toBeUndefined();
});
it("a restarted worker keeps every frame's badge state and combines it with new reports", async () => {
  const chrome = (globalThis as any).chrome;
  await send({ type: "webscaly:report", state: "active" }, content("https://player.test", 3, 2));
  await send({ type: "webscaly:report", state: "unavailable" }, content("https://example.com", 3, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "ON" });
  // The MV3 worker stops and starts again: module memory is lost, session storage is kept.
  vi.resetModules();
  await import("../../src/extension/background");
  messages = [];
  // The main frame's renderer stops; the embedded player is still active.
  await send({ type: "webscaly:report", state: "idle" }, content("https://example.com", 3, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "ON" });
  await send({ type: "webscaly:report", state: "paused" }, content("https://player.test", 3, 2));
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 3, text: "II" });
  // No refresh broadcast was needed for this.
  expect(messages.filter((m) => m.message.type === "webscaly:refresh")).toEqual([]);
});
it("navigation starts a tab's badge over and asks its frames to report again; closing the tab forgets it", async () => {
  const chrome = (globalThis as any).chrome;
  await send({ type: "webscaly:report", state: "active" }, content("https://example.com", 5, 0));
  await send({ type: "webscaly:report", state: "active" }, content("https://example.com", 6, 0));
  await new Promise((r) => setTimeout(r, 0));
  messages = [];
  for (const [fn] of chrome.tabs.onUpdated.addListener.mock.calls) fn(5, { status: "loading" });
  await send({ type: "webscaly:ping" });
  await new Promise((r) => setTimeout(r, 0));
  expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 5, text: "" });
  expect(messages).toContainEqual({ tabId: 5, message: { type: "webscaly:resync" }, options: undefined });
  expect(session.webscalyBadges[5]).toBeUndefined();
  expect(session.webscalyBadges[6]).toEqual({ 0: "active" });
  for (const [fn] of chrome.tabs.onRemoved.addListener.mock.calls) fn(6);
  await send({ type: "webscaly:ping" });
  await new Promise((r) => setTimeout(r, 0));
  expect(session.webscalyBadges[6]).toBeUndefined();
});
// ---- 0.5.1 review fixes: invalidation fails closed where coverage cannot be decided
it("a revocation Chrome reports after the fact still stops players embedded in a page it can no longer read", async () => {
  approved("https://example.com", "https://player.test");
  const chrome = (globalThis as any).chrome;
  await send({ type: "webscaly:defaults", settings: DEFAULTS });
  // permissions.onRemoved runs after the revocation: without the "tabs" permission Chrome no longer
  // reports the URL of the page that just lost access.
  chrome.tabs.query = async () => [{ id: 1 }, { id: 2, url: "https://player.test/" }];
  messages = [];
  scopes.delete("https://example.com/*");
  for (const [fn] of chrome.permissions.onRemoved.addListener.mock.calls) fn({ origins: ["https://example.com/*"] });
  await send({ type: "webscaly:ping" });
  await new Promise((r) => setTimeout(r, 0));
  const stops = (tabId: number, origin: string) =>
    messages.filter((m) => m.tabId === tabId && stopsFrame(m.message, origin)).length;
  expect(stops(1, "https://example.com")).toBeGreaterThan(0);
  expect(stops(1, "https://player.test")).toBeGreaterThan(0); // the embed lost its approved parent page
  expect(stops(2, "https://player.test")).toBe(0); // the player's own approved tab keeps enhancing
});
it("revoked patterns that coverage cannot interpret stop every frame", () => {
  for (const pattern of ["<all_urls>", "https://example.com:8443/*", "file:///*", "*://*/*"])
    expect(invalidates({ scopes: [pattern] }, "https://other.test")).toBe(true);
  expect(invalidates({ scopes: [42] }, "https://other.test")).toBe(true);
  expect(invalidates({ scopes: ["https://*.example.com/*"] }, "https://a.example.com")).toBe(true);
  expect(invalidates({ scopes: ["https://*.example.com/*"] }, "https://notexample.com")).toBe(false);
  expect(invalidates({ scopes: ["http://example.com/*"] }, "https://example.com")).toBe(false);
});

it("a player frame that navigates while the tab is being asked keeps its registry entry", async () => {
  approved("https://parent.test", "https://player.test");
  const chrome = (globalThis as any).chrome;
  await send({ type: "webscaly:authorized" }, content("https://parent.test", 3, 0));
  await send({ type: "webscaly:authorized" }, content("https://player.test", 3, 2));
  expect(session.webscalyFrames[3]).toEqual({ 0: "https://parent.test", 2: "https://player.test" });
  const reply = chrome.tabs.sendMessage;
  chrome.tabs.sendMessage = async (tabId: number, message: any, options?: any) => {
    if (message.type === "webscaly:status" && options?.frameId === 2) {
      // Mid-navigation: the old document is gone and the new one authorizes (same origin, so nothing is written)
      // before its status listener can answer this request.
      await send({ type: "webscaly:authorized" }, content("https://player.test", 3, 2));
      throw new Error("Could not establish connection. Receiving end does not exist.");
    }
    return reply(tabId, message, options);
  };
  await send({ type: "webscaly:tab-status", tabId: 3 });
  expect(session.webscalyFrames[3]).toEqual({ 0: "https://parent.test", 2: "https://player.test" });
  // A frame that is really gone (no new authorization) is still forgotten.
  chrome.tabs.sendMessage = async (tabId: number, message: any, options?: any) => {
    if (message.type === "webscaly:status" && options?.frameId === 2) throw new Error("No frame with id 2.");
    return reply(tabId, message, options);
  };
  await send({ type: "webscaly:tab-status", tabId: 3 });
  expect(session.webscalyFrames[3]).toEqual({ 0: "https://parent.test" });
});
it("a failing session store never leaves an unhandled rejection in the worker", async () => {
  approved("https://parent.test");
  const chrome = (globalThis as any).chrome;
  // Tab 9 has a registered frame, so closing it must write the registry (and that write fails below).
  await send({ type: "webscaly:authorized" }, content("https://parent.test", 9, 0));
  expect(session.webscalyFrames[9]).toEqual({ 0: "https://parent.test" });
  const rejections: unknown[] = [];
  const onRejection = (e: unknown) => rejections.push(e);
  process.on("unhandledRejection", onRejection);
  try {
    chrome.storage.session.set = async () => {
      throw new Error("Session storage is unavailable.");
    };
    await send({ type: "webscaly:report", state: "active" }, content("https://example.com", 8, 0));
    await send({ type: "webscaly:report", state: "paused" }, content("https://example.com", 8, 1));
    await new Promise((r) => setTimeout(r, 0));
    // The badge still follows the frames' states held in memory.
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 8, text: "ON" });
    for (const [fn] of chrome.tabs.onUpdated.addListener.mock.calls) fn(8, { status: "loading" });
    await send({ type: "webscaly:report", state: "active" }, content("https://example.com", 9, 0));
    for (const [fn] of chrome.tabs.onRemoved.addListener.mock.calls) fn(9);
    await new Promise((r) => setTimeout(r, 30));
    expect(rejections).toEqual([]);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});
it("authorizes frames while session storage is failing", async () => {
  approved("https://parent.test", "https://player.test");
  const chrome = (globalThis as any).chrome;
  chrome.storage.session.set = async () => {
    throw new Error("Session storage is unavailable.");
  };
  const top = await send({ type: "webscaly:authorized" }, content("https://parent.test", 4, 0));
  const embed = await send({ type: "webscaly:authorized" }, content("https://player.test", 4, 3));
  expect(top.value?.origin).toBe("https://parent.test");
  expect(embed.value?.origin).toBe("https://player.test");
});
