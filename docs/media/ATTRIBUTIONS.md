# Demonstration media credits

These credits apply to the videos, captions, thumbnails and comparison images in this directory, and to the comparison asset in `docs/store/assets/`.

## Hero

**Hero — © 2018 Blender Foundation, Daniel Martínez Lara.** Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

[Original film — Blender Studio](https://studio.blender.org/projects/hero/) · [Video source — Wikimedia Commons](https://commons.wikimedia.org/wiki/File:HERO_-_Blender_Open_Movie-full_movie.webm)

The film's own closing credit states CC BY 4.0. Changes: excerpted, cropped to 16:9, resized and encoded as 640×360 and 960×540 streams, played in a browser and enhanced with WebScaly, compared against matching decoded source frames, annotated and edited. Source audio is omitted. No endorsement by Blender Foundation or the film's creators is implied.

Retain the visible credits and this attribution with redistributed assets. Hero material remains CC BY 4.0; the extension's MIT code licence does not relicense the film.

Suggested short accompanying credit:

> Includes excerpts from Hero, © 2018 Blender Foundation, Daniel Martínez Lara, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Source: https://studio.blender.org/projects/hero/ . Cropped, resized and enhanced with WebScaly; no endorsement implied.

## Real camera footage in the 0.4.0 presentation

**“4K Nature Cinematography recorded with Nikon D5300” by Aliioss Film** (2022), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:4K_Nature_Cinematography_recorded_with_Nikon_D5300.webm) · [original upload](https://www.youtube.com/watch?v=F0lowv3DyfI). Used for the FSRCNNX showcase. Changes: a 6-second excerpt, cropped from its letterbox to 16:9, downscaled and encoded as a 640×360 stream, played in a browser and enhanced with WebScaly. The clip's soundtrack is not used. No endorsement implied.

**“Ultra High Definition (4K) View of Planet Earth”, NASA Johnson Space Center** (2016), filmed from the International Space Station; public domain. [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ultra_High_Definition_(4K)_View_of_Planet_Earth.webm) · [original upload](https://www.youtube.com/watch?v=oFDeNcu3mnc). Used for the Spatial Detail showcase. Changes: an 8-second excerpt, cropped to 16:9, downscaled and encoded as a 640×360 stream, played in a browser and enhanced with WebScaly. NASA does not endorse WebScaly.

## Music

**“Divider” by Chris Zabriskie**, from *Divider* (2011), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Source album](https://chriszabriskie.com/divider/) · [Artist's reuse guidance](https://chriszabriskie.com/use/).

Changes: excerpted, faded, gain adjusted, loudness normalized and mixed with interface sounds. The 0.4.0 presentation uses the track from 0:16 for 63 seconds; the 0.3.1 videos use an earlier edit crossfaded to the original ending. No endorsement implied.

## Interface sounds

**Kenney Interface Sounds**, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Source](https://kenney.nl/assets/interface-sounds). The click_002 and switch_002 sounds were filtered, gain adjusted and synchronized with actual interface actions.

## Interface, typography and icons

The videos and images show the actual WebScaly interface: **0.4.0** in the presentation film, **0.3.1** in the earlier files. Motion graphics use the extension's dark slate and mint palette and Inter typography.

Inter — Copyright 2016 The Inter Project Authors, [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt). Fonts are rendered into the images and videos; no font binaries are distributed here. The extension's own Inter notice remains in `public/licenses/Inter-OFL.txt`.

The presentation film's end card shows the Google Chrome and GitHub marks from [Simple Icons](https://simpleicons.org/) (CC0 1.0) to point to where WebScaly is available; the marks belong to their owners and no endorsement is implied. The shield-check symbol in the 0.3.1 showcase uses [Lucide](https://lucide.dev/license), with its [ISC notice](LUCIDE-LICENSE.txt). Recorded extension icons retain their notices in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

## 0.4.0 presentation film: capture and presentation

- Every enhanced picture, popup state, settings page, in-player toolbar, slider, HUD and toast is a capture of the WebScaly 0.4.0 build running in Chromium with WebGPU.
- The demonstration website is a local test page (`video.example`) whose access was granted ahead of time in an isolated test profile. Chrome's own permission prompt is described, not shown.
- Pointer movements were captured as real clicks and drags; the pointer graphic is drawn in editing at the recorded positions.
- The settings preview plays WebScaly's own generated test card; the harness stepped the card's timer one frame at a time so it plays at its real speed.
- Anime4K Quality on the 640×360 Hero stream, output 1920×1080. The engine comparison shows the same 640×360 frame through Spatial Detail, Anime4K and FSRCNNX with identical crops.
- No intermediate frames are generated, nothing is sharpened, blurred or dimmed in editing, and both sides of every comparison come from the same decoded frame.
- Frame rates, resolutions and GPU times shown are real readings from the capture machine; they are not a benchmark.

## 0.3.1 media: capture and presentation

**Original illustration.** Original AI-generated artwork prepared specifically for this demonstration; it is not footage from an anime series. A larger image was cropped, downsampled and encoded as a video input. The original showcase and 540p images use 960×540; the files named `original-anime-360-*` use 640×360. Both sides of each comparison use that example's same decoded source, and the enhanced side is actual WebScaly output. WebScaly runs its bundled enhancement pipelines locally and does not call an image-generation service.

- Anime4K CNN, Quality, 1080p output-height limit; actual WebGPU processing.
- Showcase illustration and film still: 960×540 input → 1920×1080 output, 2× output scale.
- Illustration stills: 640×360 input → 1920×1080 output, Automatic output scale. The source was downsampled and H.264 encoded before either capture; the OFF side was not blurred separately.
- Wide Hero held frame: 960×402 input → 1920×804 output, captured from the 24 fps source. The 44-second film holds matching frames during its wipe; its 60 fps timeline animates the presentation without interpolating source footage.
- The 44-second film's paired detail crops use identical coordinates and movement on both sides: 760×510 for Hero and 680×460 for the 360p illustration.
- 1920×1080 detail layouts magnify identical 432×304 crops to 864×608. The 1000×1340 layouts magnify 304×144 crops to 912×432. 1280×800 store detail layouts magnify identical 280×240 crops to 588×504. Both sides use equal pixel scaling.
- No extra editor sharpening or synthetic detail was added to enhanced output. Cropping and presentation resizing affect both sides equally.
- The approval sequence uses the real worker operation on a pregranted isolated local origin. The native Chrome permission bubble is described, not shown as a recorded action.
- These captures demonstrate output and interface behaviour, not universal website compatibility or physical GPU qualification.
