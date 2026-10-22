# Changelog

## 0.4.0 — 20 October 2026

### Picture
- New image pipeline for every engine: anti-aliased capture, a half-float cleanup stage (edge-aware denoise and a new **Deband** filter), the engine, a display-size scaler and a final pass with contrast-adaptive sharpening applied after upscaling.
- **Quality** now matters for every engine: Fast uses bilinear scaling, Balanced Catmull-Rom bicubic, Quality Lanczos-2 with anti-ringing. Spatial Detail no longer relies on a bilinear upscale.
- New **Vibrance**, **Contrast** and **Brightness** controls; sharpening, denoise and deband now apply to every engine.
- The WebGL fallback gains bicubic upscaling and the colour controls.

### Smarter playback
- **Adaptive performance:** when the graphics card falls behind, WebScaly steps down quality, then size, then engine, and says so in the popup and HUD.
- **Skip sharp videos** above a chosen resolution, **battery saver** while unplugged, and **pause everywhere**.
- Content-aware suggestions: the popup offers Anime4K for animation-like video and FSRCNNX for camera footage. It never switches by itself.
- **Snapshots:** save the current enhanced frame as a PNG. **Hold to show original** from the popup or the player toolbar.
- One WebGPU retry after a graphics-driver reset before falling back to WebGL.

### Controls
- **Keyboard shortcuts:** turn enhancement on or off (Alt+Shift+E), toggle the split comparison (Alt+Shift+S), switch engine mode (Alt+Shift+M), plus snapshot and pause without default keys. All are changeable at chrome://extensions/shortcuts.
- **Toolbar badge** shows ON, ! (blocked) or II (paused) per tab.
- **Built-in presets** (Anime, Live action, Low-res rescue, Battery friendly) next to your own.
- The in-player toolbar is compact, hides while you watch, and adds engine switching, snapshot, hold-original and fullscreen that keeps the enhanced picture.

### Interface
- Redesigned popup, settings and compatibility player in the original dark slate and mint, now flatter and quieter. The popup shows engine, resolution, speed and GPU time at a glance and fits without scrolling.
- Settings sections: Enhancement (with a live before/after preview), Websites, Presets, Behavior, Diagnostics, About and a Getting started page on first install.
- Removing a website asks for confirmation. Imports merge by default; replacing everything is a separate, confirmed action.

### Fixes
- Changing a setting no longer re-registers scripts, messages every open tab and re-authorizes every frame; edits apply locally and instantly.
- The player overlay no longer recalculates layout on every video frame.
- The controls frames are sized to their buttons, so their transparent area no longer blocks clicks on the video.
- Small hover previews no longer start a second renderer.
- The on-video status message no longer grows each time the video pauses.
- A settings link to a removed website falls back visibly to the defaults.
- Version numbers come from the manifest.
- Plain `http://` websites work again. The player overlay used an API that browsers expose only on secure pages, so enhancement never started there (since 0.3.0). Browsers also expose WebGPU only on secure pages, so `http://` websites use the WebGL Spatial Detail fallback.
- Seeking or a buffering pause no longer tears down and rebuilds the renderer, which had reset the comparison position and restarted the GPU pipeline.
- Toasts appear below the on-video controls instead of behind the comparison slider.
- The comparison and engine shortcuts now use keys Chrome assigns by default; the earlier Alt+Shift+C and Alt+Shift+A were reserved and stayed unset.
- The player controls no longer post a message to their frame before it has loaded the extension page. On sites such as YouTube this logged "Failed to execute 'postMessage' … target origin … does not match" in the extension's error list each time the controls appeared, changed or were moved (for example entering fullscreen). Frames now receive state only after they announce themselves, and again after any move.
- After WebScaly is reloaded or updated, tabs that were already open stop their old script quietly instead of logging "Extension context invalidated", and a failed snapshot or page restore no longer leaves an unhandled error.
- The corresponding-source archive now includes `docs/LOCAL_VIDEO_ENHANCEMENT.md`, which the README links to.

No new permissions. Existing settings and approvals carry over unchanged.

## Publication documentation — 14 October 2026

- Added the [published Chrome Web Store listing](https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa) as the recommended installation method and repository website.
- Updated distribution and maintainer documentation to reflect public availability. The extension version remains 0.3.1.

## 0.3.1 — 13 October 2026

- Added the WebScaly repository to Settings → About, with a GitHub icon matching the existing contact links.
- The repository opens in a new tab only when selected. Enhancement, site permissions and local settings are unchanged.
- Updated the store screenshots, package version and corresponding source.

## 0.3.0 — 13 October 2026

Initial public release.

- Spatial Detail, Anime4K CNN and FSRCNNX x2 enhancement at the video's native frame rate.
- Local GPU processing with capability checks, cleanup and a spatial WebGL fallback.
- Website access starts off; one-click Add → Allow, embedded-player approval and immediate revocation.
- Optional isolated player controls, comparison and HUD, all hidden by default.
- Native Chrome and JW-style player controls remain visible above the enhanced video.
- Compact dark/mint popup, refined advanced settings, delayed technical help and reduced-motion support.
- About page with privacy information, contact links and an optional PayPal support QR.
- Original scale logo, public source/build material and third-party notices.

Compatibility depends on the player, browser restrictions and GPU. See docs/COMPATIBILITY.md for validation limits.
