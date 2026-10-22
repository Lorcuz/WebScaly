import { useCallback, useEffect, useRef, useState } from "react";
import {
  hostPattern,
  normalizeConfiguration,
  type Configuration,
  type Preferences,
  type Settings,
} from "../shared/settings";
import { readConfiguration, STORAGE_KEY } from "../shared/storage";
import type { PlayerStatus } from "../shared/player-status";
import {
  approveSite,
  currentTab,
  isExtension,
  request,
  tabDiagnostics,
  type Tab,
} from "./client";

const UI_ERROR = "webscalyUiError";
/** `target` is a site origin, or undefined for the defaults profile. */
export type Target = string | undefined;
export interface Store {
  config?: Configuration;
  tab?: Tab;
  /** Granted host patterns; undefined until the first check finishes. */
  grants?: Set<string>;
  /** Live player status; undefined while loading, null without a video tab. */
  status?: PlayerStatus | null;
  error: string;
  notice: string;
  lastError: string;
  busy: boolean;
  setNotice: (text: string) => void;
  clearError: () => void;
  reportError: (text: string) => void;
  patch: (target: Target, patch: Partial<Settings>, delay?: number) => void;
  run: (task: () => Promise<Configuration | void>, success?: string) => Promise<boolean>;
  approve: (url: string, subdomains: boolean, settings?: Settings) => Promise<boolean>;
  preferences: (patch: Partial<Preferences>) => Promise<boolean>;
  refreshStatus: () => void;
}
export function settingsFor(config: Configuration, target: Target) {
  return (
    (target && config.sites.find((s) => s.origin === target)?.settings) ||
    config.defaults
  );
}
export function useStore(poll: number): Store {
  const [config, setConfig] = useState<Configuration>();
  const [tab, setTab] = useState<Tab>();
  const [grants, setGrants] = useState<Set<string>>();
  const [status, setStatus] = useState<PlayerStatus | null>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastError, setLastError] = useState("");
  const [busyCount, setBusy] = useState(0);
  const configRef = useRef(config);
  configRef.current = config;
  // While edits are in flight, storage echoes of older states are ignored.
  const pending = useRef(0);
  const queued = useRef(
    new Map<string, { patch: Partial<Settings>; timer: ReturnType<typeof setTimeout> }>(),
  );
  const writes = useRef(Promise.resolve());
  const poke = useRef(() => {});

  useEffect(() => {
    let live = true;
    void Promise.all([readConfiguration(), currentTab()]).then(([c, t]) => {
      if (!live) return;
      setConfig(c);
      setTab(t);
    });
    if (isExtension)
      void chrome.storage.session.get(UI_ERROR).then((v) => {
        if (live && typeof v[UI_ERROR] === "string") setLastError(v[UI_ERROR]);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!isExtension) return;
    const changed = (
      c: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local" || !c[STORAGE_KEY] || pending.current) return;
      try {
        setConfig(normalizeConfiguration(c[STORAGE_KEY].newValue));
      } catch {
        /* Ignore an unreadable intermediate value. */
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  const scopes = config?.sites.map(hostPattern).join("|");
  useEffect(() => {
    if (!config) return;
    if (!isExtension) {
      setGrants(new Set());
      return;
    }
    let live = true;
    const check = async () => {
      const found = new Set<string>();
      for (const site of configRef.current?.sites ?? []) {
        const pattern = hostPattern(site);
        if (await chrome.permissions.contains({ origins: [pattern] }))
          found.add(pattern);
      }
      if (live) setGrants(found);
    };
    void check();
    const onChange = () => void check();
    chrome.permissions.onAdded.addListener(onChange);
    chrome.permissions.onRemoved.addListener(onChange);
    return () => {
      live = false;
      chrome.permissions.onAdded.removeListener(onChange);
      chrome.permissions.onRemoved.removeListener(onChange);
    };
  }, [scopes, config === undefined]);
  useEffect(() => {
    if (!tab) return;
    if (tab.id === undefined) {
      setStatus(null);
      return;
    }
    let live = true;
    const refresh = () =>
      void tabDiagnostics(tab.id).then((d) => {
        if (live) setStatus(d);
      });
    poke.current = refresh;
    refresh();
    const id = setInterval(refresh, poll);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [tab, poll]);

  const reportError = useCallback((text: string) => {
    const value = String(text).slice(0, 2048);
    setError(value);
    setLastError(value);
    if (isExtension) void chrome.storage.session.set({ [UI_ERROR]: value });
  }, []);
  const clearError = useCallback(() => {
    setLastError("");
    setError("");
    if (isExtension) void chrome.storage.session.remove(UI_ERROR);
  }, []);
  const settle = useCallback(() => {
    if (--pending.current) return;
    void readConfiguration().then((c) => {
      if (!pending.current) setConfig(c);
    });
  }, []);
  /** Optimistic edit; sliders pass a delay so a drag becomes one write. */
  const patch = useCallback(
    (target: Target, change: Partial<Settings>, delay = 0) => {
      const current = configRef.current;
      if (!current) return;
      setError("");
      setConfig((c) =>
        !c
          ? c
          : target
            ? {
                ...c,
                sites: c.sites.map((s) =>
                  s.origin === target
                    ? { ...s, settings: { ...s.settings, ...change } }
                    : s,
                ),
              }
            : { ...c, defaults: { ...c.defaults, ...change } },
      );
      const key = target ?? "";
      const entry = queued.current.get(key);
      if (entry) clearTimeout(entry.timer);
      else pending.current++;
      const merged = { ...entry?.patch, ...change };
      const commit = () => {
        queued.current.delete(key);
        writes.current = writes.current
          .then(async () => {
            if (target) await request("site", { origin: target, patch: merged });
            else
              await request("defaults", {
                settings: { ...settingsFor(configRef.current!, undefined), ...merged },
              });
          })
          .catch((e) => reportError((e as Error).message))
          .finally(settle);
      };
      queued.current.set(key, {
        patch: merged,
        timer: setTimeout(commit, delay),
      });
    },
    [reportError, settle],
  );
  const run = useCallback(
    async (task: () => Promise<Configuration | void>, success = "") => {
      setError("");
      setNotice("");
      setBusy((n) => n + 1);
      pending.current++;
      try {
        const next = await task();
        if (next) setConfig(next);
        if (success) setNotice(success);
        return true;
      } catch (e) {
        reportError((e as Error).message);
        return false;
      } finally {
        setBusy((n) => n - 1);
        settle();
      }
    },
    [reportError, settle],
  );
  const approve = useCallback(
    (url: string, subdomains: boolean, settings?: Settings) =>
      run(() =>
        approveSite(url, subdomains, settings ?? configRef.current!.defaults),
      ),
    [run],
  );
  const preferences = useCallback(
    (change: Partial<Preferences>) => {
      setConfig((c) =>
        c ? { ...c, preferences: { ...c.preferences, ...change } } : c,
      );
      return run(() => request("preferences", { patch: change }));
    },
    [run],
  );
  return {
    config,
    tab,
    grants,
    status,
    error,
    notice,
    lastError,
    busy: busyCount > 0,
    setNotice,
    clearError,
    reportError,
    patch,
    run,
    approve,
    preferences,
    refreshStatus: () => poke.current(),
  };
}
