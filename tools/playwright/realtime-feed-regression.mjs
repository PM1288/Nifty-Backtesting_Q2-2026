import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL ?? 'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'output/playwright/realtime-feed';
const password=process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if(!password) throw new Error('PLAYWRIGHT_ADMIN_PASSWORD required');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const evidence={quotes:[],connections:0,pageErrors:[],checks:[]};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const login=await context.request.post(`${base}/auth/session/dev-login`,{data:{identifier:'admin',password}});
 assert.equal(login.status(),200);
 await context.addInitScript(() => {
  const NativeWebSocket=window.WebSocket;
  window.__n50TestSockets=[];
  window.WebSocket=class extends NativeWebSocket {
   constructor(...args){super(...args);window.__n50TestSockets.push(this);}
  };
 });
 const page=await context.newPage();
 page.on('pageerror',error=>evidence.pageErrors.push(error.message));
 page.on('websocket',ws=>{
  if(!ws.url().includes('/v1/stream')) return;
  evidence.connections++;
  ws.on('framereceived',({payload})=>{
   try { const q=JSON.parse(String(payload));if(q.symbol)evidence.quotes.push({...q,receivedAt:new Date().toISOString()}); }catch{}
  });
 });
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.getByTestId('header-today-outlook').waitFor();
 await expectUntil(()=>evidence.quotes.length>=3,20000);
 evidence.checks.push('authenticated live stream delivers index snapshots');
 for(const q of evidence.quotes){assert.ok(Number.isFinite(q.price));assert.ok(Number.isFinite(Date.parse(q.timestamp)));}
 evidence.checks.push('valid prices and source timestamps');
 // A temporary auth/session failure must retry without needing a page reload.
 const initial=evidence.connections;
 await page.route('**/auth/session',async route=>{
  if(route.request().method()==='GET') { await route.fulfill({status:503,body:'temporarily unavailable'}); await page.unroute('**/auth/session'); }
  else await route.continue();
 });
 await context.setOffline(true);
 await page.evaluate(()=>window.__n50TestSockets.forEach(ws=>ws.close()));
 await page.waitForTimeout(2200);
 await context.setOffline(false);
 await expectUntil(()=>evidence.connections>initial,45000);
 evidence.checks.push('network loss and temporary session failure recover automatically');
 assert.equal(evidence.pageErrors.length,0);
 evidence.checks.push('no browser runtime errors');
 await page.screenshot({path:path.join(out,'home.png')});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(out,'mobile.png')});
 await context.close();
} finally {
 await browser.close();
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({checks:evidence.checks.length,connections:evidence.connections,quotes:evidence.quotes.length}));
async function expectUntil(test,timeout){const end=Date.now()+timeout;while(!test()){if(Date.now()>end)throw new Error('Timed out waiting for stream condition');await new Promise(r=>setTimeout(r,100));}}
