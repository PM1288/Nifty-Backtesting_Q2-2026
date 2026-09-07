import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const base=process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50';
if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const out='output/playwright/cash-oi-20260907';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
function check(name,pass){results.push({name,pass});if(!pass)throw new Error(name);}
try{for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});check(`${width} login`,login.ok());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=page.waitForResponse(r=>r.url().includes('/v1/trading-analytics?'),{timeout:60000});
  await page.goto(`${base}/strategy/trading-analytics?view=morning`);const r=await response;const d=await r.json();check(`${width} API`,r.ok()&&d.cashHistory!=null);
  await page.getByRole('heading',{name:'Daily FII/FPI & DII · cash segment'}).waitFor();
  const cash=page.getByRole('region',{name:'Daily FII and DII cash segment'});
  check(`${width} both participants`,await cash.getByRole('rowheader',{name:'FII/FPI',exact:true}).count()===1&&await cash.getByRole('rowheader',{name:'DII',exact:true}).count()===1);
  check(`${width} cash dated separately`,await cash.getByRole('combobox',{name:'Cash report date'}).inputValue()===d.cashHistory.latestDate);
  check(`${width} cash missing report not backfilled into matrix`,d.cashHistory.latestDate===d.reportDate||d.morning.cashNet===null);
  check(`${width} no execution`,d.liveOrdersEnabled===false&&d.paperOrdersEnabled===false);
  const download=page.waitForEvent('download');await cash.getByRole('button',{name:'Export cash history CSV'}).click();const file=await download;await file.saveAs(`${out}/${width}-cash.csv`);const csv=await fs.readFile(`${out}/${width}-cash.csv`,'utf8');check(`${width} full CSV count`,csv.split('\r\n').length===d.cashHistory.rows.length+1&&csv.includes('buy_value')&&csv.includes('sell_value'));
  await cash.locator('canvas').waitFor();await cash.screenshot({path:`${out}/${width}-cash.png`});
  const next=page.waitForResponse(r=>r.url().includes('/v1/trading-analytics?'),{timeout:60000});await page.goto(`${base}/strategy/trading-analytics?view=smartapi`);const oi=await(await next).json();
  await page.getByRole('heading',{name:'NIFTY SmartAPI OI & Quotes'}).waitFor();
  check(`${width} all Greek and OI columns`,await page.getByRole('columnheader',{name:'Prior snapshot ΔOI',exact:true}).count()===1&&await page.getByRole('columnheader',{name:'Delta',exact:true}).count()===1&&await page.getByRole('columnheader',{name:'Provider day ΔOI',exact:true}).count()===1);
  check(`${width} OI arithmetic`,oi.smartapi.legs.every(l=>l.open_interest==null||l.previous_open_interest==null?l.previous_snapshot_delta===null:l.previous_snapshot_delta===Number(l.open_interest)-Number(l.previous_open_interest)));
  check(`${width} no invented day OI`,oi.smartapi.legs.every(l=>l.change_in_oi===null));
  await page.getByRole('combobox',{name:'OI chart measure'}).selectOption('previous_snapshot_delta');await page.locator('main canvas').first().waitFor();await page.screenshot({path:`${out}/${width}-oi-change.png`,fullPage:true});
  await page.getByRole('combobox',{name:'OI chart measure'}).selectOption('delta');
  if(oi.smartapi.legs.every(l=>l.delta==null))check(`${width} missing Delta explicitly labelled`,await page.getByText('Unavailable: Option Delta · Greek. No zero values are synthesized.',{exact:true}).isVisible());
  const axe=await new AxeBuilder({page}).include('main').analyze();await fs.writeFile(`${out}/${width}-axe.json`,JSON.stringify(axe.violations,null,2));check(`${width} accessibility`,axe.violations.length===0);
  check(`${width} no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check(`${width} no JS errors`,errors.length===0);
  await fs.writeFile(`${out}/${width}-data.json`,JSON.stringify({cashHistory:d.cashHistory,legs:oi.smartapi.legs},null,2));await context.close();
}}finally{await browser.close();await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.pass).length}));
