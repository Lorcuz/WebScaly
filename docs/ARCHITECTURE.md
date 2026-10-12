# Architecture

The Manifest V3 worker owns website approval transactions, configuration and registered content scripts. `permissions.request` starts synchronously in the message listener before storage or queued work. A session-stored intent allows completion after popup closure or worker recovery; permission denial never creates an approval. Configuration version 2 accepts version-1 imports while dropping retired fields and hiding player tools during migration.

Content scripts must authenticate both their current origin and the containing top-level website against profiles and Chrome permissions. A session frame registry supports diagnostics without a webNavigation permission. Removal broadcasts immediate invalidation, disposes renderers and pending initialization, then reconciles registration. Already injected code does not disappear when a script registration is removed.

Video discovery caches document and open Shadow DOM roots, inspects additions in bounded batches, and checks decoded, visible, usable video. Up to two visible players per frame are processed. Periodic authorization detects navigation and Chrome access changes; scanning and GPU processing stop on revocation.

The renderer uses `requestVideoFrameCallback` and bounded GPU surfaces, processing decoded frames once with queue backpressure. It captures stable VideoFrames, closes snapshots and leaves native audio/playback intact. Neural initialization failure uses spatial detail; missing or lost WebGPU falls back to WebGL where usable. Native video-element fullscreen uses native playback. Container fullscreen retains extension controls.

The canvas, divider and statistics are transparent to pointer input. Interactive controls live in bundled UI frames outside the player’s DOM event tree. The content controller accepts only messages from its own extension-origin frame windows, with a renderer token and a restricted action schema. The UI frame is excluded from privileged worker operations. Only `ui-frame.html` is web accessible; scripts and fonts are local. Sites that block it can still use the popup.

Popup and settings share labels, native controls and Chrome-121-compatible hover/focus help. Advanced settings preserve the source-tab and selected profile context. Host approvals remain explicit and scoped; `activeTab` supplies temporary action context without broad `tabs` access.
