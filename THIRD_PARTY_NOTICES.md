# WebScaly third-party notices

Keep this file, the `licenses/` directory, and the `compliance/` source directory with redistributed builds. WebScaly-authored code and the scale logo use the root MIT license. The distribution combines material under the following separate terms.

| Material | Upstream identity | Terms / bundled notice |
| --- | --- | --- |
| Anime4K WebGPU TypeScript pipelines and WGSL CNN weights | [Anime4K-WebGPU](https://github.com/Anime4KWebBoost/Anime4K-WebGPU/tree/ad1ef0c010fd0d69371d0e2a340ab1bffc38d24b) | MIT, `Anime4K-WebGPU-MIT.txt`; selected restore/upscale pipelines vendored |
| Original Anime4K algorithm | [bloc97/Anime4K](https://github.com/bloc97/Anime4K) | MIT, `Anime4K-MIT.txt`, copyright 2019 bloc97 |
| FSRCNNX x2 16-0-4-1 GLSL weights, derived WGSL and pass descriptor | [FSRCNN-TensorFlow 1.1](https://github.com/igv/FSRCNN-TensorFlow/releases/tag/1.1) | LGPL-3.0-or-later, `LGPL-3.0.txt` and `GPL-3.0.txt`; source and modification notice included |
| FSRCNNX GLSL-to-WGSL transpiler | [Flux Fidelity](https://github.com/ajccarlson/flux-fidelity/tree/03acb0f8f8e0f1c8219a8ab0e842a0efcc74b18c) | Apache-2.0, `Flux-Fidelity-Apache-2.0.txt` and `Flux-Fidelity-NOTICE.txt` |
| React, ReactDOM, Scheduler | Versions pinned in `package-lock.json` | MIT, `React-MIT.txt`, `ReactDOM-MIT.txt`, `Scheduler-MIT.txt` |
| tldts, tldts-core public-suffix parsing | Versions pinned in `package-lock.json` | MIT, `Tldts-MIT.txt`, `Tldts-core-MIT.txt` |
| Inter font, unmodified local Latin subsets | `@fontsource/inter`, version pinned in lockfile | SIL Open Font License 1.1, `Inter-OFL.txt` |
| Tabler UI icons | `@tabler/icons-react`, version pinned in lockfile | MIT, `Tabler-MIT.txt` |
| Italy flag image | [Noto Emoji region flags v2.047](https://github.com/googlefonts/noto-emoji/tree/v2.047/third_party/region-flags) | Public domain / copyright-exempt flag, `Country-Flags-NOTICE.txt`; image unchanged |

## FSRCNNX source and replacement

Original GLSL SHA-256: `d5a24a271e5d9a3f7f7a053b150c460a44c25b3cf7f770857d57cc3a2e1c9965`.

Flux's transpiler preserves the trained weights and pass order, fuses the first four hooks, and converts the mpv/libplacebo hooks into WebGPU compute passes. WebScaly adds RGB-to-luma extraction, chroma recombination, resource bindings, and the presentation pipeline. Generated WGSL retains the upstream license and modification header. WebScaly does not claim ownership of those weights.

Every installable build includes `compliance/fsrcnnx/` with the original GLSL, generated WGSL/pass manifest, transpiler, WebScaly adapter and shaders. The release also supplies a complete corresponding source archive, `webscaly-source-0.3.0.zip`, with the TypeScript source, build scripts and lockfile.

You may modify, debug, replace and rebuild the LGPL-covered portion. WebScaly imposes no prohibition on reverse engineering for debugging those modifications. To replace it, extract the source archive, edit `src/vendor/FSRCNNX_x2_16-0-4-1.wgsl` and its `.passes.json`, run `npm ci` and `npm run build`, then load the rebuilt `dist` directory in Chrome Developer Mode. There is no publisher signature or remote attestation blocking a rebuilt unpacked extension.

To regenerate the shipped shader from the included upstream source:

```powershell
node public/compliance/fsrcnnx/transpile.js public/compliance/fsrcnnx/FSRCNNX_x2_16-0-4-1.glsl --out src/vendor
npm run build
```
