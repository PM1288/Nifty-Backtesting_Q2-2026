import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base='https://n50.nifty50today.co.in/n50';
if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const out='output/retention-implementation/browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const login=await context.request.post(base+'/auth/session/dev-login',{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 if(!login.ok())throw new Error(`Login ${login.status()}`);
 for(const path of ['/v1/overview/header','/v1/oiis-live/dashboard?tradeDate=2026-09-07','/v1/paper/notifications?limit=5']){
  const start=Date.now();const r=await context.request.get(base+path,{timeout:45000});
  results.push({path,status:r.status(),ms:Date.now()-start});
  if(!r.ok())throw new Error(`Safety stop ${path} ${r.status()}`);
 }
 for(const width of [1440,390]){
  const page=await context.newPage();await page.setViewportSize({width,height:900});const errors=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
  await page.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
  await page.goto(base+'/strategy/oiss-v1-202608',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('region',{name:'OISS decision workspace',exact:true}).waitFor({timeout:45000});
  const axe=await new AxeBuilder({page}).include('main').analyze();
  const geometry=await page.evaluate(()=>({mains:document.querySelectorAll('main').length,overflow:document.documentElement.scrollWidth>innerWidth+1}));
  await page.screenshot({path:`${out}/oiss-${width}.png`});
  results.push({width,...geometry,errors,axe:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  await page.close();
 }
 await context.close();
}finally{await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
