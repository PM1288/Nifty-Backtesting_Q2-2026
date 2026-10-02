import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected credentials and output directory required');
const source=await fs.readFile('neon-stock-terminal/apps/web/src/App.tsx','utf8');
const routes=[...source.matchAll(/<Route path="([^"]+)" element=\{<(\w+)/g)].filter(([,p,c])=>!['Navigate','LegacyStockRedirect','NotFoundPage'].includes(c)&&!p.includes('*')).map(([,p])=>p.replace(':symbol','RELIANCE').replace(':slug','rsi').replace(':strategyId','rsi30_willr80_closegtprev_tp125').replace(':lens','overview'));
routes.push('/', '/full-board', '/strategy/trading-analytics?view=scalper_v2&interval=5','/strategy/rolling-monthly?view=absolute','/paper-trading?tab=analyzer','/paper-trading?tab=tracked','/paper-trading?tab=quality');
const browser=await chromium.launch({headless:true});const results=[];
await fs.mkdir(out,{recursive:true});
try{
 const context=await browser.newContext();
 if(process.env.UI_PREVIEW_ORIGIN) await context.route(base+'/**', async route => {
 const req=route.request(), url=new URL(req.url());
 if(req.isNavigationRequest() || url.pathname.startsWith('/n50/assets/') || url.pathname === '/n50/app-version.json') {
  const response=await route.fetch({url:process.env.UI_PREVIEW_ORIGIN+url.pathname+url.search});
  await route.fulfill({response});
 } else await route.continue();
 });
 const login=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 if(login.status()!==200)throw new Error('Login failed');
 for(const [index,route] of (process.env.UI_AUDIT_ROUTES ? JSON.parse(process.env.UI_AUDIT_ROUTES) : [...new Set(routes)]).entries()){
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const item={route,errors,views:[]};
  try{
   await page.setViewportSize({width:1440,height:1000});
   const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:45000});item.status=response?.status();
   await page.locator('main').first().waitFor({timeout:20000});await page.waitForTimeout(Number(process.env.UI_AUDIT_SETTLE_MS ?? 3500));
   for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    const stem=String(index).padStart(2,'0')+'-'+name;
    await page.screenshot({path:path.join(out,stem+'.png'),timeout:15000});
    const text=await page.locator('main').first().innerText();await fs.writeFile(path.join(out,stem+'.txt'),text);
    const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,title:document.querySelector('h1')?.textContent,mainCount:document.querySelectorAll('main').length}));
    item.views.push({name,...geometry,words:text.split(/\s+/).length,screenshot:stem+'.png'});
   }
  }catch(e){item.failure=e.message.split('\n')[0];}
  results.push(item);await page.close();await fs.writeFile(path.join(out,'routes.json'),JSON.stringify(results,null,2));console.log(route,item.failure??'captured');
 }
 await context.close();
}finally{await browser.close();}
if(results.some(r=>r.failure||r.status>=400||r.errors.length))throw new Error('Audit has failed routes; inspect routes.json');
