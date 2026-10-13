import { readFile,writeFile,mkdir,copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { version,sourceName,extensionName,storeAssetNames,validateRuntime,audit,collect,writeTree } from "./release-files.mjs";
await mkdir("Publishing",{recursive:true});
const base=resolve(`Publishing/WebScaly-${version}`);
await mkdir(base);
const github=resolve(base,"GitHub"),store=resolve(base,"Chrome Web Store");
const bytes=new Uint8Array(await readFile(`release/${extensionName}`)),runtime=unzipSync(bytes);
validateRuntime(runtime);
const verification=JSON.parse(await readFile("test-results/package-verification.json","utf8"));
const rebuild=JSON.parse(await readFile("test-results/source-verification.json","utf8"));
if(verification.extensionSha256!==createHash("sha256").update(bytes).digest("hex"))
 throw Error("Verify this exact extension ZIP before preparing the handoff");
if(rebuild.extensionSha256!==verification.extensionSha256||rebuild.rebuild!=="byte-identical")
 throw Error("Rebuild this exact source archive before preparing the handoff");
const sourceBytes=await readFile(`release/${sourceName}`);
if(!sourceBytes.equals(Buffer.from(runtime[`compliance/${sourceName}`])))
 throw Error("Corresponding-source archive does not match the extension");
const source=unzipSync(runtime[`compliance/${sourceName}`]);audit(source);
await writeTree(github,source);await mkdir(store,{recursive:true});
await copyFile(`release/${extensionName}`,resolve(store,extensionName));
await copyFile(`release/${sourceName}`,resolve(store,sourceName));
await copyFile("CHROMEWEBSTORE.md",resolve(store,"STORE-LISTING-AND-PRIVACY.md"));
await copyFile("docs/store/description.txt",resolve(store,"DESCRIPTION.txt"));
await copyFile("PRIVACY.md",resolve(store,"PRIVACY-POLICY.md"));
await copyFile("docs/publishing/GITHUB.md",resolve(base,"GITHUB-SETUP.md"));
await copyFile("release/inventory.json",resolve(base,"CHECKSUMS-AND-INVENTORY.json"));
await mkdir(resolve(store,"assets"),{recursive:true});
for(const name of storeAssetNames)if(name!=="popup-ui.png")
 await copyFile(`docs/store/assets/${name}`,resolve(store,"assets",name));
await copyFile("test-results/package-verification.json",resolve(base,"PACKAGE-VERIFICATION.json"));
await copyFile("test-results/source-verification.json",resolve(base,"SOURCE-VERIFICATION.json"));
await writeFile(resolve(base,"START-HERE.md"),`# WebScaly ${version} release handoff

WebScaly is published at https://chromewebstore.google.com/detail/webscaly/hdcnniaagmhkocoeahemlpgjecgpchfa. This folder supports future releases of the existing extension.

1. Read GITHUB-SETUP.md and review the **contents** of GitHub/ against the existing public repository at https://github.com/Lorcuz/WebScaly. README, .gitignore, LICENSE, source, tests and notices are included; private development history is excluded. Preserve the repository's public history.
2. Confirm the repository's PRIVACY.md and SUPPORT.md links load publicly.
3. For a future extension update, use a version newer than the published store version and upload **Chrome Web Store/${extensionName}** to the existing item's developer dashboard.
4. Copy Description from DESCRIPTION.txt; use STORE-LISTING-AND-PRIVACY.md for all other fields, privacy declarations and permission explanations.
5. Upload the icon, five screenshots and promo tiles from Chrome Web Store/assets/.
6. Keep account/contact verification and any required publisher/trader fields current, then submit the update for review.

The corresponding-source ZIP is provided for GitHub Releases and licensing; it is already included inside the extension ZIP. Do not upload it as the extension package. The verification and inventory files are handoff records, not extra repository files.

This command prepares files locally; publishing a GitHub release or submitting a store update is a separate action. Documentation-only changes need no new extension version or store upload. Compatibility and manual validation limits are documented in the repository.
`);
audit(await collect(github));
console.log(base);
