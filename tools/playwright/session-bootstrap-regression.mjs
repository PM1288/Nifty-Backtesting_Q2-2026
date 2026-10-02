import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected credentials and output directory required');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const result={delayedChunks:0,mainVisibleMs:0,errors:[]};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const login=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 assert.equal(login.status(),200);
 // Firebase's Vite chunks use index.esm names. Hold those responses until after
 // main renders: restoring a valid server session must not depend on the SDK.
 const pending=[];
 await context.route('**/assets/index.esm-*.js',async route=>{result.delayedChunks++;pending.push(route);});
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 const start=performance.now();await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.locator('main').waitFor({timeout:8000});
 result.mainVisibleMs=Math.round(performance.now()-start);
 assert.ok(result.delayedChunks>0,'Fixture must intercept Firebase chunks');
 for(const route of pending)await route.continue();
 await context.unroute('**/assets/index.esm-*.js');
 await page.getByTestId('header-today-outlook').waitFor();
 assert.deepEqual(result.errors,[]);
 await page.screenshot({path:path.join(out,'restored.png')});
 await context.close();
}finally{await browser.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result));
