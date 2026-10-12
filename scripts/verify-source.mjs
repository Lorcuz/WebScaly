import { readFile,writeFile,mkdir,mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { extensionName,sourceName,version,validateRuntime,audit,writeTree } from "./release-files.mjs";
if(!process.env.npm_execpath)throw Error("Run this check through npm run verify:source");
const npm=process.env.npm_execpath;
await mkdir("test-results",{recursive:true});
const folder=await mkdtemp(resolve("test-results/clean-source-"));
const extensionBytes=new Uint8Array(await readFile(`release/${extensionName}`));
const runtime=unzipSync(extensionBytes);validateRuntime(runtime);
const source=unzipSync(runtime[`compliance/${sourceName}`]);audit(source);await writeTree(folder,source);
async function run(args){
 await new Promise((done,reject)=>{
  const child=spawn(process.execPath,[npm,...args],{cwd:folder,stdio:"inherit"});
  child.on("error",reject);child.on("exit",code=>code===0?done():reject(Error(`Clean-source command failed: npm ${args.join(" ")}`)));
 });
}
await run(["ci"]);await run(["test"]);await run(["run","build"]);await run(["run","package"]);
const rebuilt=unzipSync(new Uint8Array(await readFile(resolve(folder,"release",extensionName))));validateRuntime(rebuilt);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const different=Object.keys(runtime).filter(name=>!rebuilt[name]||hash(runtime[name])!==hash(rebuilt[name]));
const extra=Object.keys(rebuilt).filter(name=>!runtime[name]);
if(different.length||extra.length)throw Error(`Rebuild mismatch: ${[...different,...extra].join(", ")}`);
const result={version,sourceAudit:"passed",cleanInstall:"passed",unitTests:"passed",rebuild:"byte-identical",runtimeFiles:Object.keys(runtime).length,
 extensionSha256:hash(extensionBytes),sourceSha256:hash(runtime[`compliance/${sourceName}`])};
await writeFile("test-results/source-verification.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
