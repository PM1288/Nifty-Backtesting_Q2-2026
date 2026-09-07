import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
// No implicit production target: the initial audit exposed pool exhaustion.
const base=process.env.REVIEW_BASE_URL;
if(!base)throw new Error('Set REVIEW_BASE_URL to an isolated validation environment');
if(new URL(base).hostname==='n50.nifty50today.co.in'&&process.env.REVIEW_ALLOW_PRODUCTION!=='1')throw new Error('Broad production review requires explicit REVIEW_ALLOW_PRODUCTION=1 after reliability remediation');
const retry=process.env.REVIEW_RETRY==='1';
const prior=retry?JSON.parse(await fs.readFile('output/retention-review-20260907/browser/results.json','utf8')):[];
const out=`output/retention-review-20260907/${retry?'browser-recheck':'browser'}`;await fs.mkdir(out,{recursive:true});
if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const app=await fs.readFile('neon-stock-terminal/apps/web/src/App.tsx','utf8');
const routes=[...app.matchAll(/<Route path="([^"]+)" element=\{([^\n]+)\}\s*\/>/g)].map(m=>({path:m[1],element:m[2],alias:/^<Navigate/.test(m[2]),parameterized:m[1].includes(':')}));
await fs.writeFile(`${out}/route-inventory.json`,JSON.stringify(routes,null,2));
const fixed=routes.filter(r=>!r.alias&&!r.parameterized&&!r.path.includes('*')).map(r=>r.path);
const mobile=['/','/full-board','/analytics','/institutional/flow','/strategy/oiis-live','/strategy/oiss-v1-202608','/strategy/trading-analytics','/paper-trading','/backtesting','/options/structure'];
const browser=await chromium.launch({headless:true});const results=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 if(!login.ok())throw new Error(`Login ${login.status()}`);
 for(const route of retry?prior.filter(r=>r.width===width&&r.state!=='SHELL_SMOKE_PASS_NOT_NUMERIC_PARITY').map(r=>r.route):width===1440?fixed:mobile.filter(r=>fixed.includes(r))){
  const page=await context.newPage(),failures=[],errors=[],blocked=[];
  await page.route('**/*',async r=>{const req=r.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())){blocked.push({method:req.method(),path:new URL(req.url()).pathname});return r.abort();}await r.continue();});
  page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  page.on('response',r=>{if(r.status()>=400&&r.url().includes('/n50/'))failures.push({status:r.status(),path:new URL(r.url()).pathname});});
  const start=Date.now(),key=route.replace(/[^a-z0-9]/gi,'_')||'home';let record={route,width};
  try{
   await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:20000});
   await page.waitForTimeout(retry?20000:4500);
   record={...record,observedMs:Date.now()-start,...await page.evaluate(()=>({title:document.querySelector('main h1,main h2')?.textContent??null,textLength:document.querySelector('main')?.textContent?.length??0,pageHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,canvases:document.querySelectorAll('main canvas').length,tables:document.querySelectorAll('main table').length,headerHeight:document.querySelector('header')?.getBoundingClientRect().height??null,alerts:[...document.querySelectorAll('main [role="alert"]')].map(e=>e.textContent?.slice(0,250)),busyElements:document.querySelectorAll('main [aria-busy="true"]').length}))};
   await page.screenshot({path:`${out}/${width}${key}.png`});
   if(mobile.includes(route)){const a=await new AxeBuilder({page}).include('main').analyze();record.axe=a.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}));}
   record.state=errors.length||failures.length||record.overflow||record.textLength<100?'REVIEW_REQUIRED':'SHELL_SMOKE_PASS_NOT_NUMERIC_PARITY';
  }catch(e){record.state='CHECK_INCOMPLETE';record.reason=e.message.slice(0,180);}
  results.push({...record,apiFailures:failures,jsErrors:errors,blockedMutations:blocked});await page.close();
  await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({route,width,state:record.state}));
  if(failures.some(f=>f.status>=500))throw new Error('Safety stop: server error observed; results saved. Do not continue loading routes.');
 }
 await context.close();
}}finally{await browser.close();}
console.log(JSON.stringify({observations:results.length,reviewRequired:results.filter(r=>r.state!=='SHELL_SMOKE_PASS_NOT_NUMERIC_PARITY').length}));
