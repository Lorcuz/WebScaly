# GitHub repository setup

Upload only the contents of the prepared **GitHub** folder to the repository root. The folder has no old Git history, dependency directory, browser profile or raw development reports. Include the hidden `.github`, `.gitignore` and `.gitattributes` entries.

## Repository creation choices

| Field | Choose / paste |
| --- | --- |
| Owner | Lorcuz |
| Repository name | webscaly |
| Description | Privacy-friendly, local video enhancement for Chrome with Spatial Detail, Anime4K and FSRCNNX. |
| Visibility | Public |
| Add README | Off — README.md is already included. |
| Add .gitignore | None — a project-specific .gitignore is already included. |
| Add license | None — the existing MIT LICENSE and separate third-party notices are already included. |

The project's own license is MIT. If asked about the license elsewhere, choose **MIT** for WebScaly-authored code. Do not replace the supplied LICENSE or third-party notices with a template: FSRCNNX remains LGPL-3.0-or-later, and the other bundled components retain their own terms.

## Upload the files

The browser upload flow allows up to 100 files at a time and has a per-file size limit. This source tree contains more than 100 files. **GitHub Desktop** is the easiest way to upload the whole tree, including hidden files:

1. Create the empty repository on github.com with the choices above.
2. In GitHub Desktop, choose **File → Clone repository**, select `Lorcuz/webscaly`, and clone it into a new local folder.
3. Copy all contents of the prepared GitHub folder into the clone, including dotfiles. Leave the clone's own `.git` folder in place.
4. Review changes, commit with a message such as `Initial public release: WebScaly 0.3.0`, then **Push origin**.
5. Use branch `main` for the public links in the store documentation.

You can also upload folders through the website in smaller batches. Choose **Add file → Upload files**, upload the contents at the correct repository-relative location, and commit. Do not upload a ZIP as a substitute for the source tree: GitHub will not expand it into a README and source files.

If using the command line, run the following inside a NEW copy of the clean GitHub folder, after creating the empty remote repository:

```sh
git init -b main
git add .
git commit -m "Initial public release: WebScaly 0.3.0"
git remote add origin https://github.com/Lorcuz/webscaly.git
git push -u origin main
```

Use the Git identity you want visible publicly. The extension's original local repository/history is not needed for this upload.

## Finish the repository page

- Set the **About** description to the text above.
- Suggested topics: `chrome-extension`, `video-enhancement`, `upscaling`, `webgpu`, `anime4k`, `fsrcnnx`, `privacy`.
- Enable **Issues** so the included bug/feature forms work.
- The included GitHub Actions workflow runs unit tests, build and package validation. It has read-only repository permissions and pinned action revisions. It does not publish releases or submit the store item. Browser/GPU tests remain a local check; hosted CI is not physical GPU qualification.
- Optionally create a GitHub Release tagged `v0.3.0`. Attach `webscaly-0.3.0.zip` and `webscaly-source-0.3.0.zip` from the Chrome Web Store folder, and use CHANGELOG.md for release notes.
- No Pages setup or custom domain is required. The repository README is your homepage; SUPPORT.md and PRIVACY.md provide public support/privacy pages.

After uploading, verify these addresses in a signed-out browser:

- Homepage: https://github.com/Lorcuz/webscaly
- Support: https://github.com/Lorcuz/webscaly/blob/main/SUPPORT.md
- Privacy: https://github.com/Lorcuz/webscaly/blob/main/PRIVACY.md
- Issues: https://github.com/Lorcuz/webscaly/issues

Then use the store instructions in the other folder. If you use another repository name or owner, replace the links in README.md, SUPPORT.md, the issue configuration and CHROMEWEBSTORE.md.

## References

[GitHub repository creation](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository) · [Uploading files and limits](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
