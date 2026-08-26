import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const authBaseUrl = (process.env.PLAYWRIGHT_AUTH_BASE_URL ?? new URL(baseUrl).origin).replace(/\/$/, "");
const proxyTarget = process.env.PLAYWRIGHT_PROXY_TARGET?.replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/compact-v5");
const scope = process.env.V5_AUDIT_SCOPE ?? "full";
const allViewports = [
  { name:"desktop-1920x1080",width:1920,height:1080 },
  { name:"desktop-1440x900",width:1440,height:900 },
  { name:"tablet-1024x768",width:1024,height:768 },
  { name:"mobile-390x844",width:390,height:844 },
];
const viewports = process.env.V5_AUDIT_VIEWPORT ? allViewports.filter((item) => item.name === process.env.V5_AUDIT_VIEWPORT) : allViewports;
const coreRoutes = ["/","/strategy/oiis-live","/strategy/trendlyne-summary","/strategy/monthly","/strategy/rolling-monthly","/strategy/long-options","/paper-trading","/paper-trading?tab=simple"];
const fullRoutes = [
  ...coreRoutes,"/strategy/oiis-live/history","/strategy/oiss-v1-202608","/strategy/rolling-monthly/legacy","/strategy/nifty-options",
  "/analytics","/analytics/leadership","/analytics/daily-setups","/analytics/regime","/analytics/risk","/analytics/learn","/analytics/simulator","/analytics/indicators","/analytics/indicators/rsi","/analytics/stock/RELIANCE",
  "/backtesting","/backtesting/lab","/backtesting/strategies","/backtesting/results","/backtesting/regimes","/backtesting/stocks","/backtesting/daily-summary","/backtesting/compare","/backtesting/runs","/backtesting/h30",
  "/options/intelligence","/options/structure","/options/snapshot","/options/volatility-signals","/futures","/market/nifty-500",
  "/institutional/flow","/institutional/reports","/institutional/nse-intelligence","/institutional/nse-intelligence/sectors","/institutional/nse-intelligence/fno","/institutional/nse-intelligence/events","/institutional/nse-intelligence/reports","/catalysts/context","/catalysts/events",
  "/heatmap/change","/heatmap/rsi","/heatmap/will","/analytics/flows","/analytics/system/quality","/analytics/system/map","/feedback","/control-plane"
];
const requestedRoutes = process.env.V5_AUDIT_ROUTES?.split(",").map((item)=>item.trim()).filter(Boolean);
const routes = requestedRoutes?.length ? requestedRoutes : process.env.V5_AUDIT_ROUTE ? [process.env.V5_AUDIT_ROUTE] : scope === "core" ? coreRoutes : fullRoutes;
const accessibilityRepresentatives = new Set(["/", "/strategy/oiis-live", "/strategy/trendlyne-summary", "/strategy/monthly", "/strategy/long-options", "/paper-trading", "/analytics", "/backtesting", "/options/intelligence", "/institutional/flow", "/analytics/system/quality", "/control-plane"]);
await fs.mkdir(outputDir,{recursive:true});

let results=[];
if (process.env.V5_AUDIT_RESUME === "1") {
  try {
    const partial = JSON.parse(await fs.readFile(path.join(outputDir,"results.partial.json"),"utf8"));
    results = Array.isArray(partial.results) ? partial.results : [];
  } catch {
    results = [];
  }
}

const browser = await chromium.launch({headless:true});
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${authBaseUrl}/auth/session/dev-login`,{data:{identifier:"admin",password}});
if(!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await bootstrap.storageState();
if (proxyTarget) {
  const targetHost = new URL(baseUrl).hostname;
  storageState.cookies = storageState.cookies.map((cookie) => ({ ...cookie, domain: targetHost, path: "/", secure: true, sameSite: "Lax" }));
} else if (new URL(baseUrl).protocol === "http:") {
  storageState.cookies = storageState.cookies.map((cookie) => ({ ...cookie, secure: false, sameSite: "Lax" }));
}
await bootstrap.close();
try{
  for(const viewport of viewports){
    const context=await browser.newContext({viewport,storageState,reducedMotion:"reduce",ignoreHTTPSErrors:true});
    if (!proxyTarget) {
      const viewportLogin = await context.request.post(`${authBaseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
      if (!viewportLogin.ok()) throw new Error(`Viewport login failed: ${viewportLogin.status()}`);
    }
    const page=await context.newPage();
    if (proxyTarget) {
      await page.route(`${new URL(baseUrl).origin}/**`, async (route) => {
        const incoming = new URL(route.request().url());
        const response = await route.fetch({ url: `${proxyTarget}${incoming.pathname}${incoming.search}`, timeout:180000 });
        await route.fulfill({ response });
      });
    }
    page.on("console", (message) => {
      if (message.type() === "error") console.error(`[browser-console] ${message.text()}`);
    });
    page.on("pageerror", (error) => console.error(`[browser-pageerror] ${error.message}`));
    for(const route of routes){
      if (results.some((item)=>item.route===route&&item.viewport===viewport.name)) continue;
      console.log(`[compact-v5] ${viewport.name} ${route}`);
      const errors=[];
      const expectedMissing=[];
      const onResponse=(response)=>{
        if(response.status()<400||new URL(response.url()).origin!==new URL(baseUrl).origin)return;
        const detail=`${response.status()} ${response.request().method()} ${response.url()}`;
        const pathname=new URL(response.url()).pathname;
        if(response.status()===404&&pathname.startsWith("/v1/backtesting/h30/artifacts/"))expectedMissing.push(detail);
        else errors.push(detail);
      };
      page.on("response",onResponse);
      const started=Date.now();
      const response=await page.goto(`${baseUrl}${route}`,{waitUntil:"domcontentloaded",timeout:120000});
      try {
        await page.locator("main").first().waitFor({state:"visible",timeout:60000});
      } catch (error) {
        console.error(`[compact-v5] main unavailable at ${page.url()} title=${await page.title()} body=${(await page.locator("body").innerText()).slice(0, 500)}`);
        throw error;
      }
      if (route.startsWith("/paper-trading")) {
        const paperUrl = new URL(route,baseUrl);
        const section = paperUrl.searchParams.get("section") ?? "overview";
        if (paperUrl.searchParams.get("tab") === "simple") {
          await page.getByText(/filtered paper trades/i).first().waitFor({ state: "visible", timeout: 120000 });
        } else {
          await page.locator(`#${section}`).waitFor({ state: "visible", timeout: 120000 });
        }
      }
      if (route === "/strategy/oiis-live") {
        await page.getByText("Selection evidence is loading", { exact: true }).waitFor({ state: "hidden", timeout: 60000 }).catch(() => undefined);
      }
      await page.waitForTimeout(1500);
      const metrics=await page.evaluate(()=>{
        const shell=document.querySelector('[data-ui-compact-v5]');
        const header=document.querySelector('header[class*="header"]');
        const primaryNav=document.querySelector('nav[aria-label="Workspace navigation"]');
        const main=document.querySelector('main');
        const visible=(el)=>{const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"};
        const sections=[...document.querySelectorAll('[id="overview"],[id="factor-analysis"],[id="capital-recycling"],[id="path-through-time"],[id="reward-pain"],[id="trade-evidence"],[id="scenario-analysis"],[id="methodology-audit"]')].filter(visible);
        const rows=[...document.querySelectorAll('tbody tr')].filter(visible);
        return {compactFlag:shell?.getAttribute('data-ui-compact-v5'),shellChromePx:(header?.getBoundingClientRect().height??0)+(primaryNav?.getBoundingClientRect().height??0),contentStartY:main?.getBoundingClientRect().top??null,pageHeight:document.documentElement.scrollHeight,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1,canvases:[...document.querySelectorAll('canvas')].filter(visible).length,visibleRows:rows.length,visiblePaperSections:sections.map((item)=>item.id),controls:[...document.querySelectorAll('button,input,select')].filter(visible).length};
      });
      const runAxe = scope !== "full" || (viewport.name === "desktop-1920x1080" && accessibilityRepresentatives.has(route));
      let axeTimedOut = false;
      const axe = runAxe ? await Promise.race([
        new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze(),
        new Promise((resolve) => setTimeout(() => { axeTimedOut = true; resolve({ violations: [] }); }, 60000)),
      ]) : { violations: [] };
      const critical=axe.violations.filter((item)=>item.impact==="critical"||item.impact==="serious");
      const safeName=route.replace(/[?=&/]+/g,"-").replace(/^-|-$/g,"")||"home";
      const screenshot=`${safeName}__${viewport.name}.png`;
      await page.screenshot({path:path.join(outputDir,screenshot),fullPage:false});
      results.push({route,viewport:viewport.name,status:response?.status()??null,readyMs:Date.now()-started,screenshot,...metrics,httpErrors:errors,expectedMissing,axeRun:runAxe,axeTimedOut,axeCritical:critical.map((item)=>({id:item.id,impact:item.impact,nodes:item.nodes.length,targets:item.nodes.slice(0,8).map((node)=>node.target)}))});
      await fs.writeFile(path.join(outputDir,"results.partial.json"),`${JSON.stringify({capturedAt:new Date().toISOString(),baseUrl,scope,results},null,2)}\n`);
      page.off("response",onResponse);
    }
    if (proxyTarget) await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
}finally{await browser.close()}
await fs.writeFile(path.join(outputDir,"results.json"),`${JSON.stringify({capturedAt:new Date().toISOString(),baseUrl,scope,results},null,2)}\n`);
const failures=results.filter((item)=>item.status!==200||item.bodyOverflow||item.compactFlag!=="true"||item.httpErrors.length||item.axeTimedOut||item.axeCritical.length||(item.route.startsWith("/paper-trading")&&item.route!=="/paper-trading?tab=simple"&&item.visiblePaperSections.length>1));
console.log(JSON.stringify({checks:results.length,passed:results.length-failures.length,failed:failures.length,outputDir},null,2));
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1}
