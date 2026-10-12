# Review

The release was reviewed for MV3 worker lifecycle, gesture propagation, recoverable approval transactions, parent/frame authorization, pending initialization cancellation, overlapping grants, CSP, restricted UI messages, bounded video discovery, native pacing, GPU resource cleanup, capability fallback, keyboard help and recursive packaging.

Required protections: no default host access; both parent and embedded player approved and granted; synchronous permission request before asynchronous work; durable pending intents; explicit all-frame teardown; whitelisted renderer UI actions; self-only executable code; minimal web-accessible HTML; no arbitrary network proxy; no collected browsing/video telemetry.

Material findings resolved before packaging:

- Popup closure interrupted approval completion. The worker now owns the gesture-first request and its durable intent; late grants and cancellation are reconciled after recovery.
- Removing a parent could leave embedded processing active. Both origins now require configured approval and Chrome grants; explicit invalidation cancels initialization, disposes active renderers and removes overlays before registration reconciliation.
- Interactive overlay input reached native player handlers. Bundled isolated frames now validate extension origin, window identity, renderer token and action bounds. Privileged worker operations accept only the popup/settings pages.
- A positive canvas stacking level covered Vixcloud controls and captions. The overlay now follows the video's own stacking level and DOM order; native controls/caption pixels and container fullscreen are regression-tested. A live Vixcloud capture confirmed visible native controls.
- Interactive frame backgrounds painted a white rectangle. The frame explicitly preserves transparent dark-scheme rendering; a screenshot regression checks the blank area.
- Late open shadow roots and inherited-origin frames were missed. Discovery now revisits a bounded custom-host set, registered scripts match inherited origins, and authorization uses Chrome's trusted origin. Effective window origin also scopes frame messaging and diagnostics.
- Long errors obscured popup actions. Compact feedback links to accessible full errors in advanced diagnostics; normal approved, embedded and error states fit without scrolling.
- Reused browser profiles retained cached worker code. Extension acceptance and capture runs now create fresh profiles, and portable test scripts honor the browser-cache environment setting.
- Cold development dependency discovery reloaded the first player fixture after playback started. Player libraries are now explicitly prebundled at server startup.
- Old source history, model artifacts and device reports could enter release files. Explicit allowlists and recursive ZIP auditing exclude private evidence and retired runtime while retaining legitimate licenses and LGPL rebuild material.
- New About assets were absent from the previous runtime packaging allowlist. The flag, support QR and license notices are now required assets, checked in the extracted store ZIP.
- Chrome's native video control band exceeded the previous 44-pixel reservation. The full button/seek-bar region is now preserved, with a pixel comparison against unenhanced native controls.
- Store privacy copy previously described no data collection without explaining local handling. The public policy and form instructions now disclose video frames, approved/current website addresses, temporary context and local diagnostics, with no automatic transmission.

The local review found no remaining material issue within the tested scope. This conclusion does not turn unverified live players, physical GPUs or native restart/denial cases into passing results. Dependency audit reported zero known vulnerabilities at release preparation.

Validation scope and remaining manual release checks are documented in TESTING and COMPATIBILITY. Packaging checks required assets, exact manifest grants, image metadata, nested source, clean export paths and correspondence between verification and the handoff ZIP. The Code Review connector reads PR CI diagnostics; there is no suitable PR in this local project, so the implementation uses structured local review and tests. No PR or public repository was created.
