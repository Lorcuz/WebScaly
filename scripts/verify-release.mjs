import { readFile,writeFile,mkdir,mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { extensionName,sourceName,version,validateRuntime,audit,writeTree } from "./release-files.mjs";
const archive=process.argv[2]??`release/${extensionName}`;
const bytes=new Uint8Array(await readFile(archive)),runtime=unzipSync(bytes);
validateRuntime(runtime);
const source=unzipSync(runtime[`compliance/${sourceName}`]);audit(source);
await mkdir("test-results",{recursive:true});
const root=await mkdtemp(resolve("test-results/packaged-extension-"));await writeTree(root,runtime);
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(".playwright"))process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(".playwright");
const {chromium,expect}=await import("@playwright/test");
const context=await chromium.launchPersistentContext(await mkdtemp(resolve("test-results/package-profile-")),{
 channel:"chromium",headless:true,viewport:{width:1280,height:900},
 args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]
});
const errors=[],badRequests=[],checks=[];
context.on("page",page=>{
 page.on("pageerror",error=>errors.push(error.message));
 page.on("requestfailed",request=>badRequests.push(new URL(request.url()).pathname));
 page.on("response",response=>{if(response.status()>=400)badRequests.push(new URL(response.url()).pathname);});
 page.on("request",request=>{if(/^https?:/.test(request.url()))errors.push("Unexpected external network request");});
});
try{
const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),id=new URL(worker.url()).host;
const granted=await worker.evaluate(()=>chrome.permissions.getAll());
assert.deepEqual((granted.origins??[]).filter(origin=>/^https?:/.test(origin)),[]);
checks.push("No website permission granted on installation");
const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
await expect(options.getByRole("heading",{name:"Enhancement",exact:true})).toBeVisible();
for(const name of ["Controls","Compare","HUD"])await expect(options.getByRole("switch",{name,exact:true})).not.toBeChecked();
checks.push("Hidden player-tool defaults preserved");
for(const section of ["Websites","Presets","Behavior","Diagnostics","Getting started","About"]){
 await options.getByRole("button",{name:section,exact:true}).click();
 await expect(options.getByRole("heading",{name:section,exact:true})).toBeVisible();
}
checks.push("All seven settings sections load from the ZIP");
const flag=options.getByRole("img",{name:"🇮🇹",exact:true});
assert(await flag.evaluate(img=>img.complete&&img.naturalWidth>0));
await expect(options.getByRole("img",{name:"PayPal donation QR code",exact:true})).toBeHidden();
await options.getByRole("button",{name:"Support WebScaly",exact:true}).press("Enter");
const qr=options.getByRole("img",{name:"PayPal donation QR code",exact:true});
await expect(qr).toBeVisible();
assert(await qr.locator("img").evaluate(img=>img.complete&&img.naturalWidth===815));
checks.push("About flag and hidden/revealed QR assets work");
await options.screenshot({path:"test-results/packaged-about.png",animations:"disabled"});
const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
await expect(popup.getByRole("button",{name:"Settings",exact:true})).toBeVisible();
const dims=await popup.locator("main.popup").evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scroll:el.scrollHeight-el.clientHeight}));
assert.equal(dims.width,360);assert(dims.height<=600&&dims.scroll<=1);
const icon=await popup.getByRole("button",{name:"Settings",exact:true}).locator("svg").evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
assert.equal(icon.width,icon.height);assert.equal(icon.width,20);
checks.push("Compact popup and square gear preserved");
for(const entry of ["viewer.html","lab.html","benchmark.html"]){
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/${entry}`);
 await page.waitForLoadState("networkidle");await page.close();
}
checks.push("Viewer and diagnostic entry points load");
assert.deepEqual(badRequests,[]);assert.deepEqual(errors,[]);
checks.push("No missing resources, page errors or external HTTP requests");
const result={version,recursiveAudit:"passed",checks,extensionSha256:createHash("sha256").update(bytes).digest("hex")};
await writeFile("test-results/package-verification.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
}finally{await context.close();}
