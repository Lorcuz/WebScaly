# Demonstration media credits

These credits apply to the showcase video, comparison images and video thumbnail in this directory, and the comparison assets in `docs/store/assets/`.

## Hero

**Hero — © 2018 Blender Foundation, Daniel Martínez Lara.** Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

[Original film — Blender Studio](https://studio.blender.org/projects/hero/) · [Video source — Wikimedia Commons](https://commons.wikimedia.org/wiki/File:HERO_-_Blender_Open_Movie-full_movie.webm)

The film's own closing credit states CC BY 4.0. Changes: excerpted, cropped, resized, enhanced with WebScaly Anime4K Quality, compared against matching decoded source frames, annotated and edited. Source audio is omitted. No endorsement by Blender Foundation or the film's creators is implied.

Retain the visible credits and this attribution with redistributed assets. Hero material remains CC BY 4.0; the extension's MIT code license does not relicense the film.

Suggested short accompanying credit:

> Includes excerpts from Hero, © 2018 Blender Foundation, Daniel Martínez Lara, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Source: https://studio.blender.org/projects/hero/ . Cropped, resized and enhanced with WebScaly; no endorsement implied.

## Original illustration

Original AI-generated artwork prepared specifically for this demonstration. A larger image was cropped, downsampled and encoded as a video input. The original showcase and 540p images use 960×540; the newer files named `original-anime-360-*` use 640×360. Both sides of each comparison use that example's same decoded source. The enhanced side is actual WebScaly output. The thumbnail uses the showcase's 540p source.

The illustration is separate from the extension's processing: WebScaly runs its bundled enhancement pipelines locally and does not call an image-generation service.

## Interface, typography and icons

The captures show the actual **WebScaly 0.3.1** interface on an isolated local demonstration website. Motion graphics use the extension's dark/mint palette and Inter typography.

Inter — Copyright 2016 The Inter Project Authors, [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt). Fonts are rendered into the images and video; no font binaries are distributed here. The extension's own Inter notice remains in `public/licenses/Inter-OFL.txt`.

The shield-check symbol in the video uses [Lucide](https://lucide.dev/license), with its [ISC notice](LUCIDE-LICENSE.txt). Static comparison power/sparkle symbols are simple geometric SVGs created for the layout. Recorded extension icons retain their notices in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

## Capture and presentation

- Anime4K CNN, Quality, 1080p output-height limit; actual WebGPU processing.
- Showcase illustration and film still: 960×540 input → 1920×1080 output, 2× output scale.
- New illustration stills: 640×360 input → 1920×1080 output, Automatic output scale. The source was downsampled and H.264 encoded before either capture; the OFF side was not blurred separately.
- Moving film excerpt: 960×402 input → 1920×804 output; 24 fps source. The 30 fps delivery duplicates frames without interpolation.
- Original 1920×1080 detail layouts magnify identical 432×304 crops to 864×608. The new 1000×1340 layouts magnify 304×144 crops to 912×432. Both use equal pixel scaling on each side.
- New 1280×800 store detail layouts magnify identical 280×240 crops to 588×504 on each side.
- No extra editor sharpening or synthetic detail was added to enhanced output. Cropping and presentation resizing affect both sides equally.
- The approval sequence uses the real worker operation on a pregranted isolated local origin. The native Chrome permission bubble is described, not shown as a recorded action.
- These captures demonstrate output and interface behavior, not universal website compatibility or physical GPU qualification.
