import { afterEach, describe, expect, it, vi } from "vitest";
import { format, getLocale, resolveLocale, setLanguage, t, translateMessage } from "../../src/shared/i18n";
import { ja } from "../../src/shared/i18n/ja";
import { DEFAULTS, normalizePreferences, normalizeSettings } from "../../src/shared/settings-core";
import { mergeConfiguration, normalizeConfiguration } from "../../src/shared/settings";

afterEach(() => { vi.unstubAllGlobals(); setLanguage("auto"); });
describe("interface language", () => {
  it.each(["ja", "ja-JP", "JA-jp", "ja_JP"])("detects Japanese UI language %s", (language) => {
    expect(resolveLocale("auto", language)).toBe("ja");
  });
  it("falls back to English and lets manual settings override the browser", () => {
    expect(resolveLocale("auto", "de-DE")).toBe("en");
    expect(resolveLocale("en", "ja-JP")).toBe("en");
    expect(resolveLocale("ja", "en-US")).toBe("ja");
    expect(resolveLocale("auto", "javanese")).toBe("en");
  });
  it("uses Chrome UI language instead of the website or navigator language", () => {
    vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "ja" } });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(getLocale()).toBe("ja");
    setLanguage("en");
    expect(t("Settings")).toBe("Settings");
    setLanguage("ja");
    expect(t("Settings")).toBe("設定");
    expect(t("Quality", "label")).toBe("品質");
    expect(t("Quality")).toBe("高品質");
    expect(t("Unrecognized driver error 123")).toBe("Unrecognized driver error 123");
  });
  it("retains named placeholders in every translation", () => {
    for (const [source, translated] of Object.entries(ja)) {
      expect(translated.match(/\{\w+\}/g)?.sort() ?? [], source)
        .toEqual(source.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });
  it("interpolates site names without translating their contents", () => {
    setLanguage("ja");
    expect(format("Remove {host}?", { host: "Settings" })).toBe("Settingsの登録を解除しますか？");
    expect(translateMessage("1080p source is already sharp, so it plays natively."))
      .toBe("元動画は1080pで十分な解像度のため、そのまま再生します。");
    expect(translateMessage("Adaptive: Balanced quality")).toBe("自動調整：バランスモード");
  });
  it("adds auto to old preferences without changing picture settings", () => {
    const old = { version: 2, defaults: { ...DEFAULTS, strength: 0.72 },
      sites: [{ origin: "https://example.com", settings: { ...DEFAULTS, quality: "quality" } }],
      presets: [{ name: "Settings", settings: { ...DEFAULTS, algorithm: "anime4k" } }],
      preferences: { paused: true, batterySaver: true, welcomed: true } };
    const result = normalizeConfiguration(old);
    expect(result.preferences).toEqual({ ...old.preferences, language: "auto" });
    expect(result.defaults).toEqual(old.defaults);
    expect(result.sites[0].settings).toEqual(old.sites[0].settings);
    expect(result.presets[0]).toEqual(old.presets[0]);
    expect(normalizeSettings({ ...DEFAULTS, language: "ja" })).toEqual(DEFAULTS);
  });
  it("normalizes invalid language values and preserves local language on merge", () => {
    expect(normalizePreferences({ language: "fr" }).language).toBe("auto");
    const current = normalizeConfiguration({ version: 2, preferences: { language: "ja" } });
    const incoming = normalizeConfiguration({ version: 1, preferences: { language: "en" } });
    expect(mergeConfiguration(current, incoming).preferences.language).toBe("ja");
    expect(normalizePreferences({ language: "en" }).language).toBe("en");
  });
});
