# Primary implementation references

- [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions): optional grants and user-gesture requests.
- [Active tab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): temporary context after the extension action.
- [Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): session-backed state and recovery.
- [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging): `return true` with asynchronous replies for Chrome 121.
- [Scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting): dynamic registration and explicit injected-code teardown.
- [Web-accessible resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources): minimal bundled frame entry.
- [WebGPU](https://www.w3.org/TR/webgpu/): device limits, optional features, external textures and device loss.

The source uses explicit capability checks, local scripts and Chrome-121-compatible tooltip behavior. Third-party shader identities and licensing remain in THIRD_PARTY_NOTICES.
