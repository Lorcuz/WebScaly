import { useEffect, useState } from "react";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconCamera,
  IconCpu,
  IconEye,
  IconLayoutColumns,
  IconPlayerPause,
  IconPlayerPlay,
  IconSettings,
  IconShieldCheck,
} from "@tabler/icons-react";
import {
  ALGORITHM_LABELS,
  BUILTIN_PRESETS,
  PICTURE_KEYS,
  QUALITY_LABELS,
  hostLabel,
  hostPattern,
  pictureOf,
  profileFor,
  siteOrigin,
  type Algorithm,
  type Quality,
  type Settings,
} from "../shared/settings";
import type { Diagnostics, PlayerStatus } from "../shared/player-status";
import { useStore } from "./state";
import {
  Disclosure,
  Feedback,
  Segmented,
  Shortcut,
  Slider,
  Switch,
} from "./components";
import {
  isExtension,
  request,
  shortcuts,
  tabAction,
  VERSION,
} from "./client";

export const ENGINE_OPTIONS = [
  { value: "spatial" as const, label: "Spatial" },
  { value: "anime4k" as const, label: "Anime4K" },
  { value: "fsrcnnx" as const, label: "FSRCNNX" },
];
export const QUALITY_OPTIONS = (["fast", "balanced", "quality"] as Quality[]).map(
  (value) => ({ value, label: QUALITY_LABELS[value] }),
);
export type Light = "active" | "idle" | "blocked" | "paused";
export const LIGHT_LABEL: Record<Light, string> = {
  active: "Enhancing",
  idle: "Standby",
  blocked: "Blocked",
  paused: "Paused",
};
export function lightOf(status: PlayerStatus | null | undefined, paused: boolean): Light {
  const states = status?.renderers.map((r) => r.state) ?? [];
  if (paused) return "paused";
  if (states.includes("active")) return "active";
  if (states.includes("unavailable")) return "blocked";
  return "idle";
}
const ms = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
const matches = (settings: Settings, picture: Partial<Settings>) =>
  PICTURE_KEYS.every((k) => picture[k] === undefined || picture[k] === settings[k]);
function firstSentence(text: string) {
  const sentence = text.split(/(?<=\.)\s/)[0];
  return sentence.length > 150 ? sentence.slice(0, 147) + "…" : sentence;
}

export function Popup() {
  const store = useStore(1000);
  const { config, tab, grants, status, busy } = store;
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    void shortcuts().then(setKeys);
  }, []);
  const light = lightOf(status, !!config?.preferences.paused);
  if (!config || !tab)
    return (
      <main className="popup" aria-busy="true">
        <Header light="idle" />
        <div className="skeleton" style={{ height: 112 }} />
        <div className="skeleton" style={{ height: 96 }} />
      </main>
    );
  let origin = "";
  try {
    origin = tab.url ? siteOrigin(tab.url) : "";
  } catch {
    /* Not an http(s) page. */
  }
  const host = origin ? hostLabel(origin) : "";
  const current = tab.url ? profileFor(tab.url, config) : undefined;
  const checked = grants !== undefined;
  const allowed = !!current && !!grants?.has(hostPattern(current));
  const paused = config.preferences.paused;
  // An embedded player uses its own profile; edit the one that is playing.
  const playing = status?.frames.find((f) => f.videos > 0 && f.origin)?.origin;
  const selected = (playing && profileFor(playing, config)) || current;
  const settings = selected?.settings ?? config.defaults;
  const target = selected?.origin;
  const renderer: Diagnostics | undefined =
    status?.renderers.find((r) => r.state === "active") ?? status?.renderers[0];
  const embeds = status?.embeds.filter((e) => !e.approved).slice(0, 2) ?? [];
  const editable = allowed && !!target;
  const set = (patch: Partial<Settings>, delay = 0) => store.patch(target, patch, delay);
  const hint = renderer?.state === "active" ? renderer.hint : "";
  const suggestion: { engine: Algorithm; text: string } | null =
    hint === "animation" && settings.algorithm !== "anime4k"
      ? { engine: "anime4k", text: "Looks like animation." }
      : hint === "live" && settings.algorithm === "anime4k"
        ? { engine: "fsrcnnx", text: "Looks like camera footage." }
        : null;
  const openSettings = () => {
    const query = new URLSearchParams();
    if (tab.id !== undefined) query.set("tab", String(tab.id));
    if (target) query.set("profile", target);
    if (isExtension)
      void chrome.tabs.create({
        url: chrome.runtime.getURL(`options.html?${query}`),
      });
    else location.assign("./options.html");
  };
  const command = (name: string) =>
    store.run(() => request("command", { command: name, tabId: tab.id }));
  return (
    <main className="popup">
      <Header light={light}>
        <button
          className="iconbtn"
          aria-label={paused ? "Resume WebScaly" : "Pause WebScaly everywhere"}
          aria-pressed={paused}
          data-help={paused ? "Resume enhancement on every approved website." : "Pause enhancement on every website without changing settings."}
          disabled={!isExtension}
          onClick={() => void store.preferences({ paused: !paused })}
        >
          {paused ? (
            <IconPlayerPlay size={18} stroke={1.8} aria-hidden="true" />
          ) : (
            <IconPlayerPause size={18} stroke={1.8} aria-hidden="true" />
          )}
        </button>
        <button className="iconbtn" aria-label="Settings" onClick={openSettings}>
          <IconSettings size={20} stroke={1.7} aria-hidden="true" />
        </button>
      </Header>
      {!isExtension && <p className="preview-label">Interface preview</p>}

      <section className="site" aria-label="This website">
        <strong className="host" title={host}>
          {host || "No website open"}
        </strong>
        <span className="state">
          {allowed && !paused && !confirming ? (
            <Switch
              className="compact"
              label={<span className="visually-hidden">Enhancement</span>}
              checked={settings.enabled}
              disabled={!editable}
              onChange={(enabled) => set({ enabled })}
            />
          ) : !checked || allowed ? null : current ? (
            <span className="pill warn">Needs approval</span>
          ) : origin ? (
            <span className="pill">Off</span>
          ) : null}
        </span>
        {!origin ? (
          <p className="actions muted">Open a page with a video to start.</p>
        ) : !checked ? null : !allowed ? (
          <div className="actions">
            <button
              className="btn primary"
              disabled={!isExtension || busy}
              onClick={() =>
                void store.approve(
                  current?.origin ?? origin,
                  current?.subdomains ?? false,
                  current?.settings ?? config.defaults,
                )
              }
            >
              {busy ? "Waiting for Chrome…" : "Allow on this website"}
            </button>
          </div>
        ) : confirming ? (
          <div className="confirm" role="group" aria-label="Confirm removal">
            <span>
              Remove access to {host}? Enhancement stops at once; you can add it
              back later.
            </span>
            <div>
              <button
                className="btn danger small"
                onClick={() => {
                  setConfirming(false);
                  void store.run(
                    () => request("remove", { origin }),
                    "Website access removed.",
                  );
                }}
              >
                Remove access
              </button>
              <button className="btn quiet small" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <div className="actions slim">
            {paused ? (
              <>
                <span className="pill">Paused everywhere</span>
                <button
                  className="link"
                  onClick={() => void store.preferences({ paused: false })}
                >
                  Resume
                </button>
              </>
            ) : (
              <span className="pill ok">Allowed</span>
            )}
            <button
              className="link subtle"
              style={{ marginLeft: "auto" }}
              aria-label="Remove website access"
              onClick={() => setConfirming(true)}
            >
              Remove access
            </button>
          </div>
        )}
      </section>

      {allowed && !paused && (
        <Stage
          status={status}
          renderer={renderer}
          enabled={settings.enabled}
          openViewer={() =>
            void chrome.tabs.create({
              url: chrome.runtime.getURL(`viewer.html?source=${tab.id}`),
            })
          }
        />
      )}

      {allowed &&
        embeds.map((e) => (
          <div className="embed" key={e.origin}>
            <span>
              Player on <strong>{hostLabel(e.origin)}</strong> needs access too.
            </span>
            <button
              className="btn small"
              aria-label={`Allow ${hostLabel(e.origin)}`}
              disabled={busy}
              onClick={() => void store.approve(e.origin, false, settings)}
            >
              Allow
            </button>
          </div>
        ))}

      {!allowed && checked && (
        <ul className="explain" aria-label="How WebScaly works">
          <li>
            <IconShieldCheck size={16} stroke={1.8} aria-hidden="true" />
            Runs only on websites you allow, and you can remove them any time.
          </li>
          <li>
            <IconCpu size={16} stroke={1.8} aria-hidden="true" />
            Video is enhanced on this device. Nothing is uploaded.
          </li>
          <li>
            <IconPlayerPlay size={16} stroke={1.8} aria-hidden="true" />
            The website's player keeps playback and sound.
          </li>
        </ul>
      )}
      {allowed && (<>
      <section className="picture" aria-label="Picture">
        <span className="label">Engine</span>
        <Segmented
          label="Engine"
          value={settings.algorithm}
          options={ENGINE_OPTIONS}
          disabled={!editable}
          help="Spatial Detail is lightest. Anime4K suits animation. FSRCNNX restores camera footage."
          onChange={(algorithm) => set({ algorithm })}
        />
        <span className="label">Quality</span>
        <Segmented
          label="Quality"
          value={settings.quality}
          options={QUALITY_OPTIONS}
          disabled={!editable}
          help="Fast is lightest. Quality uses the sharpest upscaling."
          onChange={(quality) => set({ quality })}
        />
        {selected && current && selected.origin !== current.origin && (
          <span className="player-note">Settings for the player on {hostLabel(selected.origin)}</span>
        )}
      </section>
      {suggestion && editable && (
        <div className="suggestion">
          <span>
            {suggestion.text} <strong>{ALGORITHM_LABELS[suggestion.engine]}</strong>{" "}
            suits it.
          </span>
          <button
            className="btn small"
            onClick={() => set({ algorithm: suggestion.engine })}
          >
            Use {ALGORITHM_LABELS[suggestion.engine]}
          </button>
        </div>
      )}

      <Disclosure
        summary="Fine-tune"
        value={
          [...BUILTIN_PRESETS.map((p) => ({ name: p.name, picture: p.picture as Partial<Settings> })), ...config.presets.map((p) => ({ name: p.name, picture: pictureOf(p.settings) }))].find((p) => matches(settings, p.picture))?.name ??
          `Sharpen ${Math.round(settings.strength * 100)} · Deband ${Math.round(settings.deband * 100)}`
        }
      >
        <div className="block" role="group" aria-label="Presets">
          <span className="label">Presets</span>
          <div className="chips">
            {BUILTIN_PRESETS.map((p) => (
              <button
                key={p.id}
                className="chip"
                aria-pressed={matches(settings, p.picture)}
                disabled={!editable}
                data-help={p.description}
                onClick={() => set(p.picture)}
              >
                {p.name}
              </button>
            ))}
            {config.presets.slice(0, 3).map((p) => (
              <button
                key={p.name}
                className="chip"
                aria-pressed={matches(settings, pictureOf(p.settings))}
                disabled={!editable}
                onClick={() => set(pictureOf(p.settings))}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Sharpening"
          value={settings.strength}
          disabled={!editable}
          onChange={(strength) => set({ strength }, 150)}
        />
        <Slider
          label="Denoise"
          value={settings.denoise}
          disabled={!editable}
          onChange={(denoise) => set({ denoise }, 150)}
        />
        <Slider
          label="Deband"
          value={settings.deband}
          disabled={!editable}
          help="Smooths stepped gradients in skies and shadows caused by compression."
          onChange={(deband) => set({ deband }, 150)}
        />
        <Slider
          label="Vibrance"
          value={settings.vibrance}
          min={-1}
          max={1}
          disabled={!editable}
          format={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`}
          onChange={(vibrance) => set({ vibrance }, 150)}
        />
      </Disclosure>

      <section className="tools" aria-label="Player tools">
        <button
          className="tool"
          aria-pressed={settings.comparison}
          disabled={!editable}
          data-help="Original and enhanced side by side, with a draggable split."
          onClick={() => set({ comparison: !settings.comparison })}
        >
          <IconLayoutColumns size={18} stroke={1.7} aria-hidden="true" />
          Compare
        </button>
        <button
          className="tool"
          disabled={renderer?.state !== "active"}
          data-help="Hold to see the original video."
          onPointerDown={() => void tabAction(tab.id, "original", true)}
          onPointerUp={() => void tabAction(tab.id, "original", false)}
          onPointerLeave={(e) => {
            if (e.buttons) void tabAction(tab.id, "original", false);
          }}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat)
              void tabAction(tab.id, "original", true);
          }}
          onKeyUp={() => void tabAction(tab.id, "original", false)}
        >
          <IconEye size={18} stroke={1.7} aria-hidden="true" />
          Original
        </button>
        <button
          className="tool"
          aria-pressed={settings.controls}
          disabled={!editable}
          data-help="Compact controls on the video. They hide while you watch."
          onClick={() => set({ controls: !settings.controls })}
        >
          <IconAdjustmentsHorizontal size={18} stroke={1.7} aria-hidden="true" />
          Controls
        </button>
        <button
          className="tool"
          aria-pressed={settings.hud}
          disabled={!editable}
          data-help="Live speed and resolution numbers on the video."
          onClick={() => set({ hud: !settings.hud })}
        >
          <IconActivity size={18} stroke={1.7} aria-hidden="true" />
          HUD
        </button>
        <button
          className="tool"
          disabled={renderer?.state !== "active"}
          data-help="Save the current enhanced frame as an image."
          onClick={() => void command("snapshot")}
        >
          <IconCamera size={18} stroke={1.7} aria-hidden="true" />
          Snapshot
        </button>
      </section>

      </>)}
      <Feedback error={store.error} notice={store.notice} compact />
      <footer>
        <span>
          {keys["toggle-enhancement"] ? (
            <>
              <Shortcut keys={keys["toggle-enhancement"]} /> turns it on or off
            </>
          ) : (
            "Processed on this device"
          )}
        </span>
        <span>{VERSION}</span>
      </footer>
    </main>
  );
}

function Header({ light, children }: { light: Light; children?: React.ReactNode }) {
  return (
    <header className="top">
      <img src="./icons/32.png" width="24" height="24" alt="" />
      <h1>WebScaly</h1>
      <span className="light" data-state={light} role="status">
        <span className="dot" aria-hidden="true" />
        {LIGHT_LABEL[light]}
      </span>
      {children}
    </header>
  );
}

function Stage({
  status,
  renderer,
  enabled,
  openViewer,
}: {
  status: PlayerStatus | null | undefined;
  renderer?: Diagnostics;
  enabled: boolean;
  openViewer: () => void;
}) {
  if (status === undefined)
    return <div className="skeleton" style={{ height: 96 }} aria-hidden="true" />;
  if (renderer?.state === "active") {
    const budget = renderer.sourceFps > 0 ? 1000 / renderer.sourceFps : 0,
      share =
        renderer.gpuMs !== null && budget
          ? Math.min(100, (renderer.gpuMs / budget) * 100)
          : 0;
    const engine =
      ALGORITHM_LABELS[renderer.algorithm as Algorithm] ?? renderer.algorithm;
    return (
      <section className="stage" aria-label="Live enhancement">
        <div className="stat">
          <span className="label">Enhancing · {renderer.backend}</span>
          <span className="label">
            {engine}
            {renderer.quality ? ` · ${QUALITY_LABELS[renderer.quality as Quality] ?? ""}` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="big">{renderer.resolution}</span>
          <span className="value">
            {renderer.outputFps ? renderer.outputFps.toFixed(1) : renderer.sourceFps.toFixed(1)} fps
          </span>
        </div>
        <div className="stat">
          <span className="label">
            {renderer.gpuMs === null
              ? "GPU time not reported"
              : budget
                ? `GPU ${ms(renderer.gpuMs)} ms of ${ms(budget)} ms frame`
                : `GPU ${ms(renderer.gpuMs)} ms`}
          </span>
          <span className="label">{renderer.dropped} skipped</span>
        </div>
        <div
          className="budget"
          role="meter"
          aria-label="GPU time against the frame budget"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share)}
        >
          <i className={share > 85 ? "hot" : ""} style={{ width: `${share}%` }} />
        </div>
        {renderer.adaptive && <p className="note">{renderer.adaptive}</p>}
      </section>
    );
  }
  if (renderer?.state === "unavailable")
    return (
      <section className="stage blocked" aria-label="Enhancement status">
        <span className="label">Direct access blocked</span>
        <p>{firstSentence(renderer.message)}</p>
        <div>
          <button className="btn small" onClick={openViewer}>
            Open compatibility player
          </button>
        </div>
      </section>
    );
  const [title, text] =
    renderer?.state === "skipped"
      ? ["Already sharp", renderer.message]
      : !enabled || renderer?.state === "disabled"
        ? ["Enhancement is off", "Turn it on above to enhance this video."]
        : renderer && ["loading", "waiting"].includes(renderer.state)
          ? ["Preparing", renderer.message]
          : status?.videos
            ? ["Starting", "A player was found. Enhancement starts in a moment."]
            : [
                "No playing video",
                "Start the video. A player inside an embedded frame may need its own approval below.",
              ];
  return (
    <section className="stage dark" aria-label="Enhancement status">
      <span className="label">{title}</span>
      <p>{text}</p>
    </section>
  );
}
