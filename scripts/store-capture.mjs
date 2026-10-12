import { readFile,writeFile,mkdir,mkdtemp,cp } from "node:fs/promises";
import { resolve,sep,extname } from "node:path";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { version } from "./release-files.mjs";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(".playwright"))
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
const { chromium } = await import("@playwright/test");
const folder = "docs/store/assets", stage = await mkdtemp(resolve("test-results/store-art-"));
await mkdir(folder,{recursive:true});
await cp("public/icons/128.png",`${folder}/icon-128.png`);
await cp("public/logo-master.png",resolve(stage,"logo.png"));
await cp("public/icons/128.png",resolve(stage,"icon.png"));
const font = "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2";
await cp(font,resolve(stage,"inter.woff2"));

await writeFile(resolve(stage,"demo.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Video demo · WebScaly</title><style>
@font-face{font-family:Inter;src:url('./inter.woff2')}*{box-sizing:border-box}body{margin:0;background:#10181f;color:#e5edf4;font-family:Inter,system-ui}
header{height:100px;display:flex;align-items:center;justify-content:space-between;margin:0 48px;border-bottom:1px solid #293c47}
.brand{display:flex;align-items:center;gap:12px;font-size:24px;font-weight:600}.brand img{width:40px;height:40px}.eyebrow{color:#8ca9ba;font-size:13px}
main{margin:24px auto;width:1100px}.player{position:relative;width:1100px;background:#0b1117}video{width:100%;display:block}
footer{display:flex;justify-content:space-between;margin:20px 0;color:#91abba;font-size:13px}button{background:#244c40;color:#94f1d2;border:1px solid #3b6b58;padding:10px 18px;border-radius:6px;font:inherit}
:focus-visible{outline:2px solid #79dfbd;outline-offset:3px}
</style></head><body><header><div class="brand"><img src="icon.png" alt="">WebScaly</div><div class="eyebrow">Video enhancement · on your device</div></header><main><div class="player"><video id="video" muted controls playsinline aria-label="Original abstract demonstration video"></video></div><footer><span>Original demo footage · optional comparison enabled</span><button id="start">Play demo</button></footer></main><script src="demo.js"></script></body></html>`);
await writeFile(resolve(stage,"demo.js"),`const video=document.querySelector('#video'); document.querySelector('#start').addEventListener('click',async()=>{
const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const c=canvas.getContext('2d');let f=0;
function draw(){c.fillStyle='#172b3b';c.fillRect(0,0,640,360);
for(let i=0;i<30;i++){c.strokeStyle=i%2?'#264d58':'#315661';c.lineWidth=1;c.beginPath();c.moveTo(i*26-40,0);c.lineTo(i*26-200,360);c.stroke();}
c.strokeStyle='#76ddbd';c.lineWidth=2;for(let i=0;i<5;i++){c.beginPath();c.arc(325,175,56+i*19,f/150+i*.6,f/150+i*.6+4.2);c.stroke();}
c.fillStyle='#a9efd6';c.beginPath();c.arc(325+115*Math.cos(f/65),175+115*Math.sin(f/65),11,0,Math.PI*2);c.fill();
c.fillStyle='#759cae';for(let x=0;x<640;x+=4)c.fillRect(x,305,1,35);f++;}
draw();const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];const timer=setInterval(()=>{draw();track.requestFrame()},1000/30);
const parts=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1200000});recorder.ondataavailable=e=>parts.push(e.data);
const done=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,2200));recorder.stop();await done;
clearInterval(timer);stream.getTracks().forEach(t=>t.stop());video.src=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));video.loop=true;await video.play();
document.querySelector('#start').textContent='Playing demo';document.querySelector('#start').disabled=true;
});`);
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,"http://localhost").pathname,path=resolve(stage,"."+decodeURIComponent(pathname));
if(!path.startsWith(stage+sep))throw Error("Invalid path");
const bytes=await readFile(path);
res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".png":"image/png",".woff2":"font/woff2"})[extname(path)]??"application/octet-stream"});
res.end(bytes);}catch{res.writeHead(404);res.end("Not found");}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const base=`http://127.0.0.1:${server.address().port}`;
const extension=await mkdtemp(resolve("test-results/store-extension-")); await cp("dist",extension,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(extension,"manifest.json"),"utf8"));
manifest.host_permissions=["http://127.0.0.1/*"];
await writeFile(resolve(extension,"manifest.json"),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(await mkdtemp(resolve("test-results/store-profile-")),{
 channel:"chromium",headless:true,viewport:{width:1280,height:800},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
});
async function save(page,name){const bytes=await page.screenshot({animations:"disabled"});await sharp(bytes).flatten({background:"#10181f"}).removeAlpha().png().toFile(`${folder}/${name}`);}
try{
const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),id=new URL(worker.url()).host;
const settings={enabled:true,algorithm:"spatial",quality:"balanced",scale:"2",maxHeight:1080,strength:.35,denoise:.12,hud:false,comparison:true,split:.5,controls:true};
await worker.evaluate(async(config)=>chrome.storage.local.set({webscalyConfig:config}),{version:2,defaults:{...settings,controls:false,comparison:false},sites:[{origin:"http://127.0.0.1",subdomains:false,settings}],presets:[]});
const page=await context.newPage(); await page.goto(base+"/demo.html");await page.getByRole("button",{name:"Play demo",exact:true}).click();
await page.locator('webscaly-player[data-state="active"]').waitFor();
await page.frameLocator('iframe[title="WebScaly video controls"]').getByRole("button",{name:"HUD",exact:true}).waitFor();
await page.locator("video").hover();
await page.waitForTimeout(250);
await save(page,"01-player-1280x800.png");
const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url?.includes("/demo.html"))?.id;});
if(!tabId)throw Error("Demo tab unavailable");
const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html?tab=${tabId}&profile=${encodeURIComponent("http://127.0.0.1")}`);
await options.getByLabel("Editing profile").selectOption("http://127.0.0.1");
await save(options,"02-settings-1280x800.png");
await options.getByRole("button",{name:"Site Profiles",exact:true}).click();await save(options,"04-site-profiles-1280x800.png");
await options.getByRole("button",{name:"About",exact:true}).click();await save(options,"05-about-1280x800.png");
const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
await popup.getByRole("button",{name:"Remove website access",exact:true}).waitFor();
const popupBytes=await popup.locator("main.popup").screenshot({animations:"disabled"});
await sharp(popupBytes).flatten({background:"#10181f"}).removeAlpha().png().toFile(`${folder}/popup-ui.png`);
await cp(`${folder}/popup-ui.png`,resolve(stage,"popup.png"));
const graphics=await context.newPage();
const css=`@font-face{font-family:Inter;src:url('${base}/inter.woff2')}*{box-sizing:border-box}body{margin:0;color:#e5edf4;background:#10181f;font-family:Inter,system-ui}h1,p{margin:0}img{object-fit:contain}.accent{color:#79dfbd}.muted{color:#96afbd}`;
await graphics.setContent(`<!doctype html><html lang="en"><head><title>WebScaly popup overview</title><style>${css}
main{height:800px;display:flex;align-items:center;padding:68px 88px;gap:115px}section{width:575px}.brand{display:flex;align-items:center;gap:14px;font-size:27px;margin-bottom:48px}.brand img{width:54px;height:54px}h1{font-size:49px;line-height:1.15;letter-spacing:-1.8px}p{font-size:20px;line-height:1.65;margin-top:25px}
.capture{width:360px;height:auto;border-radius:10px;box-shadow:0 20px 65px #080e15}footer{font-size:13px;color:#96afbd;margin-top:35px;line-height:1.6}
</style></head><body><main><section><div class="brand"><img src="${base}/icon.png" alt="">WebScaly</div><h1>Approve a site.<br><span class="accent">Choose your detail.</span></h1><p class="muted">Enhancement, quality and optional player tools in one compact popup.</p><footer>Access starts off. You choose the websites.<br>Actual popup shown with the original local video demo.</footer></section><img class="capture" src="${base}/popup.png" alt="Actual WebScaly popup"></main></body></html>`);
await graphics.locator(".capture").evaluate(img=>img.decode()); await graphics.evaluate(()=>document.fonts.ready);
await save(graphics,"03-popup-1280x800.png");
await graphics.setViewportSize({width:440,height:280});
await graphics.setContent(`<!doctype html><html lang="en"><head><title>WebScaly</title><style>${css}
main{width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-top:3px solid #79dfbd}img{width:132px;height:132px;margin-bottom:12px}h1{font-size:32px;letter-spacing:-1px}p{font-size:12px;color:#96afbd;letter-spacing:1.2px;margin-top:10px}
</style></head><body><main><img src="${base}/logo.png" alt=""><h1>WebScaly</h1><p>LOCAL VIDEO ENHANCEMENT</p></main></body></html>`);
await graphics.locator("img").evaluate(img=>img.decode());await graphics.evaluate(()=>document.fonts.ready);
await save(graphics,"small-promo-440x280.png");
await graphics.setViewportSize({width:1400,height:560});
await graphics.setContent(`<!doctype html><html lang="en"><head><title>WebScaly</title><style>${css}
main{width:1400px;height:560px;display:flex;align-items:center;justify-content:space-between;padding:70px 105px;border-top:4px solid #79dfbd}.brand{display:flex;align-items:center;gap:14px;font-size:28px;margin-bottom:36px}.brand img{width:50px;height:50px}
h1{font-size:61px;letter-spacing:-2.4px;line-height:1.12}p{font-size:20px;color:#96afbd;margin-top:30px}.mark{width:330px;height:330px;margin-right:30px}
</style></head><body><main><section><div class="brand"><img src="${base}/icon.png" alt="">WebScaly</div><h1>Bring your videos<br><span class="accent">into focus.</span></h1><p>On your device. On websites you choose.</p></section><img class="mark" src="${base}/logo.png" alt=""></main></body></html>`);
await graphics.locator(".mark").evaluate(img=>img.decode());await graphics.evaluate(()=>document.fonts.ready);
await save(graphics,"marquee-promo-1400x560.png");
const names=["icon-128.png","small-promo-440x280.png","marquee-promo-1400x560.png","01-player-1280x800.png","02-settings-1280x800.png","03-popup-1280x800.png","04-site-profiles-1280x800.png","05-about-1280x800.png","popup-ui.png"], files=[];
for(const name of names){const meta=await sharp(`${folder}/${name}`).metadata();if(name!=="icon-128.png"&&(meta.hasAlpha||meta.channels!==3||meta.depth!=="uchar"))throw Error("Store raster must be 24-bit RGB: "+name);files.push({file:name,width:meta.width,height:meta.height,alpha:meta.hasAlpha,channels:meta.channels});}
await writeFile(`${folder}/assets.json`,JSON.stringify({version,footage:"Original procedural video, created locally for WebScaly",screenshots:"Actual installed extension with test-only loopback approval; popup overview contains its unaltered UI capture",files},null,2)+"\n");
console.log("Captured five current screenshots, both promo sizes, icon and supporting popup capture.");
}finally{await context.close();await new Promise(r=>server.close(r));}
