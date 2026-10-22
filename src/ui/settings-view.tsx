import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconBookmarks,
  IconInfoCircle,
  IconKeyboard,
  IconPlayerPlay,
  IconSparkles,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";
import {
  ALGORITHM_LABELS,
  BUILTIN_PRESETS,
  DEFAULTS,
  PICTURE_KEYS,
  QUALITY_LABELS,
  hostLabel,
  hostPattern,
  normalizeConfiguration,
  pictureOf,
  type Algorithm,
  type Configuration,
  type Quality,
  type Settings as SettingsModel,
  type SkipAbove,
} from "../shared/settings";
import type { Diagnostics } from "../shared/player-status";
import { useStore, settingsFor, type Store, type Target } from "./state";
import {
  Disclosure,
  Feedback,
  Segmented,
  Shortcut,
  Slider,
  Switch,
  useConfirm,
} from "./components";
import {
  isExtension,
  openShortcutSettings,
  request,
  shortcuts,
  VERSION,
} from "./client";
import { About } from "./about";
import { VideoRenderer } from "../core/renderer";
import { fixtureStream } from "../shared/fixture";

const SECTIONS: { id: string; icon: Icon; title: string; description: string }[] = [
  {
    id: "Enhancement",
    icon: IconSparkles,
    title: "Enhancement",
    description: "How video looks for the selected profile. Changes save as you make them.",
  },
  {
    id: "Websites",
    icon: IconWorld,
    title: "Websites",
    description: "Websites WebScaly may enhance. Access starts off, and you can remove it at any time.",
  },
  {
    id: "Presets",
    icon: IconBookmarks,
    title: "Presets",
    description: "Named picture settings you can apply to any profile in one step.",
  },
  {
    id: "Behavior",
    icon: IconKeyboard,
    title: "Behavior",
    description: "Pause, battery saving and keyboard shortcuts for every website.",
  },
  {
    id: "Diagnostics",
    icon: IconActivity,
    title: "Diagnostics",
    description: "What WebScaly sees on the video tab and on this device's graphics.",
  },
  {
    id: "About",
    icon: IconInfoCircle,
    title: "About",
    description: "Local video enhancement, made with care.",
  },
  {
    id: "Welcome",
    icon: IconPlayerPlay,
    title: "Getting started",
    description: "Three steps to a sharper picture.",
  },
];
// Section names from 0.3 links keep working.
const LEGACY: Record<string, string> = {
  "Video Enhancement": "Enhancement",
  "Site Profiles": "Websites",
  Advanced: "Behavior",
};
const ENGINE_OPTIONS = [
  { value: "spatial" as const, label: "Spatial Detail", hint: "Light, any video" },
  { value: "anime4k" as const, label: "Anime4K", hint: "Animation" },
  { value: "fsrcnnx" as const, label: "FSRCNNX", hint: "Camera footage" },
];
const QUALITY_OPTIONS = [
  { value: "fast" as const, label: "Fast", hint: "Lightest" },
  { value: "balanced" as const, label: "Balanced", hint: "Bicubic" },
  { value: "quality" as const, label: "Quality", hint: "Sharpest" },
];

export function Settings() {
  const store = useStore(1500);
  const params = new URLSearchParams(location.search);
  const [section, setSection] = useState(() => {
    const requested = params.get("section") ?? "Enhancement";
    const id = LEGACY[requested] ?? requested;
    return SECTIONS.some((s) => s.id === id) ? id : "Enhancement";
  });
  const [editing, setEditing] = useState<Target>(params.get("profile") ?? undefined);
  const { config } = store;
  useEffect(() => {
    document.title = `${SECTIONS.find((s) => s.id === section)!.title} · WebScaly`;
  }, [section]);
  // A profile link for a website that was removed falls back to the defaults, visibly.
  useEffect(() => {
    if (config && editing && !config.sites.some((s) => s.origin === editing)) {
      setEditing(undefined);
      store.setNotice("That website profile no longer exists, so the default settings are shown.");
    }
  }, [config, editing]);
  const select = (id: string) => {
    setSection(id);
    const url = new URL(location.href);
    url.searchParams.set("section", id);
    history.replaceState(null, "", url);
  };
  if (!config)
    return (
      <div className="settings-shell" aria-busy="true">
        <aside className="sidebar">
          <Brand />
        </aside>
        <main className="settings-main">
          <div className="skeleton" style={{ height: 60, width: 320 }} />
          <div className="skeleton" style={{ height: 260 }} />
        </main>
      </div>
    );
  const meta = SECTIONS.find((s) => s.id === section)!;
  const profiled = ["Enhancement", "Presets"].includes(section);
  return (
    <div className="settings-shell">
      <a className="skip-link" href="#settings-content">
        Skip to settings
      </a>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => select(s.id)}
            >
              <s.icon size={19} stroke={1.7} aria-hidden="true" />
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
        <div className="foot">
          <span>Processed on this device. No accounts, no uploads.</span>
          <span>WebScaly {VERSION}</span>
        </div>
      </aside>
      <main className="settings-main" id="settings-content" tabIndex={-1}>
        <header className="page-head">
          <div>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          {profiled && (
            <label className="field">
              <span className="label">Editing profile</span>
              <select
                className="select"
                aria-label="Editing profile"
                value={editing ?? ""}
                onChange={(e) => setEditing(e.target.value || undefined)}
              >
                <option value="">Default settings</option>
                {config.sites.map((s) => (
                  <option key={s.origin} value={s.origin}>
                    {hostLabel(s.origin)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        {!isExtension && (
          <p className="notice">
            Interface preview. Install WebScaly to approve website access.
          </p>
        )}
        <Feedback error={store.error} notice={store.notice} />
        <div className="page" key={section}>
          {section === "Enhancement" && (
            <Enhancement store={store} target={editing} />
          )}
          {section === "Websites" && (
            <Websites
              store={store}
              edit={(origin) => {
                setEditing(origin);
                select("Enhancement");
              }}
            />
          )}
          {section === "Presets" && <Presets store={store} target={editing} />}
          {section === "Behavior" && <Behavior store={store} />}
          {section === "Diagnostics" && <DiagnosticsPage store={store} />}
          {section === "About" && <About />}
          {section === "Welcome" && (
            <Welcome
              store={store}
              done={() => {
                void store.preferences({ welcomed: true });
                select("Enhancement");
              }}
            />
          )}
        </div>
        <footer className="settings-footer">
          <span aria-live="polite">{store.busy ? "Saving…" : "All changes saved"}</span>
        </footer>
      </main>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <img src="./icons/32.png" width="28" height="28" alt="" />
      <strong>WebScaly</strong>
    </div>
  );
}
function Group({
  title,
  note,
  children,
  aside,
}: {
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="group">
      <header>
        <h2>
          {title}
          {aside}
        </h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}
function Row({
  title,
  note,
  children,
  wide = false,
}: {
  title?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`row ${wide ? "wide" : ""}`}>
      {title !== undefined && (
        <div className="text">
          <strong>{title}</strong>
          {note && <small>{note}</small>}
        </div>
      )}
      <div className={wide ? "" : "control"}>{children}</div>
    </div>
  );
}

/* ---------- Enhancement ---------- */
function Enhancement({ store, target }: { store: Store; target: Target }) {
  const config = store.config!;
  const settings = settingsFor(config, target);
  const set = (patch: Partial<SettingsModel>, delay = 0) => store.patch(target, patch, delay);
  const scope = target ? hostLabel(target) : "new websites";
  return (
    <>
      <Preview settings={settings} />
      <Group
        title="Engine"
        note={
          target
            ? `Settings for ${scope}.`
            : "Defaults apply to websites you approve from now on. Each website keeps its own copy."
        }
      >
        <div className="rows">
          <div className="row">
            <Switch
              label="Enhance video"
              description={
                target
                  ? `Turn enhancement on or off for ${scope}.`
                  : "Newly approved websites start with enhancement on."
              }
              checked={settings.enabled}
              onChange={(enabled) => set({ enabled })}
            />
          </div>
          <Row wide>
            <Segmented
              label="Algorithm"
              tall
              value={settings.algorithm}
              options={ENGINE_OPTIONS}
              help="Spatial Detail is lightest. Anime4K suits animation. FSRCNNX restores camera footage."
              onChange={(algorithm) => set({ algorithm })}
            />
          </Row>
          <Row wide>
            <Segmented
              label="Quality"
              tall
              value={settings.quality}
              options={QUALITY_OPTIONS}
              help="Sets the upscaling filter, and the larger network for Anime4K."
              onChange={(quality) => set({ quality })}
            />
          </Row>
        </div>
      </Group>
      <Group
        title="Detail"
        note="Cleanup runs before the engine; sharpening runs at display size, after upscaling. All apply to every engine."
      >
        <div className="rows">
          <Row wide>
            <Slider
              label="Sharpening"
              value={settings.strength}
              help="Adaptive sharpening restores edges without halos on already-strong edges."
              onChange={(strength) => set({ strength }, 150)}
            />
          </Row>
          <Row wide>
            <Slider
              label="Denoise"
              value={settings.denoise}
              help="Smooths grain and blocking in flat areas while keeping edges."
              onChange={(denoise) => set({ denoise }, 150)}
            />
          </Row>
          <Row wide>
            <Slider
              label="Deband"
              value={settings.deband}
              help="Removes stepped bands in gradients such as skies and shadows. Needs WebGPU."
              onChange={(deband) => set({ deband }, 150)}
            />
          </Row>
        </div>
      </Group>
      <Group
        title="Colour"
        aside={
          <button
            className="link subtle"
            style={{ marginLeft: 12, fontSize: 13 }}
            disabled={!settings.vibrance && !settings.contrast && !settings.brightness}
            onClick={() => set({ vibrance: 0, contrast: 0, brightness: 0 })}
          >
            Reset colour
          </button>
        }
      >
        <div className="rows">
          {(
            [
              ["vibrance", "Vibrance", "Lifts muted colours more than vivid ones, so skin stays natural."],
              ["contrast", "Contrast", "Expands or softens the tonal range around mid grey."],
              ["brightness", "Brightness", "Raises or lowers the whole picture."],
            ] as const
          ).map(([key, label, help]) => (
            <Row wide key={key}>
              <Slider
                label={label}
                value={settings[key]}
                min={-1}
                max={1}
                help={help}
                format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
                onChange={(value) => set({ [key]: value }, 150)}
              />
            </Row>
          ))}
        </div>
      </Group>
      <Group title="Output and performance">
        <div className="rows">
          <Row title="Output scale" note="Automatic matches the player's size on screen.">
            <Segmented
              label="Output scale"
              value={settings.scale}
              options={[
                { value: "auto", label: "Auto" },
                { value: "native", label: "Native" },
                { value: "1.5", label: "1.5×" },
                { value: "2", label: "2×" },
              ]}
              onChange={(scale) => set({ scale })}
            />
          </Row>
          <Row title="Height limit" note="Caps output size. Lower it on slower graphics.">
            <select
              className="select"
              aria-label="Output height limit"
              value={settings.maxHeight}
              onChange={(e) => set({ maxHeight: Number(e.target.value) })}
            >
              {[...new Set([720, 1080, 1440, 2160, settings.maxHeight])]
                .sort((a, b) => a - b)
                .map((h) => (
                  <option key={h} value={h}>
                    {h}p
                  </option>
                ))}
            </select>
          </Row>
          <Row title="Skip sharp videos" note="Leaves high-resolution video untouched and saves power.">
            <select
              className="select"
              aria-label="Skip sharp videos"
              value={settings.skipAbove}
              onChange={(e) => set({ skipAbove: Number(e.target.value) as SkipAbove })}
            >
              <option value={0}>Never</option>
              <option value={720}>Above 720p</option>
              <option value={1080}>Above 1080p</option>
              <option value={1440}>Above 1440p</option>
            </select>
          </Row>
          <div className="row">
            <Switch
              label="Adaptive performance"
              description="If the graphics card falls behind, WebScaly steps down quality, then size, then engine, and says so in the popup."
              checked={settings.adaptive}
              onChange={(adaptive) => set({ adaptive })}
            />
          </div>
        </div>
      </Group>
      <Group title="On the video" note="Everything here starts hidden and stays out of the picture until you want it.">
        <div className="rows">
          <div className="row">
            <Switch
              label="Controls"
              description="A compact toolbar on the video that hides while you watch."
              checked={settings.controls}
              onChange={(controls) => set({ controls })}
            />
          </div>
          <div className="row">
            <Switch
              label="Compare"
              description="Original and enhanced side by side with a draggable split."
              checked={settings.comparison}
              onChange={(comparison) => set({ comparison })}
            />
          </div>
          <div className="row">
            <Switch
              label="HUD"
              description="Live resolution, frame rate and GPU time."
              checked={settings.hud}
              onChange={(hud) => set({ hud })}
            />
          </div>
        </div>
      </Group>
    </>
  );
}

/** A real renderer on generated footage, split original | enhanced at one scale. */
function Preview({ settings }: { settings: SettingsModel }) {
  const frame = useRef<HTMLDivElement>(null);
  const renderer = useRef<VideoRenderer | undefined>(undefined);
  // The in-preview comparison slider is the real product control; keep its last position.
  const split = useRef(0.5);
  const [state, setState] = useState<"starting" | "running" | "failed">("starting");
  const [backend, setBackend] = useState("");
  const picture = PICTURE_KEYS.map((k) => settings[k]).join("|");
  const effective = (): SettingsModel => ({
    ...settings,
    enabled: true,
    comparison: true,
    split: split.current,
    controls: false,
    hud: false,
    skipAbove: 0,
    adaptive: false,
  });
  useEffect(() => {
    const host = frame.current!;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-label", "Generated preview footage");
    host.prepend(video);
    const source = fixtureStream(480, 270, 30, "preview");
    video.srcObject = source.stream;
    let live = true;
    void video
      .play()
      .then(async () => {
        if (!live) return;
        const r = new VideoRenderer(
          video,
          effective(),
          (p) => (isExtension ? chrome.runtime.getURL(p) : `./${p}`),
          (_s, patch) => {
            if (patch.split !== undefined) split.current = patch.split;
          },
          {
            layout: "preview",
            onState: (d) => {
              if (!live) return;
              setState(d.state === "active" ? "running" : d.state === "unavailable" ? "failed" : "starting");
              setBackend(d.backend ?? "");
            },
          },
        );
        renderer.current = r;
        await r.start();
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
      renderer.current?.dispose();
      renderer.current = undefined;
      source.stop();
      video.remove();
    };
  }, []);
  useEffect(() => {
    void renderer.current?.configure(effective());
  }, [picture]);
  return (
    <section className="screen" aria-label="Live preview">
      <div className="frame" ref={frame}>
        {state === "failed" && (
          <p className="placeholder">
            The preview needs WebGPU or WebGL. Enhancement may still work in video
            tabs; see Diagnostics.
          </p>
        )}
      </div>
      <p className="caption">
        Generated test footage at 480×270, enhanced live on this device
        {backend ? ` with ${backend}` : ""}. Drag the split on the picture to compare
        with the original.
      </p>
    </section>
  );
}

/* ---------- Websites ---------- */
function Websites({ store, edit }: { store: Store; edit: (origin: string) => void }) {
  const config = store.config!;
  const confirm = useConfirm();
  const [address, setAddress] = useState("");
  const [subdomains, setSubdomains] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const replace = useRef(false);
  const granted = (o: (typeof config.sites)[number]) => !!store.grants?.has(hostPattern(o));
  const remove = async (origin: string) => {
    const host = hostLabel(origin);
    const covered = config.sites.filter(
      (s) => s.origin !== origin && s.subdomains && host.endsWith(`.${hostLabel(s.origin)}`),
    );
    const ok = await confirm({
      title: `Remove ${host}?`,
      body: (
        <p>
          Enhancement stops on {host} immediately and Chrome's access for it is
          revoked.
          {covered.length > 0 &&
            ` Broader approvals that include it (${covered.map((s) => `*.${hostLabel(s.origin)}`).join(", ")}) are removed too.`}
        </p>
      ),
      confirm: "Remove website",
      danger: true,
    });
    if (ok) await store.run(() => request("remove", { origin }), `${host} removed.`);
  };
  const exportConfig = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ ...config, preferences: undefined }, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "webscaly-profiles.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importConfig = async (input: File) => {
    let imported: Configuration;
    try {
      if (input.size > 256000) throw new Error("This file is larger than 256 KB.");
      imported = normalizeConfiguration(JSON.parse(await input.text()));
    } catch (e) {
      store.reportError(`Could not read that file. ${(e as Error).message}`);
      return;
    }
    const mode = replace.current ? "replace" : "merge";
    if (mode === "replace") {
      const dropped = config.sites.filter(
        (s) => !imported.sites.some((i) => i.origin === s.origin),
      );
      const ok = await confirm({
        title: "Replace all websites and presets?",
        body: (
          <>
            <p>
              Your current profiles are replaced by the file
              {dropped.length ? ", and access is revoked for:" : "."}
            </p>
            {dropped.length > 0 && (
              <ul>
                {dropped.map((s) => (
                  <li key={s.origin}>{hostLabel(s.origin)}</li>
                ))}
              </ul>
            )}
          </>
        ),
        confirm: "Replace",
        danger: true,
      });
      if (!ok) return;
    }
    await store.run(
      () => request("import", { config: imported, mode }),
      `Imported ${imported.sites.length} website profile${imported.sites.length === 1 ? "" : "s"}. Approve each website before it can be enhanced.`,
    );
  };
  return (
    <>
      <Group title="Add a website" note="Chrome asks you to confirm. Embedded players need their own approval too.">
        <div className="rows">
          <div className="row wide">
            <form
              className="add-site"
              onSubmit={(e) => {
                e.preventDefault();
                void store.approve(address.trim(), subdomains).then((ok) => {
                  if (ok) setAddress("");
                });
              }}
            >
              <input
                className="input"
                aria-label="Website address"
                placeholder="https://www.example.com"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <button
                className="btn primary"
                disabled={store.busy || !address.trim() || !isExtension}
              >
                Add website
              </button>
            </form>
          </div>
          <div className="row">
            <Switch
              label="Include subdomains"
              description="Also covers hosts like player.example.com. Use only when a site needs it."
              checked={subdomains}
              onChange={setSubdomains}
            />
          </div>
        </div>
      </Group>
      <Group title={<>Websites<span className="count">{config.sites.length}</span></>}>
        <div className="rows">
          {!config.sites.length ? (
            <p className="empty">
              No websites yet. Open a video page and choose “Allow on this website”
              in the WebScaly popup.
            </p>
          ) : (
            config.sites.map((site) => {
              const host = hostLabel(site.origin);
              const ok = granted(site);
              return (
                <div className="row site-row" key={site.origin}>
                  <div className="text">
                    <span className="host">{host}</span>
                    <small>
                      {site.subdomains ? "Includes subdomains" : "This host only"} ·{" "}
                      {ALGORITHM_LABELS[site.settings.algorithm]} ·{" "}
                      {!store.grants
                        ? "Checking access…"
                        : !ok
                          ? "Access not granted"
                          : site.settings.enabled
                            ? "On"
                            : "Off"}
                    </small>
                  </div>
                  <div className="controls">
                    {store.grants && !ok && (
                      <button
                        className="btn small primary"
                        aria-label={`Approve ${host}`}
                        onClick={() => void store.approve(site.origin, site.subdomains, site.settings)}
                      >
                        Approve
                      </button>
                    )}
                    <button className="btn small" aria-label={`Edit ${host}`} onClick={() => edit(site.origin)}>
                      Edit
                    </button>
                    <button
                      className="btn small danger"
                      aria-label={`Remove ${host}`}
                      onClick={() => void remove(site.origin)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Group>
      <Group
        title="Back up and move"
        note="Profiles export as a small JSON file. Importing never grants access by itself; approve each website afterwards."
      >
        <div className="rows">
          <div className="row wide">
            <div className="controls" style={{ justifyContent: "flex-start" }}>
              <button className="btn" onClick={exportConfig}>
                Export profiles
              </button>
              <button
                className="btn"
                onClick={() => {
                  replace.current = false;
                  file.current?.click();
                }}
              >
                Import and merge
              </button>
              <button
                className="btn quiet"
                onClick={() => {
                  replace.current = true;
                  file.current?.click();
                }}
              >
                Replace from file…
              </button>
              <input
                ref={file}
                className="visually-hidden"
                type="file"
                accept="application/json"
                aria-label="Profile file"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importConfig(f);
                }}
              />
            </div>
          </div>
        </div>
      </Group>
    </>
  );
}

/* ---------- Presets ---------- */
function Presets({ store, target }: { store: Store; target: Target }) {
  const config = store.config!;
  const settings = settingsFor(config, target);
  const [name, setName] = useState("");
  const confirm = useConfirm();
  const scope = target ? hostLabel(target) : "default settings";
  const same = (picture: Partial<SettingsModel>) =>
    PICTURE_KEYS.every((k) => picture[k] === undefined || picture[k] === settings[k]);
  const save = (presets: Configuration["presets"]) =>
    store.run(() => request("presets", { presets }));
  return (
    <>
      <Group title="Built in" note={`Applying a preset changes the picture for ${scope}; player tools stay as they are.`}>
        <div className="rows">
          {BUILTIN_PRESETS.map((p) => (
            <div className="row" key={p.id}>
              <div className="text">
                <strong>{p.name}</strong>
                <small>
                  {p.description} {ALGORITHM_LABELS[p.picture.algorithm]} ·{" "}
                  {QUALITY_LABELS[p.picture.quality]}
                </small>
              </div>
              <div className="controls">
                <button
                  className={`btn small ${same(p.picture) ? "" : "primary"}`}
                  disabled={same(p.picture)}
                  onClick={() => store.patch(target, p.picture)}
                >
                  {same(p.picture) ? "In use" : "Apply"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Group>
      <Group title="Your presets" note="Save the current picture settings under a name, then apply them anywhere.">
        <div className="rows">
          <div className="row wide">
            <form
              className="add-site"
              onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (!n) return;
                void save([
                  ...config.presets.filter((p) => p.name !== n),
                  { name: n, settings: { ...DEFAULTS, ...pictureOf(settings) } },
                ]).then((ok) => ok && setName(""));
              }}
            >
              <input
                className="input"
                aria-label="Preset name"
                placeholder="Name, for example Late-night anime"
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn" disabled={!name.trim()}>
                Save preset
              </button>
            </form>
          </div>
          {config.presets.map((p) => (
            <div className="row" key={p.name}>
              <div className="text">
                <strong>{p.name}</strong>
                <small>
                  {ALGORITHM_LABELS[p.settings.algorithm]} ·{" "}
                  {QUALITY_LABELS[p.settings.quality]} · sharpen{" "}
                  {Math.round(p.settings.strength * 100)}%
                </small>
              </div>
              <div className="controls">
                <button
                  className="btn small"
                  disabled={same(pictureOf(p.settings))}
                  onClick={() => store.patch(target, pictureOf(p.settings))}
                >
                  Apply
                </button>
                <button
                  className="btn small danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete “${p.name}”?`,
                        body: <p>Profiles that used it keep their current settings.</p>,
                        confirm: "Delete preset",
                        danger: true,
                      })
                    )
                      void save(config.presets.filter((q) => q.name !== p.name));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </Group>
    </>
  );
}

/* ---------- Behavior ---------- */
const COMMAND_LABELS: Record<string, string> = {
  "toggle-enhancement": "Turn enhancement on or off",
  "toggle-compare": "Show or hide the comparison",
  "cycle-engine": "Switch to the next engine",
  snapshot: "Save a snapshot",
  "toggle-pause": "Pause or resume everywhere",
};
function Behavior({ store }: { store: Store }) {
  const prefs = store.config!.preferences;
  const [keys, setKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    void shortcuts().then(setKeys);
  }, []);
  return (
    <>
      <Group title="Everywhere">
        <div className="rows">
          <div className="row">
            <Switch
              label="Pause on every website"
              description="Stops all enhancement without changing any website's settings."
              checked={prefs.paused}
              disabled={!isExtension}
              onChange={(paused) => void store.preferences({ paused })}
            />
          </div>
          <div className="row">
            <Switch
              label="Battery saver"
              description="While unplugged, use Fast quality and at most 1080p."
              checked={prefs.batterySaver}
              disabled={!isExtension}
              onChange={(batterySaver) => void store.preferences({ batterySaver })}
            />
          </div>
        </div>
      </Group>
      <Group
        title="Keyboard shortcuts"
        note="Shortcuts act on the video in the current tab. Chrome lets you change them."
        aside={
          <button className="link" style={{ marginLeft: 12, fontSize: 13 }} onClick={openShortcutSettings}>
            Change shortcuts
          </button>
        }
      >
        <div className="rows">
          {Object.entries(COMMAND_LABELS).map(([name, label]) => (
            <div className="row" key={name}>
              <div className="text">
                <strong>{label}</strong>
              </div>
              <div className="controls">
                {keys[name] ? <Shortcut keys={keys[name]} /> : <span className="muted">Not set</span>}
              </div>
            </div>
          ))}
        </div>
      </Group>
      <Group
        title="Compatibility"
        note="What can and cannot be enhanced, and why."
      >
        <div className="rows">
          <Row wide>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              Chrome 121 or newer with WebGPU runs every engine; without it,
              Spatial Detail runs on WebGL. Embedded players need approval for
              both the page and the player's own website. Protected (DRM)
              video, closed player internals and some cross-origin players
              block direct access; the compatibility player can enhance a
              shared tab instead. Fullscreen from WebScaly's toolbar keeps the
              enhanced picture; a player's own fullscreen may show the
              original.
            </p>
          </Row>
          <Row title="GPU benchmark" note="Measures each engine on generated frames.">
            <a className="btn small" href="./benchmark.html" target="_blank" rel="noreferrer">
              Open benchmark
            </a>
          </Row>
        </div>
      </Group>
    </>
  );
}

/* ---------- Diagnostics ---------- */
interface DeviceFacts {
  webgpu: boolean;
  adapter?: string;
  timestamp?: boolean;
  maxTexture?: number;
  fallback?: boolean;
}
async function deviceFacts(): Promise<DeviceFacts> {
  try {
    if (!navigator.gpu) return { webgpu: false };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { webgpu: false };
    const info =
      (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info ??
      (await (adapter as GPUAdapter & { requestAdapterInfo?: () => Promise<GPUAdapterInfo> }).requestAdapterInfo?.());
    const name = [info?.vendor, info?.architecture].filter(Boolean).join(" · ");
    return {
      webgpu: true,
      adapter: name || info?.description || "Unnamed adapter",
      timestamp: adapter.features.has("timestamp-query"),
      maxTexture: adapter.limits.maxTextureDimension2D,
      fallback: (info as GPUAdapterInfo & { isFallbackAdapter?: boolean })?.isFallbackAdapter,
    };
  } catch {
    return { webgpu: false };
  }
}
function DiagnosticsPage({ store }: { store: Store }) {
  const [device, setDevice] = useState<DeviceFacts>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void deviceFacts().then(setDevice);
  }, []);
  const status = store.status;
  const browser = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? "Unknown";
  const copy = async () => {
    const report = {
      webscaly: VERSION,
      chrome: browser,
      device,
      tab: status && {
        videos: status.videos,
        hiddenVideos: status.hiddenVideos,
        renderers: status.renderers,
        frames: status.frames.map((f) => ({ videos: f.videos, renderers: f.renderers })),
      },
    };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <>
      {store.lastError && (
        <Group title="Last action error">
          <pre>{store.lastError}</pre>
          <div>
            <button className="btn small" onClick={store.clearError}>
              Clear error
            </button>
          </div>
        </Group>
      )}
      <Group title="This device">
        <dl className="facts">
          <Fact label="Chrome" value={browser} />
          <Fact
            label="WebGPU"
            value={device === undefined ? "Checking…" : device.webgpu ? (device.fallback ? "Software fallback" : "Available") : "Unavailable"}
          />
          <Fact label="Graphics" value={device?.adapter ?? (device ? "—" : "…")} />
          <Fact label="GPU timing" value={device?.timestamp === undefined ? "—" : device.timestamp ? "Reported" : "Not reported"} />
          <Fact label="Largest texture" value={device?.maxTexture ? `${device.maxTexture} px` : "—"} />
        </dl>
      </Group>
      <Group
        title="Current video tab"
        aside={
          status ? (
            <button className="link" style={{ marginLeft: 12, fontSize: 13 }} onClick={() => void copy()}>
              {copied ? "Copied" : "Copy report"}
            </button>
          ) : undefined
        }
        note={
          status
            ? `${status.videos} visible player${status.videos === 1 ? "" : "s"} · ${status.hiddenVideos ?? 0} hidden video${status.hiddenVideos === 1 ? "" : "s"}`
            : "Open Settings from the popup on your video tab to see its players here."
        }
      >
        {status?.renderers.map((r, i) => <RendererFacts key={i} d={r} />)}
        {status && (
          <Disclosure summary="Raw status">
            <pre>{JSON.stringify(status, null, 2)}</pre>
          </Disclosure>
        )}
      </Group>
      <Group title="How numbers are measured">
        <p className="muted" style={{ lineHeight: 1.6, maxWidth: "72ch" }}>
          Source frame rate comes from decoded media timestamps. Enhanced frame
          rate counts frames submitted for enhancement, not display refresh. GPU
          time is sampled every tenth frame when the graphics driver reports it.
          Frames that arrive while the GPU is still busy are skipped rather than
          queued, so playback never falls behind. Audio stays with the website's
          player.
        </p>
      </Group>
    </>
  );
}
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function RendererFacts({ d }: { d: Diagnostics }) {
  const budget = d.sourceFps > 0 ? 1000 / d.sourceFps : 0;
  return (
    <dl className="facts">
      <Fact label="State" value={d.state} />
      <Fact label="Engine" value={ALGORITHM_LABELS[d.algorithm as Algorithm] ?? d.algorithm} />
      <Fact label="Backend" value={d.backend || "—"} />
      <Fact label="Size" value={d.resolution || "—"} />
      <Fact label="Source" value={`${d.sourceFps.toFixed(2)} fps`} />
      <Fact label="Enhanced" value={`${d.outputFps.toFixed(1)} fps`} />
      <Fact label="GPU" value={d.gpuMs === null ? "—" : budget ? `${d.gpuMs.toFixed(2)} of ${budget.toFixed(1)} ms` : `${d.gpuMs.toFixed(2)} ms`} />
      <Fact label="Skipped" value={`${d.dropped} of ${d.decoded + d.dropped}`} />
      <Fact label="Content" value={d.hint === "animation" ? "Animation-like" : d.hint === "live" ? "Camera-like" : "—"} />
      {d.adaptive && <Fact label="Load" value={d.adaptive} />}
      {d.state !== "active" && <Fact label="Message" value={d.message} />}
    </dl>
  );
}

/* ---------- Welcome ---------- */
function Welcome({ store, done }: { store: Store; done: () => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    void shortcuts().then(setKeys);
  }, []);
  return (
    <>
      <Preview settings={store.config!.defaults} />
      <Group title="Three steps">
        <div className="rows">
          <div className="row wide">
            <ol className="steps">
              <li>
                <div>
                  <strong>Pin WebScaly and open a video</strong>
                  <p>Use the puzzle icon in Chrome's toolbar to pin WebScaly, then open any page with a video.</p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Choose “Allow on this website”</strong>
                  <p>Chrome asks once. WebScaly only ever runs on websites you allow, and you can remove them here at any time.</p>
                </div>
              </li>
              <li>
                <div>
                  <strong>Watch</strong>
                  <p>
                    The toolbar badge shows <b>ON</b> while a video is enhanced. Pick an engine in the popup
                    {keys["toggle-enhancement"] ? (
                      <>
                        , or press <Shortcut keys={keys["toggle-enhancement"]} /> to switch it off and on
                      </>
                    ) : null}
                    .
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </Group>
      <div>
        <button className="btn primary" onClick={done}>
          Got it
        </button>
      </div>
    </>
  );
}
