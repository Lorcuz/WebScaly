import { build } from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
await build({
  entryPoints: ["src/extension/content.ts"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  target: "chrome121",
  loader: { ".wgsl": "text", ".woff2": "binary" },
  minify: true,
});
await build({
  entryPoints: ["src/extension/background.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "esm",
  target: "chrome121",
  minify: true,
});
await mkdir("dist/icons", { recursive: true });
for (const size of [16, 32, 48, 128])
  await copyFile(`public/icons/${size}.png`, `dist/icons/${size}.png`);
await copyFile("LICENSE", "dist/LICENSE.txt");
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
await mkdir("dist/compliance/fsrcnnx/shaders", { recursive: true });
for (const file of [
  "FSRCNNX_x2_16-0-4-1.wgsl",
  "FSRCNNX_x2_16-0-4-1.passes.json",
])
  await copyFile(`src/vendor/${file}`, `dist/compliance/fsrcnnx/${file}`);
for (const file of ["enhancement.ts", "device.ts"])
  await copyFile(`src/core/${file}`, `dist/compliance/fsrcnnx/${file}`);
for (const file of ["settings.ts", "settings-core.ts"])
  await copyFile(`src/shared/${file}`, `dist/compliance/fsrcnnx/${file}`);
for (const file of [
  "capture.wgsl",
  "prefilter.wgsl",
  "scale.wgsl",
  "present.wgsl",
  "hint.wgsl",
])
  await copyFile(
    `src/core/shaders/${file}`,
    `dist/compliance/fsrcnnx/shaders/${file}`,
  );
await writeFile(
  "dist/BUILD.json",
  JSON.stringify(
    {
      name: "WebScaly",
      version: JSON.parse(await readFile("package.json", "utf8")).version,
    },
    null,
    2,
  ),
);
console.log("WebScaly distributable extension built at dist/.");
