# WebScaly demonstrations

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa) · [Project README](../../README.md) · [Source credits and capture details](ATTRIBUTIONS.md)

These examples use **WebScaly 0.3.1**, **Anime4K CNN → Quality** and a **1080p output-height limit**. OFF shows native playback of the decoded source; ON shows actual extension output. Presentation crops and enlargement apply equally to both sides. Results depend on the source and device.

| Example | Decoded input | Output | Output scale |
| --- | --- | --- | --- |
| Illustration, new detail views | 640×360 | 1920×1080 | Automatic |
| Hero still and original video illustration | 960×540 | 1920×1080 | 2× |
| Moving Hero excerpt in the showcase | 960×402 | 1920×804 | 2× |

## Showcase video

https://github.com/user-attachments/assets/56674f4d-dd3f-478f-b941-17387b18f4fa

[Watch on YouTube](https://youtu.be/Oy77dm2rm-s) · [Download MP4 — 1080p, 58 seconds](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/WebScaly-showcase-1080p.mp4) · [English captions](WebScaly-showcase.en.vtt) · [File inventory and SHA-256 checksums](assets.json)

| Time | What the video shows |
| --- | --- |
| 0:00 | Introduction |
| 0:04 | Website approval and enhancement activation |
| 0:12 | Selecting Anime4K Quality |
| 0:18 | OFF/ON wipe and matched detail comparisons |
| 0:30 | Moving animation processed by the extension |
| 0:36 | Player tools and comparison-slider interaction |
| 0:43 | Enhancement settings and site profiles |
| 0:50 | Local processing, website access and credits |

The video uses on-screen explanations and no audio. Native Chrome permission approval is explained; the interface demonstration uses a pregranted, isolated local website. The moving film excerpt retains its 24 fps source cadence. The 30 fps delivery duplicates frames without interpolation.

## Illustration — larger detail from a 360p source

![Original 360p video above and Anime4K Quality output below, with identical enlargement](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-360-detail-1000x1340.png)

The original illustration was downsampled and encoded as a **640×360 video before either capture**. OFF is that video's native playback; ON is actual Anime4K Quality output at 1920×1080 using Automatic scale. Both 304×144 crops are enlarged 3×. The editor does not blur the OFF side or sharpen the ON side.

[Large 1000×1340 detail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-360-detail-1000x1340.png) · [1280×800 store detail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-360-detail-1280x800.png) · [1920×1080 full frame](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-360-comparison-1920x1080.png) · [1280×800 full frame](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-360-comparison-1280x800.png)

This is original AI-generated demonstration artwork, separate from WebScaly's processing. It is not footage from an anime series. The showcase video retains its original **540p illustration source**; the new 360p still comparison is labeled separately.

## Hero — larger matched detail

![Hero face-detail comparison, original above and enhanced below](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-detail-1000x1340.png)

960×540 input → 1920×1080 output. Identical 304×144 crops enlarged 3× make contours easier to inspect at GitHub page widths. Hero © 2018 Blender Foundation, Daniel Martínez Lara, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Excerpted, cropped, resized and enhanced; no endorsement implied. [Original film](https://studio.blender.org/projects/hero/).

[Large 1000×1340 detail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-detail-1000x1340.png) · [1280×800 store detail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-detail-large-1280x800.png)

## Hero — full frame

![Hero: original on the left, Anime4K Quality enhancement on the right](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-comparison-1280x800.png)

960×540 input → 1920×1080 output. Hero © 2018 Blender Foundation, Daniel Martínez Lara, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Excerpted, cropped, resized and enhanced; no endorsement implied. [Original film](https://studio.blender.org/projects/hero/).

[1920×1080 image](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-comparison-1920x1080.png) · [1280×800 image](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/hero-comparison-1280x800.png)

## Original 540p illustration in the video

<details>
<summary>View the 540p comparison used in the showcase</summary>

![Original 540p illustration: enhancement OFF and Anime4K Quality ON](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-comparison-1280x800.png)

960×540 input → 1920×1080 output, 2× scale. Both sides use the same decoded frame. This source has more initial detail than the new 360p example.

[1920×1080 full frame](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-comparison-1920x1080.png) · [1920×1080 matched detail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/original-anime-detail-1920x1080.png)

</details>

## Video thumbnail

[1280×720 YouTube thumbnail](https://raw.githubusercontent.com/Lorcuz/WebScaly/main/docs/media/WebScaly-youtube-thumbnail-1280x720.png). It uses matching original/enhanced crops from the video's 540p illustration source.

## Reuse and attribution

Keep the visible credits when sharing the images or video. Read [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for source licenses, modifications, fonts and icons. The extension's MIT code license does not replace the film's CC BY 4.0 license. These demonstrations do not establish support or performance on every website or physical GPU.
