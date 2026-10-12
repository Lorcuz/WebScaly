import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  EMPTY,
  hostPattern,
  matchesSite,
  normalizeConfiguration,
  normalizeSettings,
  profileFor,
  siteOrigin,
} from "../../src/shared/settings";
describe("least-privilege site matching", () => {
  const site = {
    origin: "https://example.com",
    subdomains: false,
    settings: DEFAULTS,
  };
  it("canonicalizes ports and paths to a host permission scope", () =>
    expect(siteOrigin("https://EXAMPLE.com:8443/watch?q=x")).toBe(
      "https://example.com",
    ));
  it.each([
    "file:///video.mp4",
    "chrome://extensions",
    "https://user:secret@example.com",
    "https://*",
    "https://*.example.com",
  ])("rejects invalid host scope %s", (url) =>
    expect(() => siteOrigin(url)).toThrow(),
  );
  it("does not approve suffix lookalikes, other protocols or subdomains implicitly", () => {
    for (const url of [
      "https://notexample.com",
      "https://example.com.evil.test",
      "http://example.com",
      "https://cdn.example.com",
    ])
      expect(matchesSite(url, site)).toBe(false);
    expect(matchesSite("https://example.com/watch", site)).toBe(true);
  });
  it("requires a dot boundary for explicitly included subdomains", () => {
    expect(
      matchesSite("https://a.example.com", { ...site, subdomains: true }),
    ).toBe(true);
    expect(
      matchesSite("https://badexample.com", { ...site, subdomains: true }),
    ).toBe(false);
  });
  it("refuses wildcard public suffixes and private hosting suffixes", () => {
    for (const origin of [
      "https://co.uk",
      "https://github.io",
      "http://localhost",
    ])
      expect(() =>
        hostPattern({ ...site, origin, subdomains: true }),
      ).toThrow();
    expect(hostPattern(site)).toBe("https://example.com/*");
  });
  it("prefers exact profiles over a broader parent", () => {
    const exact = { ...site, origin: "https://a.example.com" };
    const config = { ...EMPTY, sites: [{ ...site, subdomains: true }, exact] };
    expect(profileFor("https://a.example.com/v", config)).toBe(exact);
  });
});
describe("settings and import", () => {
  it("clamps untrusted settings and ignores invalid enum values", () => {
    const s = normalizeSettings({
      strength: Infinity,
      denoise: -5,
      enabled: "true",
      targetFps: 999,
      algorithm: "remote",
      split: 3,
    });
    expect(s.strength).toBe(DEFAULTS.strength);
    expect(s.denoise).toBe(0);
    expect(s).not.toHaveProperty("targetFps");
    expect(s.algorithm).toBe("spatial");
    expect(s.split).toBe(1);
  });
  it("round trips separate profiles without sharing mutable settings", () => {
    const source = {
      ...EMPTY,
      sites: [
        {
          origin: "https://a.test",
          subdomains: false,
          settings: { ...DEFAULTS, strength: 0.8 },
        },
        {
          origin: "https://b.test",
          subdomains: false,
          settings: { ...DEFAULTS, algorithm: "anime4k" },
        },
      ],
    };
    const imported = normalizeConfiguration(JSON.parse(JSON.stringify(source)));
    imported.sites[0].settings.strength = 0.2;
    expect(imported.sites[1].settings.strength).toBe(0.35);
    expect(source.sites[0].settings.strength).toBe(0.8);
  });
  it("rejects unsupported versions and filters dangerous imported scopes", () => {
    expect(() => normalizeConfiguration({ version: 3 })).toThrow();
    expect(
      normalizeConfiguration({
        version: 1,
        sites: [
          { origin: "https://*" },
          { origin: "https://co.uk", subdomains: true },
          { origin: "https://example.com" },
        ],
      }).sites,
    ).toHaveLength(1);
  });
});
