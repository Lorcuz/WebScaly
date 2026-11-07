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
// Real captures of the extension (see docs/store/frames/README.md), used unaltered for the comparison images.
const frames = "docs/store/frames";
for (const name of ["hero-compare-1088x612.png","tile-spatial-368x400.png","tile-anime4k-368x400.png","tile-fsrcnnx-368x400.png"])
  await cp(`${frames}/${name}`,resolve(stage,name));
for (const w of [500,600,700]) await cp(`node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`,resolve(stage,`inter-${w}.woff2`));

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
async function save(page,name){const bytes=await page.screenshot({animations:"disabled"});await sharp(bytes).flatten({background:"#0d141a"}).removeAlpha().png().toFile(`${folder}/${name}`);}
// UI captures are taken at 2x so text stays crisp inside the framed layouts.
async function hiDpi(page,width,height){const cdp=await context.newCDPSession(page);await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:2,mobile:false});}
async function toStage(page,name){await writeFile(resolve(stage,name),await page.screenshot({animations:"disabled"}));}
const ui=`@font-face{font-family:Inter;font-weight:400;src:url('${base}/inter.woff2')}
@font-face{font-family:Inter;font-weight:500;src:url('${base}/inter-500.woff2')}
@font-face{font-family:Inter;font-weight:600;src:url('${base}/inter-600.woff2')}
@font-face{font-family:Inter;font-weight:700;src:url('${base}/inter-700.woff2')}
*{box-sizing:border-box}body{margin:0;background:#0d141a;color:#eef4f8;font-family:Inter,system-ui;-webkit-font-smoothing:antialiased}img{display:block}
.shot{position:relative;width:1280px;height:800px;padding:32px 80px 22px;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(900px 420px at 10% -10%,rgba(121,223,189,.10),transparent 70%),#0d141a}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:40px}
.eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#79dfbd;margin-bottom:8px}
h1{margin:0;font-size:32px;line-height:36px;font-weight:700;letter-spacing:-.025em}
.sub{margin:8px 0 0;font-size:15px;line-height:22px;color:#a3b8c5}
.brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;padding-top:2px;white-space:nowrap}.brand img{width:30px;height:30px}
.stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
.frame{border-radius:14px;overflow:hidden;border:1px solid #2b3d49;box-shadow:0 24px 60px rgba(0,0,0,.45);background:#10181f}
.foot{font-size:12px;line-height:18px;color:#8ba3b2;min-height:18px}
.chip{display:inline-block;font-size:11.5px;font-weight:500;line-height:1;padding:6px 9px;border-radius:6px;background:#1b2730;color:#d8e4ec}.chip.on{color:#79dfbd}`;
function shot({eyebrow,title,sub,body,foot=""}){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WebScaly</title><style>${ui}</style></head><body><div class="shot">
<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="sub">${sub}</p></div><div class="brand"><img src="${base}/icon.png" alt="">WebScaly</div></div>
<div class="stage">${body}</div><div class="foot">${foot}</div></div></body></html>`;
}
const heroCredit="Hero © 2018 Blender Foundation, Daniel Martínez Lara, CC BY 4.0";
try{
const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),id=new URL(worker.url()).host;
const settings={enabled:true,algorithm:"fsrcnnx",quality:"quality",scale:"2",maxHeight:1440,strength:.35,denoise:.12,deband:.2,vibrance:0,contrast:0,brightness:0,skipAbove:0,adaptive:true,hud:true,comparison:true,split:.5,controls:true};
await worker.evaluate(async(config)=>chrome.storage.local.set({webscalyConfig:config}),{version:2,defaults:{...settings,controls:false,comparison:false,hud:false},sites:[{origin:"http://127.0.0.1",subdomains:false,settings}],presets:[],preferences:{paused:false,batterySaver:false,welcomed:true}});
const page=await context.newPage(); await page.goto(base+"/demo.html");await page.getByRole("button",{name:"Play demo",exact:true}).click();
await page.locator('webscaly-player[data-state="active"]').waitFor();
await page.frameLocator('iframe[title="WebScaly video controls"]').getByRole("button",{name:"HUD",exact:true}).waitFor();
const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url?.includes("/demo.html"))?.id;});
if(!tabId)throw Error("Demo tab unavailable");
const options=await context.newPage();await hiDpi(options,1120,620);
await options.goto(`chrome-extension://${id}/options.html?tab=${tabId}&profile=${encodeURIComponent("http://127.0.0.1")}`);
await options.getByLabel("Editing profile").selectOption("http://127.0.0.1");
// Let the live before/after preview start before capturing.
await options.waitForTimeout(2500);await options.evaluate(()=>document.fonts.ready);
await toStage(options,"settings.png");
await options.getByRole("button",{name:"Websites",exact:true}).click();await options.waitForTimeout(300);await toStage(options,"websites.png");
const popup=await context.newPage();await hiDpi(popup,360,720);await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
await popup.getByRole("button",{name:"Remove website access",exact:true}).waitFor();
// Keep the demo tab in front so the live readout reports real frames, then read the popup.
await page.bringToFront();await page.waitForTimeout(2200);
const popupBytes=await popup.locator("main.popup").screenshot({animations:"disabled"});
await sharp(popupBytes).flatten({background:"#10181f"}).removeAlpha().png().toFile(`${folder}/popup-ui.png`);
await cp(`${folder}/popup-ui.png`,resolve(stage,"popup.png"));
const popupMeta=await sharp(popupBytes).metadata();
const popupHeight=Math.round(popupMeta.height/popupMeta.width*392);

const graphics=await context.newPage();
async function ready(){await graphics.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]));}
async function render(html,name){await graphics.setContent(html);await ready();await save(graphics,name);}

// 1. Before and after: the extension's own split view on real footage, same frame on both sides.
await render(shot({eyebrow:"Before and after",title:"See the difference in the player.",
 sub:"Drag the split to compare the original with the enhanced picture, live on your device.",
 body:`<div class="frame"><img src="${base}/hero-compare-1088x612.png" width="1088" height="612" alt="Original on the left, enhanced on the right, of the same frame"></div>`,
 foot:`${heroCredit}. 360p source enhanced to 1080p with Anime4K · Quality. Same frame, same crop on both sides.`}),"01-player-1280x800.png");

// 2. Settings, framed.
const framed=(file,w,h)=>`<div class="frame"><img src="${base}/${file}" width="${w}" height="${h}" alt=""></div>`;
await render(shot({eyebrow:"Settings",title:"Tune it once for each website.",
 sub:"Pick the engine and quality, then fine-tune sharpening, denoising and deband with a live preview.",
 body:framed("settings.png",1120,620),foot:"Actual WebScaly settings page. The preview plays WebScaly's own generated test card."}),"02-settings-1280x800.png");

// 3. Popup with the three steps.
const steps=[["Approve a site","Chrome asks once. Access starts off for every website."],["Pick an engine and quality","Spatial Detail, Anime4K or FSRCNNX, tuned for what you watch."],["Watch the live readout","Resolution, frame rate and GPU time, right in the popup."]];
await render(shot({eyebrow:"Popup",title:"Everything within one click.",
 sub:"Engine, quality and live speed at a glance, with presets, fine-tuning and player tools.",
 body:`<div style="display:flex;align-items:center;justify-content:space-between;width:1120px">
<ol style="list-style:none;margin:0;padding:0;width:560px;display:grid;gap:34px">${steps.map(([t,d],i)=>`<li style="display:flex;gap:20px;align-items:flex-start"><span style="flex:none;width:36px;height:36px;border-radius:50%;background:#16352e;color:#79dfbd;font-weight:700;font-size:16px;display:grid;place-items:center;border:1px solid #2c5a4d">${i+1}</span><div><div style="font-size:21px;font-weight:600;letter-spacing:-.01em">${t}</div><div style="font-size:16px;line-height:24px;color:#a3b8c5;margin-top:5px">${d}</div></div></li>`).join("")}</ol>
<div class="frame" style="width:392px;height:${popupHeight}px"><img src="${base}/popup.png" width="392" height="${popupHeight}" alt="Actual WebScaly popup"></div></div>`,
 foot:"Actual WebScaly popup, shown with a locally generated demo video."}),"03-popup-1280x800.png");

// 4. Websites, framed.
await render(shot({eyebrow:"Privacy",title:"You choose the websites.",
 sub:"Access starts off. Approve a site once, keep separate settings for each, and remove access at any time.",
 body:framed("websites.png",1120,620),foot:"Actual WebScaly settings page. Video is processed on your device; nothing is uploaded."}),"04-site-profiles-1280x800.png");

// 5. Three engines, each on footage that suits it: 100% crops of the same frame.
const engines=[["spatial","Spatial Detail","Light, any video","Earth from the ISS"],["anime4k","Anime4K","Animation","Hero"],["fsrcnnx","FSRCNNX","Camera footage","Nature footage"]];
await render(shot({eyebrow:"Engines",title:"Three engines. Choose per website.",
 sub:"Each tile is a 100% crop of one frame: the original on the left, the enhanced result on the right.",
 body:`<div style="display:grid;grid-template-columns:repeat(3,360px);gap:20px">${engines.map(([k,n,b,c])=>`<div class="frame" style="width:360px"><div style="position:relative;width:360px;height:400px;overflow:hidden"><img src="${base}/tile-${k}-368x400.png" width="368" height="400" style="position:absolute;left:-4px;top:0;max-width:none" alt="">
<div style="position:absolute;left:179.5px;top:0;bottom:0;width:1px;background:#79dfbd"></div>
<span class="chip" style="position:absolute;left:12px;top:12px;background:rgba(27,39,48,.94)">Original</span><span class="chip on" style="position:absolute;right:12px;top:12px;background:rgba(27,39,48,.94)">Enhanced</span></div>
<div style="padding:16px 18px 18px;background:#121c24;border-top:1px solid #2b3d49"><div style="font-size:19px;font-weight:600;letter-spacing:-.01em">${n}</div><div style="font-size:14px;color:#a3b8c5;margin-top:3px">${b}</div><div style="font-size:12px;color:#7f98a8;margin-top:10px">${c}</div></div></div>`).join("")}</div>`,
 foot:`${heroCredit} · Earth from the International Space Station, NASA Johnson Space Center · “4K Nature Cinematography” by Aliioss Film, CC BY 3.0. 360p sources enhanced to 1080p, Quality.`}),"05-engines-1280x800.png");

// Promo tiles use the same real split frame.
await graphics.setViewportSize({width:440,height:280});
await render(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WebScaly</title><style>${ui}
main{width:440px;height:280px;background:#0d141a}.pic{position:relative;width:440px;height:170px;overflow:hidden;border-bottom:2px solid #79dfbd}.pic img{position:absolute;left:-52px;top:-14px;width:544px;height:306px;max-width:none}
.bar{display:flex;align-items:center;gap:14px;padding:0 24px;height:108px}.bar img{width:56px;height:56px}h1{margin:0;font-size:27px;font-weight:700;letter-spacing:-.03em;line-height:1.1}p{margin:5px 0 0;font-size:12.5px;line-height:1.35;color:#a3b8c5}
</style></head><body><main><div class="pic"><img src="${base}/hero-compare-1088x612.png" alt=""></div><div class="bar"><img src="${base}/icon.png" alt=""><div><h1>WebScaly</h1><p>Sharper web video, processed on your device.</p></div></div></main></body></html>`,"small-promo-440x280.png");
await graphics.setViewportSize({width:1400,height:560});
await render(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>WebScaly</title><style>${ui}
main{position:relative;width:1400px;height:560px;display:flex;background:radial-gradient(800px 420px at 8% -10%,rgba(121,223,189,.11),transparent 70%),#0d141a}
section{width:700px;padding:64px 0 40px 90px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:600}.brand img{width:44px;height:44px}
h1{margin:auto 0 0;font-size:62px;line-height:1.06;letter-spacing:-.035em;font-weight:700}h1 span{color:#79dfbd}p.tag{margin:24px 0 0;font-size:20px;line-height:1.5;color:#a3b8c5}.credit{margin-top:34px;font-size:11.5px;color:#7f98a8}
.pic{position:relative;width:700px;height:560px;overflow:hidden;border-left:1px solid #2b3d49}.pic img{position:absolute;left:-194px;top:-26px;width:1088px;height:612px;max-width:none}
</style></head><body><main><section><div class="brand"><img src="${base}/icon.png" alt="">WebScaly</div><h1>Bring your videos<br><span>into focus.</span></h1><p class="tag">Local video enhancement on the websites you choose.</p><div class="credit">${heroCredit}</div></section><div class="pic"><img src="${base}/hero-compare-1088x612.png" alt=""></div></main></body></html>`,"marquee-promo-1400x560.png");

const names=["icon-128.png","small-promo-440x280.png","marquee-promo-1400x560.png","01-player-1280x800.png","02-settings-1280x800.png","03-popup-1280x800.png","04-site-profiles-1280x800.png","05-engines-1280x800.png","popup-ui.png"], files=[];
for(const name of names){const meta=await sharp(`${folder}/${name}`).metadata();if(name!=="icon-128.png"&&(meta.hasAlpha||meta.channels!==3||meta.depth!=="uchar"))throw Error("Store raster must be 24-bit RGB: "+name);files.push({file:name,width:meta.width,height:meta.height,alpha:meta.hasAlpha,channels:meta.channels});}
await writeFile(`${folder}/assets.json`,JSON.stringify({version,footage:"Comparison images use real captures of the extension on credited footage (docs/store/frames); other pictures use a locally generated demo video",screenshots:"Actual installed extension with test-only loopback approval; popup and settings are unaltered captures inside the framed layouts",files},null,2)+"\n");
console.log("Captured five current screenshots, both promo sizes, icon and supporting popup capture.");
}finally{await context.close();await new Promise(r=>server.close(r));}
