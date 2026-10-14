# GitHub repository maintenance

The public repository is [Lorcuz/WebScaly](https://github.com/Lorcuz/WebScaly), with source on `main` and downloadable packages in [GitHub Releases](https://github.com/Lorcuz/WebScaly/releases/latest). The recommended installation method is the published [Chrome Web Store listing](https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa).

## Repository page

| Field | Value |
| --- | --- |
| Owner / repository | Lorcuz/WebScaly |
| Description | Local video enhancement for Chrome. Sharpen and upscale videos on websites you approve. |
| About website | https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa |
| Visibility | Public |
| Default branch | main |
| Issues | Enabled for the included bug and feature forms. |
| Topics | chrome-extension, video-enhancement, upscaling, webgpu, webgl, anime4k, fsrcnnx, privacy |

README.md puts the store installation first and retains source-build instructions for development. The project-specific `.gitignore`, `.gitattributes`, MIT LICENSE and third-party notices are already included. Keep these files rather than replacing them with repository-creation templates.

The README includes the showcase video and original-illustration comparisons. [docs/media](../media/README.md) holds full-size images, additional Hero examples, captions, credits and checksums. Preserve the embedded video URL when editing the page. Master media is repository documentation; the source package includes its small documentation/notice files and the store-sized comparison, without the master video or gallery image files.

WebScaly-authored code uses **MIT**. FSRCNNX remains **LGPL-3.0-or-later**, and other bundled components retain their own terms. Preserve notices and the required corresponding source/rebuild material.

## Update the existing repository

1. Clone or update the public repository with Git or GitHub Desktop. Keep its existing public history.
2. Make the change, review the diff and run the relevant checks. For a clean source export, include hidden project files and exclude dependencies, private development history, browser profiles and raw reports.
3. Commit and push the reviewed changes, or open a pull request. Keep the store, support and privacy links current.
4. Confirm the GitHub Actions workflow succeeds. It runs unit tests, build and package validation with read-only repository permissions and pinned action revisions. It does not publish releases or submit store updates. Browser/GPU tests remain local checks; hosted CI is not physical GPU qualification.

Use the Git identity you want visible publicly. Never copy private development history into the public repository.

## Future extension releases

For an extension-code update, increase the package and manifest version, update CHANGELOG.md and complete the tests and package/source verification described in [TESTING.md](../TESTING.md). Create a matching GitHub release tag and attach the generated extension and corresponding-source ZIPs. Keep previous release assets as historical snapshots.

Then follow [CHROMEWEBSTORE.md](../../CHROMEWEBSTORE.md) to update the existing store item. A documentation-only repository update needs no new extension version or store upload.

## Public links

- Install: https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa
- Homepage/source: https://github.com/Lorcuz/WebScaly
- Support: https://github.com/Lorcuz/WebScaly/blob/main/SUPPORT.md
- Privacy: https://github.com/Lorcuz/WebScaly/blob/main/PRIVACY.md
- Issues: https://github.com/Lorcuz/WebScaly/issues

No Pages setup or custom domain is required. Keep the support and privacy pages accessible without sign-in.
