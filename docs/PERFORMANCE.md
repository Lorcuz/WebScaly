# Performance

Enhancement follows decoded video callbacks, keeping the native frame rate and audio. Frames are skipped, never queued, while the GPU is busy. Source FPS uses media timestamps; enhanced FPS counts decoded frames submitted for processing, not display scanout. GPU time comes from optional timestamp queries sampled every tenth frame; the browser does not expose GPU utilization or VRAM.

Adaptive performance watches two-second windows. When more than 15% of frames are skipped, or GPU time exceeds 85% of the frame budget, for two windows in a row, it steps down: Quality → Balanced → Fast, then a 25% smaller working and output size, then Spatial Detail. Each step is shown in the popup and HUD and lasts until the settings or the video source change. Battery saver applies Fast quality and a 1080p limit while unplugged.

Neural working surfaces stay bounded (720p input, 2× output) independently of display size; spatial work is bounded to about 1080p. Up to two real players per frame are processed. Settings edits no longer trigger script re-registration, tab-wide broadcasts or per-frame re-authorization, and the overlay no longer forces layout on every video frame.

The included benchmark (`benchmark.html`) measures each engine on a synthetic 720p frame scaled to 1080p with sequential queue completion. It is not a streaming-video FPS guarantee. Device information shown locally is not uploaded and must not be included in public release evidence.
