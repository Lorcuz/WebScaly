# Demonstration media credits

These credits apply to the showcase video, comparison images in this directory, and `docs/store/assets/01-player-1280x800.png`.

## Hero

**Hero — © 2018 Blender Foundation, Daniel Martínez Lara.** Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

[Original film — Blender Studio](https://studio.blender.org/projects/hero/) · [Video source — Wikimedia Commons](https://commons.wikimedia.org/wiki/File:HERO_-_Blender_Open_Movie-full_movie.webm)

The film's own closing credit states CC BY 4.0. Changes: excerpted, cropped, resized, enhanced with WebScaly Anime4K Quality, compared against matching decoded source frames, annotated and edited. Source audio is omitted. No endorsement by Blender Foundation or the film's creators is implied.

Retain the visible credits and this attribution with redistributed assets. Hero material remains CC BY 4.0; the extension's MIT code license does not relicense the film.

Suggested short accompanying credit:

> Includes excerpts from Hero, © 2018 Blender Foundation, Daniel Martínez Lara, CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Source: https://studio.blender.org/projects/hero/ . Cropped, resized and enhanced with WebScaly; no endorsement implied.

## Original illustration

Original AI-generated artwork prepared specifically for this demonstration. A larger image was cropped and downsampled to a 960×540 input. Both comparison sides use that same decoded source. The enhanced side is actual WebScaly output.

The illustration is separate from the extension's processing: WebScaly runs its bundled enhancement pipelines locally and does not call an image-generation service.

## Interface, typography and icons

The captures show the actual **WebScaly 0.3.1** interface on an isolated local demonstration website. Motion graphics use the extension's dark/mint palette and Inter typography.

Inter — Copyright 2016 The Inter Project Authors, [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt). Fonts are rendered into the images and video; no font binaries are distributed here. The extension's own Inter notice remains in `public/licenses/Inter-OFL.txt`.

The shield-check symbol in the video uses [Lucide](https://lucide.dev/license), with its [ISC notice](LUCIDE-LICENSE.txt). Static comparison power/sparkle symbols are simple geometric SVGs created for the layout. Recorded extension icons retain their notices in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

## Capture and presentation

- Anime4K CNN, Quality, 2× output scale, 1080p output-height limit; actual WebGPU processing.
- Illustration and film still: 960×540 input → 1920×1080 output.
- Moving film excerpt: 960×402 input → 1920×804 output; 24 fps source. The 30 fps delivery duplicates frames without interpolation.
- Detail images magnify identical 432×304 crops to 864×608, using equal pixel scaling on each side.
- No extra editor sharpening or synthetic detail was added to enhanced output. Cropping and presentation resizing affect both sides equally.
- The approval sequence uses the real worker operation on a pregranted isolated local origin. The native Chrome permission bubble is described, not shown as a recorded action.
- These captures demonstrate output and interface behavior, not universal website compatibility or physical GPU qualification.
