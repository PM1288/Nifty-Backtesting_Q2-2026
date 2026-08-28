import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19191/n50").replace(/\/$/, "");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "docs/uiux/today-revamp/after-screenshots");
const sectors = ["Information Technology","Financial Services","Metals & Mining","Services","Chemicals","Oil, Gas & Consumable Fuels","Automobile & Auto Components","Consumer Durables","Capital Goods","Construction Materials","Power","Consumer Services","Telecommunication","Realty","Media, Entertainment & Publication","Textiles","Construction","Healthcare","FMCG"];
const stocks = sectors.flatMap((sector, sectorIndex) => Array.from({ length: 8 }, (_, index) => {
  const n = sectorIndex * 8 + index + 1; const changePct = Number((((n * 17) % 640) / 100 - 3.1).toFixed(2)); const last = 90 + n * 11.37;
  return { symbol: `T${String(n).padStart(3,"0")}`, name: `Test Company ${n}`, sector, last, change: last * changePct / 100, changePct, volume: 100000 + n * 1700, rsi: 35 + n % 45, willr: -90 + n % 75, change5d: changePct * 1.6, relativeVolume: .6 + n % 20 / 10, opportunity30d: 30 + n % 65, oiisScore: n % 3 ? 60 + n % 35 : null, oiisDirection: n % 5 === 0 ? "SHORT" : "LONG", timestamp: "2026-08-28T10:05:00+05:30", alert: n % 27 === 0 ? { type: "WIDE_SPREAD", severity: "MEDIUM", label: "Wide spread" } : null };
}));
const quote = (symbol, name, last, changePct) => ({ symbol, name, last, change: last * changePct / 100, changePct, timestamp: "2026-08-28T10:05:00+05:30" });
const overview = { asOf: "2026-08-28T10:05:00+05:30", market: { isOpen: true, label: "OPEN" }, indices: { nifty50: quote("NIFTY50","NIFTY 50",25238.4,.42), bankNifty: quote("BANKNIFTY","BANK NIFTY",54823.15,-.18), indiaVix: quote("INDIAVIX","INDIA VIX",12.42,-1.2) }, nifty: quote("NIFTY50","NIFTY 50",25238.4,.42), sectors: sectors.map((sector) => ({ sector, stocks: stocks.filter((stock) => stock.sector === sector) })), leaderboards: { gainers: [...stocks].sort((a,b)=>b.changePct-a.changePct).slice(0,10), losers: [...stocks].sort((a,b)=>a.changePct-b.changePct).slice(0,10) }, tickerTape: [], derivatives: { universe:"ALL_ACTIVE_NSE_FNO_CONTRACTS",contractCount:1354,underlyingCount:152,observedContractCount:1100,observedTodayCount:1100,anomalyCount:22,bigAskCount:8,bigBidCount:6,excessPriceMoveCount:5,wideSpreadCount:9,asOf:"2026-08-28T10:05:00+05:30",anomalies:stocks.filter((stock)=>stock.alert).map((stock,index)=>({symbolToken:String(index),tradingSymbol:stock.symbol,underlying:stock.symbol,instrumentType:"OPTSTK",expiry:"2026-09-24",strike:null,right:"CE",lotSize:null,last:stock.last,changePct:stock.changePct,bid:null,ask:null,bidQty:null,askQty:null,bidNotional:null,askNotional:null,spreadPct:null,depthImbalance:null,lastUpdated:stock.timestamp,anomalyTypes:["WIDE_SPREAD"],severityScore:2})) } };

await fs.mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({headless:true}); const results=[];
try {
  for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]) {
    const context=await browser.newContext({viewport}); const page=await context.newPage(); const errors=[]; page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
    await page.route("**/auth/session", route=>route.fulfill({json:{authenticated:true,user:{uid:"test",email:"test@example.test",emailVerified:true,displayName:"Test User",role:"admin"},csrfToken:"test"}}));
    await page.route("**/v1/overview/header", route=>route.fulfill({json:{asOf:overview.asOf,market:overview.market,indices:overview.indices,tickerTape:[]}}));
    await page.route("**/v1/overview", route=>route.fulfill({json:overview}));
    await page.goto(`${baseUrl}/?lens=story`,{waitUntil:"networkidle"}); await page.getByTestId("today-summary").waitFor();
    const storyAxe=(await new AxeBuilder({page}).analyze()).violations.filter((item)=>item.impact==="critical"||item.impact==="serious");
    const browserScroll=await page.evaluate(()=>document.documentElement.scrollHeight-document.documentElement.clientHeight);
    if(viewport.width>=1440 && browserScroll>2) throw new Error(`Summary scroll ${browserScroll}px at ${viewport.width}`);
    await page.screenshot({path:path.join(outputDir,`market-story-${viewport.width}x${viewport.height}.png`)});
    await page.getByRole("tab",{name:"Sector Matrix"}).click(); await page.screenshot({path:path.join(outputDir,`sector-matrix-${viewport.width}x${viewport.height}.png`)});
    await page.goto(`${baseUrl}/full-board?view=rsi`,{waitUntil:"networkidle"}); await page.getByTestId("today-full-board").waitFor();
    const boardAxe=(await new AxeBuilder({page}).analyze()).violations.filter((item)=>item.impact==="critical"||item.impact==="serious");
    const pageScroll=await page.evaluate(()=>document.documentElement.scrollHeight-document.documentElement.clientHeight); if(viewport.width>=1024 && pageScroll>2) throw new Error(`Board browser scroll ${pageScroll}px`);
    const mounted=await page.locator('button[class*="stockTile"]').count(); if(mounted>=stocks.length) throw new Error(`Board did not virtualise: mounted ${mounted}/${stocks.length}`);
    await page.locator('button[class*="stockTile"]').first().click(); await page.getByRole("dialog").waitFor();
    await page.screenshot({path:path.join(outputDir,`full-board-quick-view-${viewport.width}x${viewport.height}.png`)});
    const axeSummary=(items)=>items.map((item)=>({id:item.id,nodes:item.nodes.slice(0,3).map((node)=>node.target.join(" "))}));
    results.push({viewport,summaryBrowserScroll:browserScroll,boardBrowserScroll:pageScroll,mountedTiles:mounted,totalStocks:stocks.length,seriousOrCriticalAxe:{story:axeSummary(storyAxe),board:axeSummary(boardAxe)},fixtureTransportErrors:errors.length}); await context.close();
  }
} finally { await browser.close(); await fs.writeFile(path.join(outputDir,"results.json"),JSON.stringify(results,null,2)+"\n"); }
console.log(JSON.stringify(results,null,2));
