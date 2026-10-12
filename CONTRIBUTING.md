# Contributing to WebScaly

Start with a small issue describing the problem or proposed improvement. For a fix, include a reproduction, the behavior after your change and relevant validation. Keep the extension local, opt-in, lightweight and enhancement-focused.

## Development

Use Node.js 22.12+ or 24 LTS and npm. Run `npm ci`, `npm test` and `npm run build`. Install test Chromium with `npx playwright install chromium`, then run `npm run test:browser`. `npm run dev` starts the local development UI; extension behavior needs a built unpacked `dist` installation.

Use generated or redistributable video for tests. Keep profiles, traces, device reports, secret keys and personal paths out of source control. Do not add remote executable code, analytics or unnecessary permissions. Include fallbacks and cleanup for new graphics features; simulated capabilities do not qualify physical hardware.

## Licensing

Contributions to WebScaly-authored material are provided under the root MIT license. Existing third-party files retain their separate terms and copyright notices. Changes to FSRCNNX-derived material must preserve LGPL source and replacement/rebuild material. Document any new dependency or asset in THIRD_PARTY_NOTICES.md.

## Pull requests

Explain the concrete problem and the resulting behavior. Run checks appropriate to the change, list any known limits, and update user documentation when needed. A focused patch is easier to review than a collection of unrelated changes.
