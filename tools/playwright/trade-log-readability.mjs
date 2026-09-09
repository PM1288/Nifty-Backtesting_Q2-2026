import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const remote='https://n50.nifty50today.co.in/n50';
const local=process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:5178/n50';
const out=path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR??'output/playwright/trade-log-readability');
await fs.mkdir(out,{recursive:true});
const env=await fs.readFile('/home/novius2/trading-stack/.env','utf8');
const password=env.split(/\r?\n/).find(l=>l.startsWith('DEV_LOCAL_AUTH_PASSWORD='))?.split('=').slice(1).join('=').trim();
if(!password)throw Error('Protected credential unavailable');
const browser=await chromium.launch({headless:true});
const checks=[];const check=(name,pass,details)=>{checks.push({name,pass:!!pass,details});};
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',acceptDownloads:true});
 const login=await context.request.post(`${remote}/auth/session/dev-login`,{data:{identifier:'admin',password},headers:{Origin:new URL(remote).origin}});
 if(!login.ok())throw Error(`Login failed ${login.status()}`);
 const real=await context.request.get(`${remote}/v1/trading-analytics/scalper-log?limit=5000`);
 const payload=await real.json();
 await fs.writeFile(path.join(out,'real-observations.json'),JSON.stringify(payload,null,2));
 check('real read-only API',real.ok()&&payload.paperOrdersEnabled===false,{count:payload.rows?.length});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('file:///home/novius2/NIFTY50/Dashboards/NIFTY_Trade_Log_Interactive_Preview_20260909_v1_0.html');
 await page.screenshot({path:path.join(out,'reference-preview.png'),fullPage:true});
 await page.goto(`${remote}/strategy/trading-analytics?view=trade-log`);
 try { await page.getByTestId('trade-observations').waitFor({timeout:60000}); }
 catch (error) {
   await page.screenshot({path:path.join(out,'deployed-load-failure.png'),fullPage:true});
   console.log(JSON.stringify({stage:'deployed-load',url:page.url(),errors,body:(await page.locator('body').innerText()).slice(0,1600)}));
   throw error;
 }
 await page.screenshot({path:path.join(out,local===remote?'deployed-initial-1440.png':'before-1440.png'),fullPage:true});
 const before=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth}));
 // Local frontend, authenticated production GETs only. Never send orders or notifications.
 const forbidden=[];let latestLog=payload;let failContext=false;let failedContextRequests=0;
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());let pathname=u.pathname.replace(/^\/n50(?=\/)/,'');
   if(!/^\/(v1|api\/v1|auth)\//.test(pathname))return route.continue();
   if(route.request().method()!=='GET'){forbidden.push(pathname);return route.fulfill({status:405,body:'Test bridge is read-only'});}
   if(pathname.includes('/stream'))return route.abort();
   if(failContext&&pathname.replace(/\/$/,'')==='/v1/trading-analytics'){failedContextRequests++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST_ONLY_CONTEXT_UNAVAILABLE'})});}
   try {
     const response=await context.request.get(`${remote}${pathname}${u.search}`);
     if(pathname.includes('/scalper-log')&&response.ok())latestLog=await response.json();
     return await route.fulfill({response});
   } catch { await route.abort().catch(()=>{}); /* Never print authenticated request headers on teardown. */ }
 });
 await page.goto(`${local}/strategy/trading-analytics?view=trade-log`,{waitUntil:'domcontentloaded'});
 const root=page.getByTestId('trade-observations');
 try{await root.waitFor({timeout:60000});}catch(e){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.log({url:page.url(),errors,body:(await page.locator('body').innerText()).slice(0,1200)});throw e;}
 await root.getByRole('button',{name:/Inspect /}).first().waitFor({timeout:60000});
 check('all columns plus P&L is the default preset',await root.getByLabel('Preset',{exact:true}).inputValue()==='All columns + P&L');
 check('all six CE and PE horizon columns are present',(await root.getByRole('columnheader',{name:/^(CE|PE) · (15M|30M|EOD) P&L$/}).count())===6);
 for(const heading of ['Selected open','Selected endpoint','Endpoint Δ %','High Δ %','Low Δ %','Underlying alignment','Delivery','Stored gates','UNDERLYING · rsi14','CE · rsi14','PE · rsi14'])
   check(`default retains ${heading}`,await root.getByRole('columnheader',{name:heading,exact:true}).count()===1);
 check('SHAP research is directly reachable',String(await root.getByRole('link',{name:/Open SHAP research/}).getAttribute('href')).includes('/strategy/nifty-context?lens=trade-quality'));
 for(const width of [1920,1440,1280,768,390]){
   await page.setViewportSize({width,height:width===1920?1080:900});
   await page.screenshot({path:path.join(out,`monitor-${width}.png`),fullPage:true});
   const geometry=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,rows:[...document.querySelectorAll('[data-testid="trade-observations"] tbody tr')].map(e=>e.getBoundingClientRect().height)}));
   check(`${width} no page overflow`,geometry.width<=width+1,geometry);
   const axe=await new AxeBuilder({page}).include('[data-testid="trade-observations"]').analyze();
   check(`${width} axe`,axe.violations.length===0,axe.violations);
 }
 await page.setViewportSize({width:1440,height:900});
 for(const preset of ['All columns + P&L','P&L comparison','Outcomes','Entries & rules','Indicators','Full evidence','Monitor']){
   await root.getByLabel('Preset',{exact:true}).selectOption(preset);
   await page.screenshot({path:path.join(out,`${preset.replaceAll(' ','-')}.png`),fullPage:true});
   check(`preset ${preset}`,await root.getByRole('button',{name:/Inspect /}).count()===payload.rows.length);
 }
 const trigger=root.getByRole('button',{name:/Inspect /}).first();await trigger.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 for(const section of ['Conditions','Indicators','Outcomes','Contracts & sources','Delivery','Raw record']){
   await dialog.getByRole('button',{name:section,exact:true}).click();
   await page.screenshot({path:path.join(out,`inspector-${section.replaceAll(' ','-')}.png`),fullPage:true});
   const sectionAxe=await new AxeBuilder({page}).include('dialog').analyze();check(`${section} axe`,sectionAxe.violations.length===0,sectionAxe.violations);
 }
 check('raw identity preserved',(await dialog.locator('pre').textContent()).includes(payload.rows[0].signal_key));
 const axe=await new AxeBuilder({page}).include('dialog').analyze();check('inspector axe',!axe.violations.length,axe.violations);
 await page.keyboard.press('Escape');check('Escape closes',await dialog.count()===0);check('focus restored',await trigger.evaluate(e=>e===document.activeElement));
 await trigger.click();await page.getByRole('dialog').getByRole('button',{name:'Indicators',exact:true}).click();
 await page.reload();await page.getByRole('dialog').waitFor({timeout:60000});
 check('deep link restores selected observation and section',(await page.getByRole('dialog').getByRole('button',{name:'Indicators',exact:true}).getAttribute('aria-current'))==='page');
 await page.keyboard.press('Escape');
 await root.getByText('Export',{exact:true}).click();
 const downloaded=page.waitForEvent('download');await root.getByRole('button',{name:'Full filtered JSON',exact:true}).click();
 const file=await downloaded;const exported=JSON.parse(await fs.readFile(await file.path(),'utf8'));
 check('full filtered JSON exact row parity',JSON.stringify(exported.rows)===JSON.stringify(latestLog.rows));
 await page.screenshot({path:path.join(out,'exports.png'),fullPage:true});
 await root.getByLabel('Preset',{exact:true}).selectOption('Indicators');
 await page.reload();await page.getByTestId('trade-observations').getByRole('button',{name:/Inspect /}).first().waitFor();
 check('URL restores preset',(await root.getByLabel('Preset',{exact:true}).inputValue())==='Indicators');
 await root.getByLabel('Preset',{exact:true}).selectOption('Monitor');
 await root.getByRole('button',{name:'Compact spacing',exact:true}).click();
 check('density changes spacing only',await root.getByRole('button',{name:/Inspect /}).count()===latestLog.rows.length);
 await page.setViewportSize({width:720,height:450}); // 1440×900 browser-equivalent 200% layout viewport
 await page.screenshot({path:path.join(out,'zoom-200-equivalent.png'),fullPage:true});
 check('200 percent equivalent no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 failContext=true;await page.reload();await page.getByTestId('trade-observations').getByRole('button',{name:/Inspect /}).first().waitFor({timeout:60000});
 check('market context failure does not block observation API/table',failedContextRequests>0&&await page.getByTestId('trade-observations').getByRole('button',{name:/Inspect /}).count()===latestLog.rows.length);
 check('no browser errors',!errors.length,errors);check('no mutation requests',!forbidden.length,forbidden);
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({before,checks},null,2));
 console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,failed:checks.filter(c=>!c.pass).map(c=>({name:c.name,details:c.details})),out},null,2));
 if(checks.some(c=>!c.pass))process.exitCode=1;
 await page.unrouteAll({behavior:'wait'});
} finally {await browser.close();}
