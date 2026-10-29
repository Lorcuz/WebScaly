import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { unzipSync } from "fflate";

const decoder = new TextDecoder();
export const version = JSON.parse(await readFile("package.json", "utf8")).version;
export const sourceName = `webscaly-source-${version}.zip`;
export const extensionName = `webscaly-${version}.zip`;
export const zipOptions = { level: 9, mtime: new Date("1980-01-01T00:00:00Z") };

export async function collect(root, files = {}, base = root) {
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, "en"))) {
    const path = resolve(root, entry.name);
    if (entry.isSymbolicLink()) throw Error("Symlink excluded");
    if (entry.isDirectory()) await collect(path, files, base);
    else if (entry.isFile()) files[relative(base,path).split(sep).join("/")] = new Uint8Array(await readFile(path));
  }
  return files;
}
export function audit(files, depth = 0) {
  if (depth > 2) throw Error("Unexpected archive nesting");
  for (const [name,bytes] of Object.entries(files)) {
    if (name.startsWith("/") || name.includes("\\") || name.split("/").some(part => part === "..") ||
      /(^|\/)(\.git|node_modules|\.env(?:\..*)?|evidence|models|framegen|personal|test-results|\.research)(\/|$)|\.(?:bin|map|pem|key)$/i.test(name))
      throw Error(`Excluded path: ${name}`);
    const text = decoder.decode(bytes);
    if (/[a-z]:[\\/]+(?:users|documents|program files)[\\/]+/i.test(text) ||
      /\/(?:Users|home)\/[^\s/]+\//.test(text) ||
      /figma\.com\/(?:design|file)\/[a-z0-9]{15,}/i.test(text) ||
      /(?:sk-[a-zA-Z0-9]{24,}|gh[pousr]_[a-zA-Z0-9]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))
      throw Error(`Private data detected: ${name}`);
    if (/\.png$/i.test(name)) {
      const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if (bytes.length < 20 || view.getUint32(0) !== 0x89504e47) throw Error(`Invalid PNG: ${name}`);
      let offset = 8, ended = false;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset), type = decoder.decode(bytes.subarray(offset+4,offset+8));
        if (offset+12+length > bytes.length) throw Error(`Invalid PNG chunk: ${name}`);
        if (["tEXt","zTXt","iTXt","eXIf"].includes(type)) throw Error(`Image metadata excluded: ${name}`);
        offset += 12 + length;
        if (type === "IEND") { ended = true; break; }
      }
      if (!ended || offset !== bytes.length) throw Error(`Unexpected image trailing data: ${name}`);
    }
    if (/\.zip$/i.test(name)) audit(unzipSync(bytes),depth+1);
  }
}
export const storeAssetNames = [
  "assets.json","icon-128.png","small-promo-440x280.png","marquee-promo-1400x560.png",
  "01-player-1280x800.png","02-settings-1280x800.png","03-popup-1280x800.png",
  "04-site-profiles-1280x800.png","05-about-1280x800.png","popup-ui.png",
];
export async function collectSource() {
  const source = {};
  for (const folder of ["src","public","tests/unit","tests/browser",".github"])
    for (const [name,bytes] of Object.entries(await collect(resolve(folder)))) source[`${folder}/${name}`] = bytes;
  const scripts = ["build-extension.mjs","package.mjs","release-files.mjs","verify-release.mjs","verify-source.mjs","prepare-publication.mjs",
    "playwright.mjs","serve.mjs","gpu-check.mjs","ui-capture.mjs","store-capture.mjs","site-check.mjs","make-fixtures.mjs"];
  const roots = ["README.md","LICENSE","THIRD_PARTY_NOTICES.md","PRIVACY.md","SUPPORT.md","SECURITY.md","CONTRIBUTING.md",
    "CHANGELOG.md","CHROMEWEBSTORE.md","package.json","package-lock.json","tsconfig.json","vite.config.ts",
    "playwright.config.ts","popup.html","options.html","ui-frame.html","lab.html","benchmark.html","viewer.html",".gitignore",".gitattributes"];
  const docs = ["ARCHITECTURE","COMPATIBILITY","DELIVERY","DESIGN","LOCAL_VIDEO_ENHANCEMENT","PERFORMANCE","PLAN","RESEARCH","REVIEW","TESTING","UPGRADE"].map(n=>`docs/${n}.md`);
  for (const name of [...roots,...scripts.map(n=>"scripts/"+n),...docs,
    ...["README","PRIVACY","PERMISSIONS","LISTING"].map(n=>`docs/store/${n}.md`),
    "docs/store/description.txt","docs/publishing/GITHUB.md",...storeAssetNames.map(n=>"docs/store/assets/"+n)])
    source[name] = new Uint8Array(await readFile(name));
  audit(source);
  return source;
}
export const runtimeNames = new Set([
  "manifest.json","BUILD.json","content.js","background.js","popup.html","options.html","ui-frame.html","viewer.html",
  "lab.html","benchmark.html","LICENSE.txt","THIRD_PARTY_NOTICES.md"
]);
export function runtimeAllowed(name) {
  return runtimeNames.has(name) ||
    /^_locales\/(?:en|ja)\/messages\.json$/.test(name) ||
    /^assets\/[\w.-]+\.(?:js|css|woff2?)$/.test(name) ||
    /^icons\/(?:16|32|48|128)\.png$/.test(name) ||
    /^(?:images\/italy\.svg|images\/support-paypal\.png)$/.test(name) ||
    /^licenses\/[\w.-]+\.(?:txt|md)$/.test(name) ||
    /^compliance\/(?:fsrcnnx\/[\w./-]+|webscaly-source-[\d.]+\.zip)$/.test(name);
}
export function validateRuntime(runtime) {
  audit(runtime);
  for (const name of Object.keys(runtime)) if (!runtimeAllowed(name)) throw Error(`Unexpected runtime file: ${name}`);
  for (const name of [...runtimeNames,`compliance/${sourceName}`,"licenses/LGPL-3.0.txt","licenses/GPL-3.0.txt",
    "_locales/en/messages.json","_locales/ja/messages.json","licenses/Tabler-MIT.txt","licenses/Country-Flags-NOTICE.txt","images/italy.svg","images/support-paypal.png",
    ...[16,32,48,128].map(n=>`icons/${n}.png`)])
    if (!runtime[name]) throw Error(`Missing runtime asset: ${name}`);
  const manifest = JSON.parse(decoder.decode(runtime["manifest.json"]));
  if (manifest.manifest_version !== 3 || manifest.minimum_chrome_version !== "121" || manifest.version !== version ||
    manifest.host_permissions?.length || manifest.content_scripts?.length ||
    JSON.parse(decoder.decode(runtime["BUILD.json"])).version !== version ||
    JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(["activeTab","scripting","storage"]) ||
    JSON.stringify(manifest.optional_host_permissions) !== JSON.stringify(["http://*/*","https://*/*"]) ||
    JSON.stringify(manifest.web_accessible_resources?.map(r=>r.resources)) !== JSON.stringify([["ui-frame.html"]]))
    throw Error("Unexpected manifest or build permissions");
  for (const [name,bytes] of Object.entries(runtime)) {
    if (/\.html$/.test(name)) for (const match of decoder.decode(bytes).matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:https?:|data:|#)/.test(match[1])) continue;
      const target = match[1].replace(/^\.\//,"").replace(/^\//,"").split(/[?#]/)[0];
      if (target && !runtime[target]) throw Error(`Missing entry reference: ${name} -> ${target}`);
    }
  }
  return manifest;
}
export async function writeTree(root,files) {
  const base = resolve(root);
  for (const [name,bytes] of Object.entries(files)) {
    const path = resolve(base,name);
    if (!path.startsWith(base+sep)) throw Error("Invalid export path");
    await mkdir(resolve(path,".."),{recursive:true});
    await writeFile(path,bytes);
  }
}
