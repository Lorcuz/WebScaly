# Permissions

| Permission | Purpose |
| --- | --- |
| storage | Save preferences and approved origins locally; retain approval intents and frame registry during a session. |
| scripting | Register/inject the bundled content script only for approved, granted hosts and remove registrations when access changes. |
| activeTab | Read the current video tab after the user opens the extension action; broad tabs access is unnecessary. |
| Optional http/https hosts | Request the exact website or explicitly selected subdomain scope after Add/Allow. Both parent and embedded player approvals are required. No host is granted by default. |

Keyboard shortcuts use the `commands` manifest key, which is not a permission; Chrome lets users change them at chrome://extensions/shortcuts. Only `ui-frame.html` is web accessible for isolated player controls. It cannot manage website permissions. Extension executable code, fonts and shaders are bundled locally. Tab sharing is requested through Chrome’s chooser only when the user opens the compatibility player; it captures no audio and uploads nothing.
