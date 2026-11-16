# Performance

## How WebScaly paces work

Enhancement follows decoded video callbacks, keeping the native frame rate and audio. Frames are skipped, never queued, while the GPU is busy. Source FPS uses media timestamps; enhanced FPS counts decoded frames submitted for processing, not display scanout. GPU time comes from optional timestamp queries, one sample every tenth processed frame; the browser does not expose GPU utilization or VRAM.

Adaptive performance watches two-second windows. When more than 15% of frames are skipped, or GPU time exceeds 85% of the frame budget, for two windows in a row, it steps down: Quality → Balanced → Fast, then a 25% smaller working and output size, then Spatial Detail. Each step is shown in the popup and HUD and lasts until the settings or the video source change. A step that changes only uniforms is applied in place without rebuilding surfaces. Battery saver applies Fast quality and a 1080p limit while unplugged.

Neural working surfaces stay bounded (720p input, 2× output) independently of display size; spatial work is bounded to about 1080p. Up to two real players per frame are processed. Settings edits do not trigger script re-registration, tab-wide broadcasts or per-frame re-authorization, and the overlay does not force layout on every video frame.

## Changes in 0.5.0

- **Skipped rescale.** When the enhanced picture already has the output size, the scale pass is skipped.
- **Anime4K dispatch.** Anime4K's depth-to-space pass no longer launches four times the needed workgroups.
- **FSRCNNX.** FSRCNNX reuses surfaces and compiles its passes concurrently.
- **Device release.** The GPU device is released 15 s after the last renderer on a page stops.
- **Idle pages.** A hidden page and a page without videos no longer run the content-script heartbeat or re-authorization.
- **Background tabs.** A tab hidden for 60 s releases its pipeline (and, after the 15 s grace, the device); it rebuilds when shown again, so the native picture shows for the short time the rebuild takes.
- **Resize in place.** A player resize or fullscreen toggle resizes only the display-size surfaces; Anime4K adds or drops only its 2× stage.
- **WebGL.** Retired contexts are released explicitly, so repeated restarts no longer hit Chrome's active-context limit; a lost context recovers.
- **Discovery.** Late shadow-root discovery has no fixed ceiling and spends at most about 3 ms per heartbeat; hover previews get no renderer.
- **Off-screen preview and HUD.** The Settings preview pauses when it is off-screen, and HUD numbers refresh at 4 Hz instead of on every frame.

## Measurements

**Setup.** One Windows 11 desktop with an NVIDIA GeForce RTX 4060 Ti and Google Chrome 157. A benchmark page drives WebScaly's own renderer on locally generated 720p30, 1080p30 and 1080p60 video. The old and new builds were bundled from source and run in the same browser, alternating old, new, old, new; each figure is the median of two sessions per build unless stated otherwise. The background-tab figures come from the installed extension in a real background tab. The benchmark harness is not part of the public source, so these figures cannot be reproduced from this repository alone.

**Limits.** One GPU, one operating system and one browser version. AMD and Intel GPUs, laptops on battery, other operating systems and live streaming websites were not measured. Memory figures compare the same scenario across builds, not scenarios with each other.

**First round** (the previous development build against the first half of this work, measured 2026-11-14):

- Spatial Detail GPU time per frame fell from 0.30–0.33 ms to 0.13 ms at 1:1 output.
- Anime4K was 4–11% faster.
- FSRCNNX's first frame arrived after 454 ms instead of 1087 ms. Absolute start-up times varied about 2× between days for identical code, so only the comparison within one session is meaningful.
- Up to 296 MB of dedicated GPU memory was returned 20–28 s after playback stopped (one long session per build); the previous build kept it until the tab closed.
- Frame rate and pacing were unchanged.

**Second round** (measured 2026-11-16; the build measured was the last one before a final review round, whose changes touch only error paths, worker promise handling and viewer selection, none of which runs per frame):

- **Resize and fullscreen.** 6 transitions per engine and session (720p30 source, player 960×540 ↔ 1920×1080). The time without enhancement per transition fell from 4–25 ms (median; worst 238 ms) to 0. Pipelines created fell from 27 / 111 / 87 to 0 / 30 / 0 (Spatial / Anime4K / FSRCNNX).
- **Background tab.** After 80 s in the background, dedicated GPU memory fell from 155 MB to 99 MB, the same level as without the extension, and private memory fell by 68 MB (1080p30, Spatial Detail; one run per build). CPU in a background tab was already about 0 before this change, because Chrome stops delivering frames to hidden pages, so the saving is memory only.
- **Soak.** 240 s of engine switches, resizes, slider edits and source swaps: memory levels off after about 2 minutes in both builds, the JavaScript heap stays at about 4.4 MB, and after teardown GPU memory equals the level without WebScaly. No leak was found.
- **Playback.** Frame rate, dropped frames, pacing and GPU time per frame were unchanged, as expected: this round changed no per-frame work.

## In-extension benchmark

The in-extension benchmark (`benchmark.html`) measures each engine on a synthetic 720p frame scaled to 1080p with sequential queue completion. It is not a streaming-video FPS guarantee. Device information shown there stays on your computer and is not uploaded.
