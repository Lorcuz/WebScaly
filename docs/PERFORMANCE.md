# Performance

Enhancement follows decoded video callbacks, retaining native frame rate and audio. Frames may be skipped under GPU pressure. Source FPS uses media timestamps; enhanced FPS counts decoded frames submitted for processing, not physical display scanout. GPU timestamps are optional and the browser does not expose GPU utilization or VRAM usage.

Start with Spatial detail and a 1080p output limit. Anime4K Fast lowers neural cost. CNN working surfaces are bounded separately from output size; up to two visible videos per frame are processed. GPU loss restores spatial WebGL when available. Neural capability simulations do not certify any physical vendor or model.

The included benchmark creates a synthetic local image and measures output readback and sequential queue completion. It is not a streaming-video FPS guarantee. Device information shown by a locally run benchmark is not uploaded and must not be included in public release evidence.
