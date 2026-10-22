# Architecture

## Worker (`src/extension/background.ts`)

The Manifest V3 worker owns website approval transactions, configuration, content-script registration, keyboard commands and the per-tab toolbar badge. `permissions.request` starts synchronously in the message listener before storage or queued work. A session-stored intent lets approval finish after the popup closes or the worker restarts; permission denial never creates an approval. Configuration version 2 accepts version-1 imports. Fields added in 0.4 (deband, colour, skip-above, adaptive, preferences) are filled with defaults by normalization, so older configurations and exports keep working.

Writes are serialized; read-only requests (authorization, tab status, reports, removal impact) are answered immediately. `reconcile` keeps a fingerprint of approved scopes and grants: only a change of access re-registers scripts, injects into open tabs and broadcasts `webscaly:refresh`. Settings-only edits reach content scripts through their own storage listener. Removal broadcasts `webscaly:invalidate` before revoking grants. The frame registry in session storage is written only when a frame is new or navigated.

Commands (`toggle-enhancement`, `toggle-compare`, `cycle-engine`, `snapshot`, `toggle-pause`) resolve the profiles that are actually rendering in the active tab from the frame registry and tab status, apply the change and confirm it with an on-video toast. Content scripts report their state; the worker combines frames into one badge per tab (ON, ! or II).

## Content script (`src/extension/content.ts`)

Each frame authenticates its own origin and the top-level page against profiles and Chrome grants, then caches the result. It re-authorizes on refresh broadcasts, page restore or after 30 seconds. Storage events apply settings and preferences locally without a worker round trip. Video discovery caches the document and open shadow roots, walks additions in bounded batches and revisits late custom-element hosts. It enhances the largest visible decoded video, and a second one only when it is a real player (at least 320×180 and 40% of the largest), so hover previews cost no GPU time. Global pause disposes renderers; a disabled site keeps them only while its in-player toolbar is shown.

## Renderer (`src/core/renderer.ts`, `enhancement.ts`)

The renderer follows `requestVideoFrameCallback`, processes each decoded frame once and skips frames while the GPU is still busy, so playback never queues behind it. Its plan comes from the saved settings, the adaptive governor level and battery saver (`src/core/governor.ts`).

WebGPU pipeline per frame:

1. **Capture:** the external video texture is cropped and resized into the working surface, averaging four taps for large reductions.
2. **Prefilter:** edge-aware denoise and deband into a half-float surface.
3. **Engine:** passthrough for Spatial Detail, or the Anime4K / FSRCNNX networks.
4. **Scale:** to the display size with bilinear, Catmull-Rom or Lanczos-2 (anti-ringing) according to Quality; reductions use a four-tap box.
5. **Present:** contrast-adaptive sharpening, vibrance/contrast/brightness and the comparison split, drawn to the canvas over the video.

The WebGL fallback renders Spatial Detail in one pass with bicubic upscaling and the colour controls. A failed neural initialization falls back to Spatial Detail; device loss retries WebGPU once, then uses WebGL. A non-blocking 96×54 thumbnail readback every three seconds feeds the content hint (`src/core/content-hint.ts`), which only produces suggestions. Snapshots render one frame without the comparison split and read the canvas in the same task.

## Overlay (`src/core/overlay.ts`, `src/ui/frame.ts`)

The canvas, divider, HUD and toasts live in an open shadow root next to the video and never receive pointer input. Layout follows a ResizeObserver, scroll and resize events and a light 500 ms check, not every video frame. Interactive controls are bundled extension frames sized exactly to their content. They fade after 2.6 s without pointer activity but stay hit-testable, so hovering reveals them. The overlay accepts only messages from its own frames, with a per-renderer token and a fixed action schema. Fullscreen from the toolbar uses the player container so the enhanced canvas stays visible.

## Interface (`src/ui`)

Popup and settings share a store hook (`state.ts`) with optimistic updates and debounced slider commits, a small component set (`components.tsx`) and one stylesheet (`styles.css`) in the slate-and-mint palette. Only `ui-frame.html` is web accessible. Fonts, scripts and shaders are bundled; there is no remote code.
