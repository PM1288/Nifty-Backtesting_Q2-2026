import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const origin = process.env.REVIEW_ORIGIN ?? "http://127.0.0.1:15218";
const authOrigin = "http://127.0.0.1:19090";
const output = path.resolve(process.env.REVIEW_OUTPUT ?? "output/playwright/market-workstation-review");
const env = await fs.readFile(".env", "utf8");
const password = env.split(/\r?\n/).find(line => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="))?.split("=").slice(1).join("=").trim();
assert.ok(password, "Protected browser credentials required");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const evidence = { origin, geometry: [], views: [], errors: [], requests: [], mutationRequests: [] };
try {
 const context = await browser.newContext({ viewport: { width:1920, height:1080 }, reducedMotion:"reduce" });
 const login = await context.request.post(`${authOrigin}/n50/auth/session/dev-login`, { data:{ identifier:"admin",password } });
 assert.ok(login.ok(), `Login ${login.status()}`);
 const cookie=(await context.storageState()).cookies.find(item=>item.name.includes("session"));
 if(cookie) await context.addCookies([{...cookie,domain:"127.0.0.1",path:"/",secure:false,sameSite:"Lax"}]);
 const page = await context.newPage();
 page.on("pageerror", error => evidence.errors.push(String(error)));
 const pending = new Set();
 page.on("request", request => {
  if (/\/v1\/trading-analytics\/(charts|scalper-context)/.test(request.url())) { pending.add(request); evidence.requests.push({url:request.url(),at:Date.now()}); }
  if (/\/v1\//.test(request.url()) && !/analytics.*(event|error)/.test(request.url()) && !["GET","HEAD"].includes(request.method())) evidence.mutationRequests.push(request.url());
 });
 const finish = request => pending.delete(request);
 page.on("requestfinished",finish); page.on("requestfailed",finish);
 const started=Date.now();
 await page.goto(`${origin}/n50/strategy/trading-analytics?view=scalper&interval=5`,{waitUntil:"domcontentloaded"});
 const root=page.getByTestId("scalper-v2");
 await root.waitFor({timeout:120000});
 await page.waitForURL(/view=scalper_v2/);
 assert.equal(new URL(page.url()).searchParams.get("interval"),"5");
 assert.equal(await page.getByRole("button",{name:"Scalper",exact:true}).count(),0);
 await page.getByTestId("v2-chart-host-underlying").locator("canvas").first().waitFor({timeout:60000});
 evidence.firstPaintMs=Date.now()-started;
 for(let i=0;i<150;i++){await page.waitForTimeout(200);if(!pending.size && i>10)break;}
 for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844}]) {
  await page.setViewportSize(viewport);await page.waitForTimeout(250);
  const geometry=await page.evaluate(()=>["underlying","call","put"].map(id=>{
   const host=document.querySelector(`[data-testid="v2-chart-host-${id}"]`);
   const native=host?.querySelector(".tv-lightweight-charts");
   return {id,hostWidth:host?.clientWidth,hostHeight:host?.clientHeight,nativeWidth:native?.getBoundingClientRect().width,nativeHeight:native?.getBoundingClientRect().height,timeAxis:Number(host?.dataset.timeScaleHeight)};
  }));
  for(const item of geometry){assert.ok(Math.abs(item.hostWidth-item.nativeWidth)<=2,JSON.stringify(item));assert.ok(item.nativeHeight<=item.hostHeight+2,JSON.stringify(item));assert.ok(item.timeAxis>0);assert.ok(item.hostWidth<=viewport.width,"Canvas clipped by narrow viewport");if(viewport.width>=1440) assert.ok(item.nativeHeight-item.timeAxis>=(item.id==="underlying"?500:240),"Unreadable plot height");}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"Page overflow");
  evidence.geometry.push({viewport,geometry});
  await page.screenshot({path:path.join(output,`charts-${viewport.width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.waitForTimeout(250);
 const counters=()=>page.locator('[data-testid^="v2-chart-host-"]').evaluateAll(nodes=>nodes.map(n=>n.dataset.setDataCount));
 const before=await counters(), networkBefore=evidence.requests.length;
 const box=await page.getByTestId("v2-chart-host-underlying").boundingBox();
 for(let i=0;i<500;i++) await page.mouse.move(box.x+10+(i%80)/80*(box.width-100),box.y+box.height*.4);
 assert.deepEqual(await counters(),before,"Pointer movement must not hydrate series");
 evidence.hoverRequests=evidence.requests.length-networkBefore;
 assert.equal(evidence.hoverRequests,0,"No chart/context requests during pointer movement");
 const nav=page.getByRole("navigation",{name:"Scalper analytics"});
 for(const name of ["OI & ΔOI","Price Strength","Total OI","Max Pain","Overview"]){
  await nav.getByRole("button",{name,exact:true}).click(); await page.waitForTimeout(250);
  evidence.views.push({name,charts:await root.getByRole("img").count()});
  await page.screenshot({path:path.join(output,`${name.replace(/[^a-zA-Z]/g,"-")}.png`),fullPage:true});
 }
 evidence.profileMode=await page.getByTestId("v2-oi-profile").getAttribute("data-mode");
 assert.equal(evidence.profileMode,"change");
 for(const name of ["Morning View","Market Structure","OI & PCR","Positioning & Flow","1m · 5m · 15m","Trade Log","Stock Activity","History"]){
  const started=Date.now();
  await page.getByRole("button",{name,exact:true}).first().click();
  await page.waitForTimeout(1500);
  evidence.views.push({name,mountedAfterMs:Date.now()-started,charts:await page.getByRole("img").count(),state:(await page.locator("main").innerText()).slice(-700)});
  await page.screenshot({path:path.join(output,`view-${name.replace(/[^a-zA-Z]/g,"-")}.png`),fullPage:true});
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 assert.equal(evidence.mutationRequests.length,0);
 evidence.status="PASS";
} catch(error){ evidence.status="FAIL";evidence.failure=String(error);process.exitCode=1; }
finally {await fs.writeFile(path.join(output,"results.json"),JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify(evidence));
