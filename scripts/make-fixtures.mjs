// Original procedural footage, generated locally for offline player/stream tests.
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
await access(ffmpeg);
const root = resolve("test-results/media");
const input = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=30",
  "-t",
  "6",
  "-an",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-preset",
  "ultrafast",
  "-crf",
  "24",
  "-g",
  "30",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-map_metadata",
  "-1",
  "-fflags",
  "+bitexact",
  "-flags:v",
  "+bitexact",
];
for (const format of ["hls", "dash"]) {
  const folder = resolve(root, format);
  await mkdir(folder, { recursive: true });
  const mux =
    format === "hls"
      ? [
          "-f",
          "hls",
          "-hls_time",
          "1",
          "-hls_playlist_type",
          "vod",
          "-hls_segment_type",
          "fmp4",
          "-hls_fmp4_init_filename",
          "init.mp4",
          "-hls_segment_filename",
          "segment-%03d.m4s",
          "index.m3u8",
        ]
      : [
          "-f",
          "dash",
          "-seg_duration",
          "1",
          "-use_template",
          "1",
          "-use_timeline",
          "1",
          "index.mpd",
        ];
  execFileSync(ffmpeg, [...input, ...mux], { cwd: folder, stdio: "inherit" });
}
console.log("Generated local HLS and DASH fixtures.");
