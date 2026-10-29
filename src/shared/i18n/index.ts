import { ja } from "./ja";
import { STORAGE_KEY } from "../storage-key";
import { normalizeLanguage, type Language } from "../settings-core";

export type Locale = "en" | "ja";
const dictionary: Readonly<Record<string, string>> = ja;
let language: Language = "auto";
const listeners = new Set<() => void>();
let initialization: Promise<void> | undefined;

/** Chrome's UI language, rather than the language of the video website. */
export function resolveLocale(preference: Language, browserLanguage: string): Locale {
  return preference === "auto"
    ? /^ja(?:-|_|$)/i.test(browserLanguage) ? "ja" : "en"
    : preference;
}
export function getLocale(): Locale {
  const browserLanguage = globalThis.chrome?.i18n?.getUILanguage?.()
    ?? (typeof navigator !== "undefined" ? navigator.language : "en");
  return resolveLocale(language, browserLanguage);
}
export function setLanguage(value: unknown) {
  const next = normalizeLanguage(value);
  if (language === next) return;
  language = next;
  listeners.forEach((notify) => notify());
}
export function subscribeLocale(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
/** A source message is also its English fallback. Never call this on user names. */
export function t(source: string, context?: string): string {
  if (getLocale() !== "ja") return source;
  return (context ? dictionary[`${source} [${context}]`] : undefined) ?? dictionary[source] ?? source;
}
export function format(source: string, values: Record<string, string | number>): string {
  return t(source).replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match);
}

/** Translate known diagnostics at the presentation boundary; retain raw driver errors. */
const patterns = Object.keys(dictionary).filter((key) => /\{\w+\}/.test(key)).map((key) => {
  const names: string[] = [];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\{(\w+)\\\}/g, (_match, name: string) => {
    names.push(name);
    return "(.+?)";
  });
  return { key, names, regex: new RegExp(`^${pattern}$`, "s") };
});
export function translateMessage(source: string): string {
  if (getLocale() !== "ja") return source;
  if (Object.hasOwn(dictionary, source)) return t(source);
  for (const { key, names, regex } of patterns) {
    const match = regex.exec(source);
    if (match) return format(key, Object.fromEntries(names.map((name, i) => [name, name === "engine" ? t(match[i + 1]) : match[i + 1]])));
  }
  if (source.includes(" · ")) return source.split(" · ").map(translateMessage).join(" · ");
  if (source.startsWith("Adaptive: ")) return `自動調整：${translateMessage(source.slice(10))}`;
  return source;
}

export function initializeLocale(): Promise<void> {
  initialization ??= (async () => {
    const refresh = async () => {
      try {
        const value = globalThis.chrome?.storage
          ? (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
          : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        setLanguage((value as { preferences?: { language?: unknown } } | null)?.preferences?.language);
      } catch { setLanguage("auto"); }
    };
    // Subscribe before the read so a change during initialization is not lost.
    if (globalThis.chrome?.storage) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[STORAGE_KEY])
          setLanguage((changes[STORAGE_KEY].newValue as { preferences?: { language?: unknown } } | undefined)?.preferences?.language);
      });
    } else if (typeof window !== "undefined") {
      window.addEventListener("storage", () => { void refresh(); });
      window.addEventListener("webscaly:configuration", () => { void refresh(); });
    }
    await refresh();
    if (typeof window !== "undefined")
      window.addEventListener("languagechange", () => listeners.forEach((notify) => notify()));
  })();
  return initialization;
}
