# WebScaly Privacy Policy

Last updated: 20 October 2026. Applies to WebScaly 0.4.0.

WebScaly enhances video on your device, on websites you approve. It does not send your videos or browsing activity to the developer, run analytics, sell data or use cloud processing. You do not need an account.

## Information handled on your device

- **Website addresses and permissions.** WebScaly reads the current website after you open its popup, stores the website origins you approve and checks parent/embedded-player addresses to enforce your choices. It does not keep a log of your browsing history. Temporary tab and frame context may contain page addresses while the browser session is running.
- **Video content.** Decoded video frames and video dimensions are used locally for enhancement and comparison. Every few seconds a small thumbnail of the frame is analysed on your device to suggest an engine (for example, Anime4K for animation); it is discarded immediately. Frames are not uploaded or recorded. Audio and playback remain with the website.
- **Snapshots.** When you choose Snapshot, the current enhanced frame is saved as a PNG through Chrome's normal download, on your device only. WebScaly never takes snapshots on its own.
- **Settings.** Enhancement preferences, approved sites and presets are saved in the extension's local browser storage. They are not synced to a WebScaly account or a remote server.
- **Diagnostics.** Current player state, processing timings, errors and browser/GPU capabilities can be displayed locally to help troubleshoot. Copy report places them on your clipboard only when you ask. WebScaly does not send diagnostic reports automatically.
- **Battery state.** If you turn on Battery saver, WebScaly checks whether the device is charging so it can use lighter processing while unplugged. The charging state is not stored.
- **Toolbar badge and shortcuts.** The per-tab badge reflects whether a video in that tab is being enhanced. Keyboard shortcuts are handled by Chrome and act only on the current tab.

WebScaly does not read passwords, cookies, authentication tokens, payment details, personal communications or unrelated form content to perform enhancement. It has no analytics, advertising integrations or remote executable code.

## Website access and the compatibility player

Website access is off by default. It is requested when you choose Add/Allow. An embedded player requires approval for both its origin and the parent website. Removing a website stops its enhancement and revokes the matching grants; overlapping broader grants may also be removed.

The optional compatibility player asks you to select a tab through Chrome's sharing dialog and select the video area. That display stream is processed locally and does not include audio. WebScaly does not record, upload or save it. Other visible tab content can be present in the shared image before you choose the video area. Stop sharing, close the compatibility player or remove source-site access to end processing. Browser security and protected-media restrictions remain in force.

## Storage, retention and your controls

Preferences, presets and approved site origins remain in local extension storage until you change/remove them or uninstall WebScaly. Session approval intents and tab/frame context are stored in session storage and cleared when the browser session ends. Temporary rendering frames and buffers are discarded as processing stops and resources are released; WebScaly keeps no video archive.

You can edit settings and remove website access in the interface. A configuration export is a local JSON file that includes your chosen settings and approved sites; you control whether to share or delete that file. Uninstalling removes the extension's storage, but does not delete files you exported yourself.

## Optional contact and donation services

GitHub, email and Discord links open only when you choose them. The PayPal QR is bundled locally and appears only when you choose Support WebScaly. Scanning it opens PayPal through your chosen app. WebScaly does not receive or store your payment information.

If you contact the maintainer, the email address or Discord identity, message and attachments you voluntarily send are received through that service and used to answer your request. Share only the details needed to resolve the issue. Public GitHub issue content is visible to others. The provider's privacy policy applies: [Google](https://policies.google.com/privacy), [Discord](https://discord.com/privacy), [PayPal](https://www.paypal.com/webapps/mpp/ua/privacy-full), and [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). WebScaly does not contact these services automatically for video enhancement.

## Limited use

WebScaly's use of information received through browser permissions is limited to its described video-enhancement, access-control and troubleshooting features. Information is not sold, used for advertising, used to determine creditworthiness, or transferred for unrelated purposes. The developer has no automatic access to locally processed videos or browsing information. WebScaly complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Changes and contact

This policy will be updated here if data handling changes. Privacy questions or requests relating to information you voluntarily sent for support can be emailed to **notlorcuz@gmail.com**. The maintainer is **Lorenzo Gresio (Lorcuz)**.
