import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:19090/n50').replace(/\/$/,'');
const password=process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if(!password) throw new Error('Protected PLAYWRIGHT_ADMIN_PASSWORD required');
const out=path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR??'output/playwright/trading-analytics-io-20260907');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[];
function check(name,pass,detail=''){results.push({name,pass,detail});if(!pass)throw new Error(`${name}: ${detail}`);}
try{
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1024,768],[390,844]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password}});
  check(`${width} login`,login.ok());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const start=Date.now();
  await page.goto(`${base}/strategy/trading-analytics`);
  await page.getByRole('button',{name:'Full evidence JSON',exact:true}).waitFor({timeout:60000});
  results.push({name:`${width} useful evidence`,pass:true,durationMs:Date.now()-start});
  const d=await page.evaluate(async()=>{const r=await fetch('/n50/v1/trading-analytics');if(!r.ok)throw new Error(`API ${r.status}`);return r.json();});
  check(`${width} source safety`,d.liveOrdersEnabled===false&&d.paperOrdersEnabled===false&&d.errors.length===0);
  check(`${width} six primary tabs`,await page.getByRole('navigation',{name:'Trading analytics lenses'}).getByRole('button').count()===6);
  for(const [view,label] of [['morning','Morning View'],['structure','Market Structure'],['scalper','Scalper'],['smartapi','OI & PCR'],['stock','Stock Activity'],['replay','History']]){
   const t=Date.now();
   await page.getByRole('navigation',{name:'Trading analytics lenses'}).getByRole('button',{name:label,exact:true}).click();
   check(`${width} ${view} URL`,new URL(page.url()).searchParams.get('view')===view);
   if(view==='scalper')await page.getByText(/source minutes/).first().waitFor({timeout:60000});
   if(view==='structure')await page.getByText('Loading recorded intraday candles…',{exact:true}).waitFor({state:'hidden',timeout:60000});
   await page.screenshot({path:path.join(out,`${width}-${view}.png`),fullPage:true});
   check(`${width} ${view} no horizontal page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(['morning','stock','replay'].includes(view))check(`${width} ${view} no inactive canvas`,await page.locator('main canvas').count()===0);
   const axe=await new AxeBuilder({page}).include('main').analyze();
   await fs.writeFile(path.join(out,`${width}-${view}-axe.json`),JSON.stringify(axe.violations,null,2));
   check(`${width} ${view} accessibility`,axe.violations.length===0,axe.violations.map(v=>v.id).join(','));
   results.push({name:`${width} ${view} switch + screenshot + axe`,pass:true,durationMs:Date.now()-t});
  }
  for(const name of ['Data Health','Source / Formula','Condition Evidence']){
   const trigger=page.getByRole('button',{name,exact:true});await trigger.click();
   await page.getByRole('dialog',{name,exact:true}).waitFor();
   await page.screenshot({path:path.join(out,`${width}-drawer-${name.split(' ')[0]}.png`)});
   const axe=await new AxeBuilder({page}).include('dialog').analyze();
   check(`${width} ${name} drawer accessibility`,axe.violations.length===0,axe.violations.map(v=>v.id).join(','));
   await page.keyboard.press('Escape');
   check(`${width} ${name} escape focus`,await trigger.evaluate(e=>e===document.activeElement));
  }
  for(const view of ['activity','participants','options','health']){
   await page.goto(`${base}/strategy/trading-analytics?view=${view}`);
   await page.getByRole('button',{name:'Full evidence JSON',exact:true}).waitFor({timeout:60000});
   if(view==='health'){await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');continue;}
   check(`${width} ${view} source alias`,await page.getByRole('button',{name:'Export source rows CSV',exact:true}).isVisible());
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export source rows CSV',exact:true}).click();
   const file=await download,csv=await fs.readFile(await file.path(),'utf8'),rows=view==='activity'?d.activity:view==='participants'?d.participants:d.chain.legs;
   check(`${width} ${view} export row parity`,csv.split('\r\n').length===rows.length+1);
   await file.saveAs(path.join(out,`${width}-${view}.csv`));
  }
  await page.goto(`${base}/strategy/trading-analytics?view=scalper`);
  await page.getByText(/source minutes/).first().waitFor({timeout:60000});
  await page.getByRole('button',{name:'Pin selected pair',exact:true}).click();
  const pinned=new URL(page.url()).searchParams.get('strike');
  check(`${width} pair pinned`,!!pinned&&new URL(page.url()).searchParams.get('pin')==='true');
  await page.getByRole('navigation',{name:'Trading analytics lenses'}).getByRole('button',{name:'Morning View',exact:true}).click();
  await page.getByRole('navigation',{name:'Trading analytics lenses'}).getByRole('button',{name:'Scalper',exact:true}).click();
  check(`${width} pin survives tabs`,new URL(page.url()).searchParams.get('strike')===pinned);
  const charts=await page.evaluate(async({asOf,expiry,strike})=>{const r=await fetch(`/n50/v1/trading-analytics/charts?${new URLSearchParams({asOf,expiry,strike,interval:'15'})}`);return {status:r.status,body:await r.json()};},{asOf:d.asOf,expiry:d.smartapi.expiry,strike:pinned});
  check(`${width} three real chart panes`,charts.status===200&&charts.body.panes.length===3);
  check(`${width} OI history known-at`,charts.body.panes.every(p=>p.oiHistory.every(r=>Date.parse(r.event_time)<=Date.parse(d.asOf)&&Date.parse(r.collected_at)<=Date.parse(d.asOf))));
  check(`${width} real OI history`,charts.body.panes.filter(p=>p.identity.exchange==='NFO').every(p=>p.oiHistory.length>0));
  check(`${width} weekly monthly source data`,d.periods.weekly.length>0&&d.periods.monthly.length>0);
  await fs.writeFile(path.join(out,`${width}-chart-evidence.json`),JSON.stringify(charts.body,null,2));
  await fs.writeFile(path.join(out,`${width}-evidence.json`),JSON.stringify(d,null,2));
  check(`${width} no uncaught JS`,errors.length===0,errors.join(';'));
  await context.close();
 }
}finally{await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify({checks:results.filter(r=>r.durationMs==null).length,passed:results.filter(r=>r.pass&&r.durationMs==null).length,output:out}));
