import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD) throw new Error('Output directory and protected password required');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const auth=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 if(auth.status()!==200)throw new Error('Login failed: '+auth.status());
 for(const route of ['/', '/strategy/trading-analytics?view=scalper_v2&interval=5', '/strategy/rolling-monthly', '/paper-trading', '/institutional/nse-intelligence/reports', '/analytics/system/data-health']){
  const page=await context.newPage(); const errors=[]; const consoleErrors=[]; const consoleErrorDetails=[]; const failedRequests=[]; const httpErrors=[];
  page.on("console",m=>{if(m.type()==="error"){consoleErrors.push(m.text().slice(0,500));consoleErrorDetails.push({source:m.location().url.split("?")[0],message:m.text().slice(0,500)});}});
  page.on("response",r=>{if(r.status()>=400)httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});});
  page.on("requestfailed",r=>failedRequests.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
  page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{window.__profile={lcp:0,cls:0,longTasks:0}; for(const type of ['largest-contentful-paint','layout-shift','longtask']){try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')window.__profile.lcp=e.startTime;if(type==='layout-shift'&&!e.hadRecentInput)window.__profile.cls+=e.value;if(type==='longtask')window.__profile.longTasks+=e.duration;}}).observe({type,buffered:true});}catch{}}});
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
  try { await page.locator('main').waitFor({timeout:30000}); } catch { errors.push('Main content did not become visible'); }
  await page.waitForTimeout(8000);
  const metrics=await page.evaluate(()=>({navigation:performance.getEntriesByType('navigation').map(n=>({ttfb:n.responseStart,domReady:n.domContentLoadedEventEnd,load:n.loadEventEnd})),...window.__profile,resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,type:r.initiatorType,ms:r.duration,transfer:r.transferSize,decoded:r.decodedBodySize})),elements:document.querySelectorAll('*').length,main:!!document.querySelector('main')}));
  const name=route.replace(/[^a-z0-9]+/gi,'_')||'home';
  await page.screenshot({path:path.join(out,name+'.png'),timeout:60000});
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  results.push({route,errors,consoleErrors,consoleErrorDetails,failedRequests,httpErrors,...metrics,accessibility:accessibility.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}); await page.close();
 }
 await context.close();
}finally{await browser.close();await fs.writeFile(path.join(out,'profile.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results.map(r=>({route:r.route,requests:r.resources.length,bytes:r.resources.reduce((n,x)=>n+x.transfer,0),lcp:r.lcp,cls:r.cls,longTasks:r.longTasks,errors:r.errors.length}))));
if (results.length !== 6 || results.some(result => !result.main || result.errors.length > 0)) {
 throw new Error('One or more profiled routes failed to render; inspect profile.json');
}
