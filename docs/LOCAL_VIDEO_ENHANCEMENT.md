# Local video enhancement in Chrome: frames, permissions and player controls

WebScaly is a free, open-source Chrome extension that applies sharpening, light denoise and upscaling to accessible web video. Processing happens on the user's device, on websites the user explicitly approves.

I maintain the project. This article explains the design decisions behind its rendering, website permissions and player integration, including the limits of the current release.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa) · [Source code](https://github.com/Lorcuz/WebScaly)

## Three enhancement options

Spatial Detail provides lightweight sharpening and denoise. Anime4K uses neural shaders intended for animation. FSRCNNX provides learned 2× upscaling. Quality, output size and per-site profiles let users choose an appropriate workload.

These methods change the appearance of the available frames. They cannot recover a missing original master, guarantee better results for every video, or remove the browser's media protections. Excessive sharpening can accentuate compression artifacts; larger output sizes require more GPU work.

WebScaly processes decoded frames at their native cadence. It does not generate intermediate frames or increase the source frame rate. The website continues to handle playback and audio.

## A real comparison

![Original illustration: enhancement OFF on the left and Anime4K Quality ON on the right](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/store/assets/01-player-1280x800.png)

The comparison uses the same decoded frame of the original demonstration illustration, prepared as a 640×360 video. Anime4K Quality with Automatic output scale and a 1080p height limit produces 1920×1080 output. The left side is native playback; the right side is the installed extension's actual WebGPU output. Identical detail crops receive equal enlargement, with no additional sharpening in the editor. The gallery also contains the original 540p demonstration and a separate 540p Hero film comparison.

The [comparison gallery](media/README.md) includes matched eye/hair detail crops, the showcase video and [capture details and credits](media/ATTRIBUTIONS.md). Additional comparisons use the CC BY 4.0 open movie *Hero*. These examples demonstrate picture changes, not a performance benchmark or a promise of equivalent improvement for every video. Optional player tools remain hidden by default.

## Rendering follows the decoded video

The renderer follows decoded frames with requestVideoFrameCallback. It takes stable frame snapshots, closes them after use and limits queued GPU work. Bounded surfaces and backpressure help prevent processing from accumulating behind playback.

WebGPU runs the enhancement pipelines where supported. Missing or lost WebGPU support can use a WebGL spatial fallback where available. If a neural pipeline cannot initialize, the extension can fall back to Spatial Detail and explain the change. A fallback does not make all algorithms available on every device.

Video discovery accounts for replaced elements, accessible embedded frames and open Shadow DOM. It checks whether a video is decoded, visible and usable. Hidden videos should not appear as active enhancement targets. At most two visible players per frame are processed.

## Website access is an ongoing decision

The manifest uses storage, scripting and activeTab, with optional HTTP and HTTPS host permissions. No website is approved by default. Storage keeps settings locally; scripting activates the content code on approved websites; activeTab supplies temporary context when the user opens the extension.

The approval operation is owned by the Manifest V3 worker. It starts the Chrome permission request before asynchronous work, records the pending intent in session storage, and completes activation after approval even if Chrome closes the popup. Denial must not create an approved site.

Embedded video needs approval for both the player origin and its containing website. Approving a shared player service does not authorize every website that embeds it.

Revocation also has to stop code that is already running. Removing a script registration alone does not remove previously injected code. WebScaly invalidates active renderers, cancels pending initialization, removes overlays and reconciles its script registrations. The authorization checks continue during use.

The relevant Chrome behavior is documented in [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

## Keeping native player controls usable

The enhancement canvas and statistics are transparent to pointer input. Interactive extension controls and the comparison slider live in bundled extension frames outside the player's DOM event tree. Messages are restricted to the owning renderer and a small set of validated actions; those frames cannot manage website access.

This separation matters when a player handles clicks during the capture phase. Toolbar clicks and comparison dragging should not turn into native player actions. Native controls and captions must also remain visibly above the enhanced image. The validation includes interaction checks and a regression check for those pixels.

Native video-element fullscreen can show the original video. Container fullscreen can retain enhancement. If a website blocks the extension's interactive frame, the popup remains available for settings.

## What has been checked, and what remains limited

Controlled fixtures cover native HTML5 video, a JW-style container, Video.js, Plyr, HLS and DASH, along with pause, seek, source replacement, cleanup and permission revocation. Recorded live results distinguish passed, partial and unverified players. They are documented in [compatibility results](https://github.com/Lorcuz/WebScaly/blob/main/docs/COMPATIBILITY.md) and [testing](https://github.com/Lorcuz/WebScaly/blob/main/docs/TESTING.md).

Simulated capability limits are not physical qualification of every AMD, Intel or other GPU. Quality and speed depend on the video, device and browser. Protected media and browser pixel-access restrictions can prevent direct enhancement.

An optional compatibility player uses an explicit Chrome tab-sharing choice and lets the user select the video area for local enhancement. Audio stays in the source tab. Protected content can still remain black.

## Privacy and useful feedback

WebScaly has no tracking, analytics, user accounts, cloud inference or automatic video uploads. Frames, website addresses and diagnostics are handled locally for enhancement. Settings and approved sites stay in the browser. Optional external support links open only when selected; those services have their own policies. The details are in [the privacy policy](https://github.com/Lorcuz/WebScaly/blob/main/PRIVACY.md).

Useful feedback includes the affected player, source resolution, selected algorithm, expected behavior and reproducible steps. A cropped comparison can help with picture-quality problems. Please omit private video addresses, browser profiles and personal configuration exports from public reports.

[GitHub Issues](https://github.com/Lorcuz/WebScaly/issues) is the place for reproducible problems. The [architecture notes](https://github.com/Lorcuz/WebScaly/blob/main/docs/ARCHITECTURE.md) describe the implementation in more detail.
