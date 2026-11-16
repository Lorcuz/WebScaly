# Testing

## Commands

| Command | What it checks | Where it runs |
| --- | --- | --- |
| `npm ci` | Installs the locked dependencies. | Anywhere |
| `npm test` | Unit tests (Vitest). | Anywhere, including the GitHub Actions workflow |
| `npm run lint` | TypeScript with `noUnusedLocals`, `noFallthroughCasesInSwitch` and `noImplicitReturns` (`tsconfig.lint.json`). | Anywhere, including the workflow |
| `npm run build` | Type check, then builds the unpacked extension into `dist/`. | Anywhere, including the workflow |
| `npm run package` | Builds the extension ZIP and the clean source export, then audits both. | Anywhere, including the workflow |
| `npm run test:browser` | Playwright tests that load `dist/` as an unpacked extension in Chromium. | A local machine with a graphics device |
| `npm run test:gpu` | The WebGPU image-quality matrix (16 configurations with image checks). | A local machine with a WebGPU-capable GPU |
| `npm run verify:release` | Extracts the packaged ZIP and checks it in a browser. | A local machine |
| `npm run verify:source` | Rebuilds from the bundled corresponding source and compares the result. | A local machine |

Install the browser once with `npx playwright install chromium`. Test scripts honor `PLAYWRIGHT_BROWSERS_PATH`, use a project-local `.playwright` cache when present, and otherwise use Playwright's normal cache. Raw output stays under the ignored `test-results/` folder.

The browser and GPU tests are not run by the GitHub Actions workflow. Hosted runners have no physical GPU, so a passing workflow does not cover WebGPU output, frame pacing or GPU memory.

`WEBSCALY_EXTENSION_DIR=<folder>` runs the browser tests that load the extension (`extension`, `discovery` and `popup-ui`) against an unpacked folder instead of `dist/`, for example an extracted release ZIP. `node scripts/ui-capture.mjs <folder>` captures every popup state, Settings section and the in-player toolbar for design review; it needs `npm run build` and `npm run dev`.

## Unit tests

The unit tests cover:

- bounded settings, preferences, built-in presets, version migration;
- merge and replace imports, exact and wildcard website scopes;
- the approval flow: synchronous permission request, denial, duplicate requests, late grants, cancellation and recovery of a pending approval after a worker restart;
- parent and embedded-player authorization, overlapping removals, and scoped invalidation that leaves unrelated tabs and websites untouched;
- fail-closed behaviour when a tab address cannot be read or a pattern cannot be interpreted;
- the reconcile fingerprint (no broadcast on settings edits), frame-registry writes, 24 concurrent frame registrations, keyboard commands and badge state across a worker restart;
- no unhandled rejection when session storage fails, with authorization still working;
- the adaptive-performance governor, the content hint, the GPU timer and the release scripts.

Approval tests use a model of the Chrome APIs. They do not replace the manual check of Chrome's own permission prompt (see below).

## Browser tests

Browser tests use fresh, isolated profiles and run the real MV3 extension code with test-only loopback grants and locally generated video. They fail on any page error and on console errors from the controls frames. They cover:

- **Players:** native HTML5 video, a JW-style container, Video.js, Plyr, and locally generated HLS and DASH streams; pause, seek, recorded playback, replaced sources and 300 seeks on a progressive MP4 with the same renderer.
- **Pages:** late open Shadow DOM (including a late player after 4000 custom elements, found without a long task), inherited-origin frames, plain `http://` pages with the WebGL fallback, and hover previews that get no renderer.
- **Access:** parent and embedded-player approval, revocation, reapproval, and that small ad frames get no "Allow" button.
- **Controls:** isolated controls and comparison, compact popup states, accessible full errors, tooltips, keyboard focus, and capture-phase checks that extension controls never reach the page's own handlers. Native JW-style controls and captions stay visible over the enhanced picture (pixel check).
- **Popup:** toggles and actions, the "skipped" tooltip on keyboard focus, the pause name and the visible "Enhance" label, and the disclosure next to "Allow on this website" (what WebScaly reads; nothing is uploaded) within the 360 × 600 popup.
- **Rendering:** WebGPU output readback, native frame pacing, WebGL fallbacks, adaptive steps applied in place, live skip-above, no processing while the video element itself is fullscreen, cross-origin media left native, device reuse and release, and the graphics failure reason.
- **Resizing:** in-place resize that keeps the engine and its networks, player fullscreen cycles, rapid resizing, resizing during initialization or while the source is emptied, Anime4K's 2× stage added and dropped in place; every animation frame is checked for a hidden, unconfigured or wrongly sized canvas.
- **Failures:** WebGL context loss and restore, loss without restore (playback continues), 24 restarts without Chrome's context-limit warning, WebGPU device loss falling back to exactly one WebGL engine, errors on the first frame after a failed resize, and a throwing allocation that still releases the old surface.
- **Background tabs:** a tab hidden for a long time releases its pipeline and rebuilds when shown; a short switch keeps it.
- **Other:** global pause with the matching badge, toolbar snapshot download, the compatibility player's tab sharing, crop and cleanup (including Escape and too-small selections).

Many regression tests for fixes in 0.5.0 were also checked "red → green": run against the code before the fix, where they failed, and after it, where they pass. Tests that only add coverage were not checked this way.

## Package checks

Package verification recursively inspects the extension ZIP and the corresponding-source archive, the exact manifest grants, image metadata and the runtime file allowlist. `npm run verify:release` extracts the actual package and checks all seven Settings sections, hidden defaults, no initial grants, popup and gear dimensions, About images and disclosure, and the viewer and diagnostics entry points, with no missing resources, page errors or external requests. `npm run verify:source` extracts the bundled corresponding source, runs a fresh `npm ci`, unit tests, build and package, then compares every runtime file byte for byte. No private developer files are required.

## Manual checks before each release

These cannot be automated reliably and are done by hand on the exact package intended for publication:

- In an installed Chrome profile: Add → Allow (Chrome's own prompt), denial, revocation of the parent and of an embedded player, overlapping grants, reapproval, and recovery after a browser restart.
- Live websites: see [COMPATIBILITY.md](COMPATIBILITY.md). A player that failed or could not be tested stays listed as blocked or unverified.
- Other graphics vendors: AMD and Intel GPUs need their own qualification.
- Screen readers: no screen-reader session has been recorded yet, so screen-reader compatibility is not claimed.

## Results by release

| Release | Unit tests | Browser tests | Notes |
| --- | --- | --- | --- |
| 0.4.1 | 66 | 50 | Published. Add → Allow manually confirmed in installed Chrome. |
| 0.5.0 | 84 | 83 | Run on one Windows 11 machine with an NVIDIA GPU. The installed-Chrome permission-prompt check is a manual step before store submission. |
