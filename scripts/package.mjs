import { writeFile, mkdir, copyFile, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { zipSync, unzipSync } from "fflate";
import { version,sourceName,extensionName,zipOptions,collect,collectSource,runtimeAllowed,validateRuntime,writeTree } from "./release-files.mjs";

const source = await collectSource(), sourceZip = zipSync(source,zipOptions);
await mkdir("release",{recursive:true});
await writeFile(`release/${sourceName}`,sourceZip);
await mkdir("dist/compliance",{recursive:true});
await copyFile(`release/${sourceName}`,`dist/compliance/${sourceName}`);
const built = await collect(resolve("dist")), runtime = {};
for (const [name,bytes] of Object.entries(built)) if (runtimeAllowed(name)) runtime[name] = bytes;
validateRuntime(runtime);
const extensionZip = zipSync(runtime,zipOptions);
validateRuntime(unzipSync(extensionZip));
// Each export uses a new directory so an older source tree cannot leak removed files.
const exportRoot = await mkdtemp(resolve("release/github-source-"));
await writeTree(exportRoot,source);
await writeFile(`release/${extensionName}`,extensionZip);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
await writeFile("release/inventory.json",JSON.stringify({
  version,recursiveAudit:"passed",sourceExport:exportRoot.split(/[\\/]/).at(-1),sourceFiles:Object.keys(source).length,runtimeFiles:Object.keys(runtime).length,
  extensionZip:{file:extensionName,bytes:extensionZip.length,sha256:hash(extensionZip)},
  sourceZip:{file:sourceName,bytes:sourceZip.length,sha256:hash(sourceZip)},
  files:Object.fromEntries(Object.entries(runtime).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}]))
},null,2)+"\n");
console.log(`Verified ${Object.keys(runtime).length} runtime files and ${Object.keys(source).length} public source files, including nested corresponding source.`);
