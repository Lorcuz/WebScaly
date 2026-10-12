import React, { useEffect, useId, useRef, useState } from "react";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconInfoCircle,
  IconSettings,
  IconSparkles,
  IconWorld,
} from "@tabler/icons-react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import {
  hostPattern,
  normalizeConfiguration,
  profileFor,
  siteOrigin,
  type Configuration,
  type Settings,
} from "../shared/settings";
import { readConfiguration, STORAGE_KEY } from "../shared/storage";
import {
  approveSite,
  currentTab,
  isExtension,
  request,
  tabDiagnostics,
} from "./client";
import { attachHelp } from "./help";
import { About } from "./about";
import type { PlayerStatus } from "../shared/player-status";
type Choice = readonly [string, string];
const algorithms: Choice[] = [
    ["spatial", "Spatial detail"],
    ["anime4k", "Anime4K CNN"],
    ["fsrcnnx", "FSRCNNX x2"],
  ],
  qualities: Choice[] = [
    ["fast", "Fast"],
    ["balanced", "Balanced"],
    ["quality", "Quality"],
  ];
const sections = [
  "Video Enhancement",
  "Site Profiles",
  "Advanced",
  "Diagnostics",
  "About",
];
const sectionIcons = [
  IconSparkles,
  IconWorld,
  IconAdjustmentsHorizontal,
  IconActivity,
  IconInfoCircle,
];
const sectionDescriptions: Record<string, string> = {
  "Video Enhancement":
    "Fine-tune the detail in your videos. Changes save automatically.",
  "Site Profiles":
    "Choose which websites WebScaly can access and keep their settings in one place.",
  Advanced: "Manage presets and preferences for your selected profile.",
  Diagnostics: "Check the current player and find help with processing issues.",
  About: "A little more detail. A little more clarity.",
};
const help: Record<string, string> = {
  Algorithm:
    "Spatial is light; Anime4K suits animation; FSRCNNX restores fine detail.",
  Quality: "Anime4K detail level. Use Fast for lighter processing.",
  HUD: "Live performance numbers. Use to check processing speed.",
  "Output scale":
    "Scale sets output resolution. Use Automatic to match the player size.",
  "Output height limit":
    "The height limit bounds output size. Lower it on slower devices.",
  "Sharpening strength":
    "Sharpening restores edges. Use lightly to avoid halos.",
  "Denoise strength": "Denoise reduces grain. Use lightly on noisy videos.",
  "Include subdomains":
    "Also approves hosts like player.example.com. Enable only if needed.",
};
function Select({
  label,
  value,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | number;
  values: Choice[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const opts = values.some(([v]) => v === String(value))
    ? values
    : [...values, [String(value), `${value} (custom)`] as Choice];
  return (
    <label className="field" htmlFor={id}>
      <span className={help[label] ? "help-label" : undefined}>{label}</span>
      <select
        id={id}
        aria-label={label}
        data-help={help[label]}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {opts.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled = false,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <label
      className={`toggle-row ${description ? "tool-toggle" : ""}`}
      htmlFor={id}
    >
      <span className="toggle-copy">
        <span className={help[label] ? "help-label" : undefined}>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        data-help={help[label]}
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
function Slider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="range-title">
        <span className="help-label">{label}</span>
        <output htmlFor={id}>{Math.round(value * 100)}%</output>
      </span>
      <input
        id={id}
        data-help={help[label]}
        aria-label={label}
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        style={
          {
            "--range-progress": `${Math.round(value * 100)}%`,
          } as React.CSSProperties
        }
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </label>
  );
}
function Brand({ gear }: { gear?: () => void }) {
  return (
    <header className="brand">
      <img src="./icons/32.png" width="32" height="32" alt="" />
      <h1>WebScaly</h1>
      {gear ? (
        <button className="gear" aria-label="Advanced settings" onClick={gear}>
          <IconSettings size={20} stroke={1.7} aria-hidden="true" />
        </button>
      ) : (
        <span className="badge">LOCAL GPU</span>
      )}
    </header>
  );
}
function App() {
  const popup = location.pathname.endsWith("popup.html"),
    params = new URLSearchParams(location.search);
  const [config, setConfig] = useState<Configuration>(),
    [tab, setTab] = useState<{ id?: number; url?: string }>({}),
    [section, setSection] = useState(() => {
      const requested = params.get("section") ?? sections[0];
      return sections.includes(requested) ? requested : sections[0];
    }),
    [editing, setEditing] = useState(params.get("profile") ?? "defaults");
  const [diagnostics, setDiagnostics] = useState<PlayerStatus | null>(null),
    [error, setError] = useState(""),
    [lastError, setLastError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [grants, setGrants] = useState<string[]>([]);
  const [embed, setEmbed] = useState(""),
    [siteInput, setSiteInput] = useState(""),
    [subdomains, setSubdomains] = useState(false),
    [presetName, setPresetName] = useState("");
  const importRef = useRef<HTMLInputElement>(null),
    saves = useRef(Promise.resolve()),
    pending = useRef(0);
  useEffect(() => attachHelp(document), []);
  useEffect(() => {
    if (!popup) document.title = `${section} · WebScaly`;
  }, [popup, section]);
  const selectSection = (name: string) => {
    setSection(name);
    const url = new URL(location.href);
    url.searchParams.set("section", name);
    history.replaceState(null, "", url);
  };
  useEffect(() => {
    if (isExtension)
      void chrome.storage.session
        .get("webscalyUiError")
        .then((v) =>
          setLastError(
            typeof v.webscalyUiError === "string" ? v.webscalyUiError : "",
          ),
        );
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([readConfiguration(), currentTab()]).then(([c, t]) => {
      if (live) {
        setConfig(c);
        setTab(t);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const changed = (
      c: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && c[STORAGE_KEY] && !pending.current)
        void readConfiguration().then((value) => {
          if (live && !pending.current) setConfig(value);
        });
    };
    if (isExtension) chrome.storage.onChanged.addListener(changed);
    return () => {
      live = false;
      if (isExtension) chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  useEffect(() => {
    if (!config) return;
    let live = true;
    const refresh = () => {
      void tabDiagnostics(tab.id).then((d) => {
        if (live) setDiagnostics(d);
      });
      if (isExtension)
        void Promise.all(
          config.sites.map(async (s) =>
            (await chrome.permissions.contains({ origins: [hostPattern(s)] }))
              ? hostPattern(s)
              : "",
          ),
        ).then((g) => {
          if (live) setGrants(g.filter(Boolean));
        });
    };
    refresh();
    const id = setInterval(refresh, 1500);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [tab.id, config?.sites.map(hostPattern).join("|")]);
  if (!config)
    return (
      <main className={popup ? "popup" : "settings-loading"}>
        <Brand />
        <p className="muted">Loading settings…</p>
      </main>
    );
  let origin = "";
  try {
    origin = tab.url ? siteOrigin(tab.url) : "";
  } catch {}
  const current = tab.url ? profileFor(tab.url, config) : undefined,
    allowed = !!current && grants.includes(hostPattern(current));
  const player = diagnostics?.frames.find(
    (f) => f.videos > 0 && f.origin,
  )?.origin;
  const selected = popup
      ? player
        ? (profileFor(player, config) ?? current)
        : current
      : config.sites.find((s) => s.origin === editing),
    settings = selected?.settings ?? config.defaults;
  const active = diagnostics?.renderers.find((d) => d.state === "active"),
    unavailable = diagnostics?.renderers.find((d) => d.state === "unavailable");
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch },
      target = selected?.origin;
    setError("");
    setNotice("");
    setSaving(true);
    pending.current++;
    setConfig((c) =>
      c
        ? target
          ? {
              ...c,
              sites: c.sites.map((s) =>
                s.origin === target ? { ...s, settings: next } : s,
              ),
            }
          : { ...c, defaults: next }
        : c,
    );
    saves.current = saves.current
      .then(async () => {
        await request(
          target ? "site" : "defaults",
          target ? { origin: target, patch } : { settings: next },
        );
      })
      .catch((e) => reportError(e.message))
      .finally(() => {
        if (!--pending.current) {
          setSaving(false);
          void readConfiguration().then(setConfig);
        }
      });
  };
  const reportError = (text: string) => {
    const value = String(text).slice(0, 2048);
    setError(value);
    setLastError(value);
    if (isExtension)
      void chrome.storage.session.set({ webscalyUiError: value });
  };
  const act = async (task: () => Promise<Configuration>) => {
    setError("");
    setNotice("");
    setSaving(true);
    pending.current++;
    try {
      setConfig(await task());
    } catch (e) {
      reportError((e as Error).message);
    } finally {
      if (!--pending.current) setSaving(false);
    }
  };
  const add = (
    url: string,
    children: boolean,
    initial: Settings = config.defaults,
  ) => {
    void act(() => approveSite(url, children, initial));
  };
  const remove = (url: string) => {
    void act(async () => {
      const response = isExtension
        ? await chrome.runtime.sendMessage({
            type: "webscaly:removal-impact",
            origin: url,
          })
        : null;
      const scopes: string[] = response?.ok ? response.value : [],
        broader = scopes
          .filter((p) => p.includes("*.") || p.startsWith("*://"))
          .map((p) => p.replace(/^[^:]+:\/\//, "").replace(/\/.*$/, ""));
      const next = await request("remove", { origin: url });
      setNotice(
        broader.length
          ? "Website access removed, including broader subdomain approvals."
          : "Website access removed.",
      );
      return next;
    });
  };
  const openSettings = () => {
    const query = new URLSearchParams();
    if (tab.id !== undefined) query.set("tab", String(tab.id));
    if (selected) query.set("profile", selected.origin);
    if (isExtension)
      void chrome.tabs.create({
        url: chrome.runtime.getURL(`options.html?${query}`),
      });
    else location.assign("./options.html");
  };
  const exportConfig = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(config, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "webscaly-profiles.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importConfig = async (file: File) => {
    try {
      if (file.size > 256000) throw new Error("Configuration exceeds 256 KB.");
      const imported = normalizeConfiguration(JSON.parse(await file.text()));
      await act(() => request("import", { config: imported }));
      setNotice("Imported profiles still need website approval.");
    } catch (e) {
      reportError((e as Error).message);
    }
  };
  const engines = (
    <>
      <Select
        label="Algorithm"
        value={settings.algorithm}
        values={algorithms}
        onChange={(v) => update({ algorithm: v as Settings["algorithm"] })}
        disabled={popup && !allowed}
      />
      <Select
        label="Quality"
        value={settings.quality}
        values={qualities}
        onChange={(v) => update({ quality: v as Settings["quality"] })}
        disabled={(popup && !allowed) || settings.algorithm !== "anime4k"}
      />
    </>
  );
  const tools = (
    <>
      {["Controls", "Compare", "HUD"].map((name, i) => (
        <Toggle
          key={name}
          label={name}
          value={settings[(["controls", "comparison", "hud"] as const)[i]]}
          disabled={popup && !allowed}
          description={
            popup
              ? undefined
              : [
                  "Quick adjustments over the video.",
                  "Original and enhanced, side by side.",
                  "Live performance numbers.",
                ][i]
          }
          onChange={(v) =>
            update({ [(["controls", "comparison", "hud"] as const)[i]]: v })
          }
        />
      ))}
    </>
  );
  const feedback = (
    <div className="feedback" aria-live="polite">
      {error ? (
        <p className="error" role="alert" tabIndex={0}>
          {error.length > 110 && popup
            ? "Could not complete this action. See advanced settings for diagnostics."
            : error}
        </p>
      ) : notice ? (
        <p className="success">{notice}</p>
      ) : null}
    </div>
  );
  const embeds = diagnostics?.embeds.filter((e) => !e.approved) ?? [],
    chosen =
      embeds.find((e) => e.origin === embed)?.origin ?? embeds[0]?.origin;
  if (popup)
    return (
      <main className="popup">
        <Brand gear={openSettings} />
        {!isExtension && <p className="preview-label">Interface preview</p>}
        <section className="site-card">
          <div className="section-title">
            <span>Current website</span>
            <span className={`status-pill ${allowed ? "approved" : ""}`}>
              {allowed ? "Approved" : current ? "Needs approval" : "Access off"}
            </span>
          </div>
          <strong className="site-name">
            {origin ? new URL(origin).hostname : "Open a website to begin"}
          </strong>
          {!allowed ? (
            <button
              className="primary"
              disabled={!origin || !isExtension || saving}
              onClick={() =>
                add(
                  current?.origin ?? origin,
                  current?.subdomains ?? false,
                  current?.settings ?? config.defaults,
                )
              }
            >
              {saving ? "Waiting for Chrome…" : "Add this website"}
            </button>
          ) : (
            <button className="text-button" onClick={() => remove(origin)}>
              Remove website access
            </button>
          )}
        </section>
        <Toggle
          label="Enhancement"
          value={allowed && settings.enabled}
          disabled={!allowed}
          onChange={(enabled) => update({ enabled })}
        />
        <div className="compact-fields">{engines}</div>
        <div className="player-tools">{tools}</div>
        {selected && selected.origin !== current?.origin && (
          <p className="player-profile">
            Player: {new URL(selected.origin).hostname}
          </p>
        )}
        {allowed && chosen && (
          <div className="embed-selector">
            <label className="field">
              <span className="help-label">Embedded player access</span>
              <select
                aria-label="Embedded player"
                data-help="Embedded videos can need a second approval. Choose the player host."
                value={chosen}
                onChange={(e) => setEmbed(e.target.value)}
              >
                {embeds.map((e) => (
                  <option key={e.origin} value={e.origin}>
                    {new URL(e.origin).hostname}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={saving}
              onClick={() => add(chosen, false, settings)}
            >
              Allow
            </button>
          </div>
        )}
        <section className="status-block">
          <span className="section-title">
            {active
              ? `${active.algorithm} · ${active.backend}`
              : unavailable
                ? "Direct access blocked"
                : diagnostics?.videos
                  ? `${diagnostics.videos} usable players detected`
                  : allowed
                    ? "Waiting for an accessible player"
                    : "Website access is off"}
          </span>
          {active && (
            <span className="muted">
              {active.outputFps.toFixed(1)} enhanced fps ·{" "}
              {active.gpuMs?.toFixed(1) ?? "—"} ms
            </span>
          )}
        </section>
        {allowed && (
          <button
            className="compatibility-button"
            data-help="Use local tab sharing when direct enhancement is blocked."
            onClick={() =>
              void chrome.tabs.create({
                url: chrome.runtime.getURL(`viewer.html?source=${tab.id}`),
              })
            }
          >
            Open compatibility player ↗
          </button>
        )}
        {feedback}
        <footer>
          <span>Local processing · no telemetry</span>
          <span className="version">0.3.1</span>
        </footer>
      </main>
    );
  return (
    <div className="settings-shell">
      <a className="skip-link" href="#settings-content">
        Skip to settings
      </a>
      <aside className="sidebar">
        <Brand />
        <p className="nav-caption">Preferences</p>
        <nav aria-label="Settings sections">
          {sections.map((s, i) => {
            const Icon = sectionIcons[i];
            return (
              <button
                key={s}
                className={section === s ? "selected" : ""}
                aria-current={section === s ? "page" : undefined}
                onClick={() => selectSection(s)}
              >
                <Icon size={19} stroke={1.7} aria-hidden="true" />
                <span>{s}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <span className="privacy-dot" />
          Local processing · no telemetry<p>WebScaly 0.3.1</p>
        </div>
      </aside>
      <main className="settings-main" id="settings-content" tabIndex={-1}>
        <header className="settings-header">
          <div>
            <p className="eyebrow">WEBSCALY / SETTINGS</p>
            <h1>{section}</h1>
            <p className="muted">{sectionDescriptions[section]}</p>
          </div>
          {section !== "About" && (
            <Select
              label="Editing profile"
              value={editing}
              values={[
                ["defaults", "Default settings"],
                ...config.sites.map(
                  (s) => [s.origin, new URL(s.origin).hostname] as Choice,
                ),
              ]}
              onChange={setEditing}
            />
          )}
        </header>
        {!isExtension && (
          <div className="notice">
            Interface preview. Install WebScaly to approve website access.
          </div>
        )}
        {feedback}
        <div className="settings-content" key={section}>
          {section === sections[0] && (
            <>
              <section className="settings-panel">
                <h2>Processing engine</h2>
                <p className="muted">
                  Choose a lighter touch with Spatial Detail, restore animation
                  with Anime4K, or bring out finer detail with FSRCNNX.
                </p>
                <div className="form-grid">
                  {engines}
                  <Select
                    label="Output scale"
                    value={settings.scale}
                    values={[
                      ["auto", "Automatic"],
                      ["native", "Native resolution"],
                      ["1.5", "1.5×"],
                      ["2", "2×"],
                    ]}
                    onChange={(v) => update({ scale: v as Settings["scale"] })}
                  />
                  <Select
                    label="Output height limit"
                    value={settings.maxHeight}
                    values={[720, 1080, 1440, 2160].map((n) => [
                      String(n),
                      `${n}p`,
                    ])}
                    onChange={(v) => update({ maxHeight: Number(v) })}
                  />
                </div>
              </section>
              <section className="settings-panel">
                <h2>Spatial detail</h2>
                <p className="muted">
                  Sharpen edges and soften noise. These adjustments apply when
                  Spatial Detail is selected.
                </p>
                <div className="form-grid">
                  <Slider
                    label="Sharpening strength"
                    value={settings.strength}
                    disabled={settings.algorithm !== "spatial"}
                    onChange={(strength) => update({ strength })}
                  />
                  <Slider
                    label="Denoise strength"
                    value={settings.denoise}
                    disabled={settings.algorithm !== "spatial"}
                    onChange={(denoise) => update({ denoise })}
                  />
                </div>
              </section>
              <section className="settings-panel">
                <h2>In-player tools</h2>
                <p className="muted">
                  Keep your player clear, or switch on a little extra help. All
                  three tools start hidden.
                </p>
                <div className="player-tools">{tools}</div>
              </section>
            </>
          )}
          {section === sections[1] && (
            <>
              <section className="settings-panel">
                <h2>Approve a website</h2>
                <div className="add-site">
                  <input
                    aria-label="Website address"
                    placeholder="https://www.youtube.com"
                    value={siteInput}
                    onChange={(e) => setSiteInput(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={saving || !siteInput.trim() || !isExtension}
                    onClick={() => add(siteInput, subdomains)}
                  >
                    Add website
                  </button>
                </div>
                <Toggle
                  label="Include subdomains"
                  value={subdomains}
                  onChange={setSubdomains}
                />
              </section>
              <section className="settings-panel">
                <h2>
                  Website profiles{" "}
                  <span className="count">{config.sites.length}</span>
                </h2>
                {!config.sites.length ? (
                  <p className="muted">
                    No approved websites. Use the popup on a video page to
                    begin.
                  </p>
                ) : (
                  config.sites.map((site) => (
                    <div className="profile-row" key={site.origin}>
                      <div>
                        <strong>{new URL(site.origin).hostname}</strong>
                        <p>
                          {site.subdomains
                            ? "Includes subdomains"
                            : "Exact host"}{" "}
                          ·{" "}
                          {grants.includes(hostPattern(site))
                            ? "Access granted"
                            : "Needs approval"}
                        </p>
                      </div>
                      <button
                        aria-label={`Edit ${new URL(site.origin).hostname}`}
                        onClick={() => {
                          setEditing(site.origin);
                          selectSection(sections[0]);
                        }}
                      >
                        Edit
                      </button>
                      {!grants.includes(hostPattern(site)) && (
                        <button
                          aria-label={`Approve ${new URL(site.origin).hostname}`}
                          onClick={() =>
                            add(site.origin, site.subdomains, site.settings)
                          }
                        >
                          Approve
                        </button>
                      )}
                      <button
                        className="danger-quiet"
                        aria-label={`Remove ${new URL(site.origin).hostname}`}
                        onClick={() => remove(site.origin)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </section>
              <section className="settings-panel">
                <h2>Configuration</h2>
                <div className="button-row">
                  <button onClick={exportConfig}>Export profiles</button>
                  <button onClick={() => importRef.current?.click()}>
                    Import profiles
                  </button>
                  <input
                    ref={importRef}
                    className="visually-hidden"
                    type="file"
                    accept="application/json"
                    aria-label="Profile file"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void importConfig(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              </section>
            </>
          )}
          {section === sections[2] && (
            <>
              <section className="settings-panel">
                <h2>Activation</h2>
                <Toggle
                  label="Enable selected profile"
                  value={settings.enabled}
                  onChange={(enabled) => update({ enabled })}
                />
                <p className="muted">
                  Defaults apply to newly approved websites. Each website keeps
                  its own settings. Up to two visible players are enhanced per
                  frame.
                </p>
              </section>
              <section className="settings-panel">
                <h2>Custom presets</h2>
                <div className="add-site">
                  <input
                    aria-label="Preset name"
                    placeholder="Name this preset"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <button
                    disabled={!presetName.trim()}
                    onClick={() => {
                      void act(() =>
                        request("presets", {
                          presets: [
                            ...config.presets.filter(
                              (p) => p.name !== presetName.trim(),
                            ),
                            { name: presetName.trim(), settings },
                          ],
                        }),
                      );
                      setPresetName("");
                    }}
                  >
                    Save preset
                  </button>
                </div>
                {config.presets.map((p) => (
                  <div className="profile-row" key={p.name}>
                    <strong>{p.name}</strong>
                    <button onClick={() => update(p.settings)}>Apply</button>
                    <button
                      onClick={() =>
                        void act(() =>
                          request("presets", {
                            presets: config.presets.filter(
                              (q) => q.name !== p.name,
                            ),
                          }),
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </section>
              <section className="settings-panel">
                <h2>Compatibility</h2>
                <p className="muted">
                  Chrome 121+ uses a capable WebGPU device, with WebGL spatial
                  fallback. Frames need approval for both parent and player
                  hosts. Protected media, closed Shadow DOM and browser origin
                  restrictions limit direct access. The compatibility player
                  offers local Chrome tab sharing for blocked video. Container
                  fullscreen is supported; video-element fullscreen uses native
                  playback.
                </p>
              </section>
            </>
          )}
          {section === sections[3] && (
            <>
              {lastError && (
                <section className="settings-panel">
                  <h2>Last action error</h2>
                  <pre>{lastError}</pre>
                  <button
                    onClick={() => {
                      setLastError("");
                      if (isExtension)
                        void chrome.storage.session.remove("webscalyUiError");
                    }}
                  >
                    Clear error
                  </button>
                </section>
              )}
              <section className="settings-panel">
                <h2>Current video</h2>
                {diagnostics ? (
                  <>
                    <p className="muted">
                      {diagnostics.videos} visible usable players ·{" "}
                      {diagnostics.hiddenVideos ?? 0} hidden videos
                    </p>
                    <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
                  </>
                ) : (
                  <p className="muted">
                    Open settings from the popup on your video tab to view its
                    diagnostics.
                  </p>
                )}
              </section>
              <section className="settings-panel">
                <h2>Measurement</h2>
                <p className="muted">
                  Source FPS uses decoded media timestamps. Enhanced FPS counts
                  decoded frames submitted for enhancement; it does not measure
                  display scanout. GPU time is optional. Frames are processed at
                  native rate and may be skipped when the GPU is busy. Audio
                  stays with the native player.
                </p>
                <a
                  className="button-link"
                  href="./benchmark.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open GPU benchmark
                </a>
              </section>
            </>
          )}
          {section === "About" && <About />}
        </div>
        {section !== "About" && (
          <footer className="settings-footer">
            <span>Local processing. No accounts or cloud inference.</span>
            <span>{saving ? "Saving…" : "Saved on this device"}</span>
          </footer>
        )}
      </main>
    </div>
  );
}
export function mountApp() {
  createRoot(document.querySelector("#root")!).render(<App />);
}
