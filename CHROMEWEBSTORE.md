# Chrome Web Store Listing — WebScaly

Last updated: 2026-10-13. Version: 0.3.1. Status: prepared locally; not submitted.

## Store listing — copy these choices

| Dashboard field | Value |
| --- | --- |
| Title from package | WebScaly |
| Summary from package | Local video enhancement with WebGPU and WebGL on websites you approve. |
| Category | Entertainment |
| Language | English |
| Global promo video | Leave empty; no YouTube promo video is supplied. |
| Official URL | None. Use a verified site only if you actually own it. |
| Homepage URL | https://github.com/Lorcuz/webscaly |
| Support URL | https://github.com/Lorcuz/webscaly/blob/main/SUPPORT.md |
| Mature content | No / off. WebScaly and the supplied original demo imagery contain no mature content. |
| Item support | On / visible. Monitor the support email and GitHub issues. |
| Distribution visibility | Public |
| Regions | All available regions, unless you intentionally limit distribution. |
| Public contact email | notlorcuz@gmail.com |
| Publisher/display name | Lorcuz, if available. Use your verified account details where the dashboard requires them. |

The repository, support and privacy links are public on GitHub. Settings → About also links to the repository with a GitHub icon. Official URL is separate from Homepage URL; no Search Console registration is needed to use your repository as the homepage.

## Detailed description

Paste the plain text from `docs/store/description.txt` into Description (under 16,000 characters):

Enhance the videos you watch, right in your browser. WebScaly adds sharper detail and local upscaling on websites you approve, while your usual player keeps control of playback and sound.

CHOOSE YOUR ENHANCEMENT
Spatial Detail: light sharpening and noise reduction.
Anime4K: restore detail in animation.
FSRCNNX: reconstruct finer detail with 2× upscaling.

Adjust quality and output size to suit your device. Keep different settings for different websites. Turn on comparison to see the original and enhanced image side by side.

A QUIET, COMPACT INTERFACE
Start with the popup: approve a website, enable Enhancement and choose an algorithm. In-player controls, comparison and the performance HUD stay hidden until you turn them on. Advanced settings offer more control, clear diagnostics and short help for technical options.

YOU CONTROL WEBSITE ACCESS
WebScaly has no website access by default. Click Add this website, then Allow in Chrome. If a page uses an embedded player, approve that player's website too. Remove access whenever you want.

YOUR VIDEOS STAY ON YOUR DEVICE
No accounts, tracking, analytics, cloud processing or automatic uploads. Website addresses, video frames and settings are used locally to provide enhancement. The developer does not receive your browsing activity or videos.

WHEN DIRECT ACCESS IS RESTRICTED
The optional compatibility player lets you explicitly share your source tab and select the video area for local enhancement. Audio remains in the original tab. Nothing is recorded or uploaded.

COMPATIBILITY
Requires Chrome 121 or newer. Performance and available algorithms depend on your browser, GPU and video player. A lighter spatial fallback is available when supported. Protected video and browser security restrictions can prevent enhancement. Support is not guaranteed for every website or device.

SUPPORT
Questions or feedback: notlorcuz@gmail.com
Bug reports: https://github.com/Lorcuz/webscaly/issues
Privacy: https://github.com/Lorcuz/webscaly/blob/main/PRIVACY.md

WebScaly is free and open source. Optional support is available in Settings → About.

## Single purpose — Privacy practices

Locally enhance accessible web video on websites the user explicitly approves.

## Graphics and assets

Use files from the Chrome Web Store handoff folder's `assets/` directory:

| Field | File | Format |
| --- | --- | --- |
| Store icon | icon-128.png | 128×128 PNG |
| Screenshot 1 | 01-player-1280x800.png | 1280×800, 24-bit PNG, no alpha |
| Screenshot 2 | 02-settings-1280x800.png | 1280×800, 24-bit PNG, no alpha |
| Screenshot 3 | 03-popup-1280x800.png | 1280×800, 24-bit PNG, no alpha |
| Screenshot 4 | 04-site-profiles-1280x800.png | 1280×800, 24-bit PNG, no alpha |
| Screenshot 5 | 05-about-1280x800.png | 1280×800, 24-bit PNG, no alpha |
| Small promo tile | small-promo-440x280.png | 440×280, 24-bit PNG, no alpha |
| Marquee promo tile | marquee-promo-1400x560.png | 1400×560, 24-bit PNG, no alpha |

Screenshots show the current installed extension. Player footage is original and generated locally. Optional comparison/controls are enabled for the demo; all overlays remain hidden by default in a new installation. The popup screenshot is a presentation layout containing an unaltered capture of the actual popup. No website artwork, user history or device report is included. Do not upload `popup-ui.png`, which is a supporting capture rather than a store-sized screenshot.

## Permission explanations — copy each into its field

**storage**

Saves enhancement settings, approved website origins and presets on the user's device. Session storage retains pending website approvals and temporary tab/frame context so approval and access checks recover when the background worker restarts. No settings or diagnostics are synced or sent to the developer.

**scripting**

Loads the bundled video-enhancement content script only on websites with matching user approval and Chrome permission. The script finds accessible video elements, enhances their decoded frames and attaches optional player tools. Registrations and active processing are removed when access is revoked.

**activeTab**

Temporarily reads the active website address when the user opens WebScaly from the toolbar, so the popup can show the current website and offer Add this website. It does not read browsing history or grant ongoing access to all tabs.

**Optional host permissions — http://*/* and https://*/***

Users can choose any ordinary HTTP or HTTPS video website. These optional declarations allow a request for the specific origin, or explicitly selected subdomain scope, after Add/Allow. No host is granted at installation. Both the parent page and an embedded player must be approved; revoking either stops processing for that page. No cookies, private form data or video content are sent to the developer.

**Remote code**

Select **No, I am not using remote code**. JavaScript, styles, fonts, enhancement shaders and weights are bundled with the extension. The extension does not download or execute remote code. Optional GitHub/email/Discord/PayPal destinations are user-initiated external services, not executable-code dependencies.

## Privacy practices — disclose local handling

Google requires disclosure even when information is only processed or stored locally. For this build, disclose:

| Data-use checkbox | Select? | Actual handling |
| --- | --- | --- |
| Personally identifiable information | No | No automatic collection of user identity. Voluntary support messages are covered separately in the policy. |
| Health information | No | Not accessed for enhancement. |
| Financial and payment information | No | Donation is handled by PayPal; the extension receives no payment details. |
| Authentication information | No | No accounts, password/cookie collection or sign-in. |
| Personal communications | No | Not read by the extension. |
| Location | No | No geolocation collection. |
| Web history | Yes — local website-address handling | Reads current/approved page and player origins to enforce access; stores approved origins locally. It does not keep a browsing-history log or upload URLs. |
| User activity | No | No behavioral tracking, analytics or interaction history. |
| Website content | Yes — local video processing | Decoded video frames or explicitly shared tab images are used locally for enhancement, then discarded. Nothing is uploaded or recorded. |

These are disclosures of local handling, not claims of developer-side collection. Do not use a blanket "handles no user data" answer. Use the exact category labels presented by the dashboard and retain the policy's explanation of local-only use.

Check all three certifications: data is not sold to third parties; data is not used for purposes unrelated to the item's core functionality; data is not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/Lorcuz/webscaly/blob/main/PRIVACY.md

This policy is public on GitHub; verify the URL loads without sign-in before submitting the store item. It describes on-device origins, frames, session context, preferences, diagnostic data, exports, optional tab sharing and voluntary support messages.

## Upload and review instructions

Upload only `webscaly-0.3.1.zip`, not the GitHub source archive or the entire handoff folder. If your store draft already contains 0.3.0, upload this newer package before submitting. The ZIP has `manifest.json` at its root. Do not remove the license notices or `compliance/`: it carries the required FSRCNNX source and rebuild material. The source ZIP inside compliance is legal corresponding source, not runtime code.

Suggested reviewer notes: "WebScaly has no website access on installation. Open an ordinary video page, click the extension, choose Add this website and Allow, then enable Enhancement. Embedded players need their own approval in addition to the parent page. Player Controls/Compare/HUD are off by default. The compatibility player requires an explicit Chrome tab-sharing choice. Local processing can be restricted by protected media or pixel-access rules. The bundled compliance archive contains LGPL corresponding source and rebuild instructions."

Use Chrome 121+ with a supported graphics context. No login is required. The supplied local test results do not certify every website, physical GPU or Chrome version. See docs/COMPATIBILITY.md for passed, partial and unverified outcomes. Native browser denial/restart recovery and physical AMD/Intel qualification remain manual validation limits.

## Readiness and version history

| Version | Prepared | Changes | Status |
| --- | --- | --- | --- |
| 0.3.1 | 2026-10-13 | GitHub repository link and icon in About; refreshed UI screenshots and corresponding source. | Prepared; not submitted |
| 0.3.0 | 2026-10-13 | Enhancement-only release, opt-in site access, refined interface, About/support, current artwork and corresponding source. | Prepared; not submitted |

Before final submission: upload 0.3.1 and its current screenshots; finish publisher registration, account/contact verification and any region-specific trader disclosures shown by the dashboard; verify Add/Allow and revocation in your installed Chrome profile. The GitHub repository and 0.3.0 release are public; Chrome Web Store submission remains separate.

The package and artwork are prepared locally. Store approval and publishing are controlled by Google and the publisher.

## Primary references

- [Listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Category guidance](https://developer.chrome.com/docs/webstore/best-practices)
- [Privacy form](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Local data-handling disclosures](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
