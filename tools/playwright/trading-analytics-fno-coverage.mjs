import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
const base=process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50';
if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const out='output/playwright/trading-analytics-fno-coverage';await fs.mkdir(out,{recursive:true});
const results=[],coverage=[];
function check(name,pass){results.push({name,pass});if(!pass)throw new Error(name);}
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 check('login',login.ok());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const symbol of ['NIFTY','BANKNIFTY','RELIANCE','SBIN']) {
   console.log(`Checking ${symbol}`);
   const loaded=page.waitForResponse(r=>r.url().includes('/v1/trading-analytics?')&&new URL(r.url()).searchParams.get('symbol')===symbol,{timeout:60000});
   const chart=page.waitForResponse(r=>r.url().includes('/v1/trading-analytics/charts?')&&new URL(r.url()).searchParams.get('symbol')===symbol,{timeout:60000});
   // Handle both listeners immediately so an earlier failed request cannot cause
   // an unhandled rejection and lose the diagnostic report.
   loaded.catch(()=>{});chart.catch(()=>{});
   await page.goto(`${base}/strategy/trading-analytics?view=scalper&symbol=${symbol}`);
   const response=await loaded;console.log(`${symbol} evidence HTTP ${response.status()}`);check(`${symbol} API`,response.ok());const d=await response.json();
   check(`${symbol} identity`,d.underlying.symbol===symbol);
   check(`${symbol} execution disabled`,!d.paperOrdersEnabled&&!d.liveOrdersEnabled);
   const chartResponse=await chart;check(`${symbol} chart API`,chartResponse.ok());const c=await chartResponse.json();
   check(`${symbol} 5m default`,c.interval===5);
   check(`${symbol} chart token`,c.panes[0].identity.symbol_token===d.underlying.token);
   check(`${symbol} exact option symbols`,c.panes.slice(1).every(p=>p.identity.tradingsymbol.startsWith(symbol)));
   await page.getByRole('combobox',{name:'Analytics underlying'}).waitFor();
   check(`${symbol} selection`,await page.getByRole('combobox',{name:'Analytics underlying'}).inputValue()===symbol);
   check(`${symbol} one day`,await page.getByRole('combobox',{name:/Chart range/}).inputValue()==='day');
   check(`${symbol} PCR and max pain panel`,await page.getByRole('region',{name:'Selected underlying option metrics'}).isVisible());
   if(symbol!=='BANKNIFTY'){
     check(`${symbol} observed PCR available`,Number.isFinite(d.smartapi.metrics.oiPcr));
     check(`${symbol} indicative max pain available`,d.smartapi.metrics.indicativeMaxPainStrikes.length>0);
   }
   await page.getByText(/source minutes in retained archive/).first().waitFor({timeout:60000});
   await page.getByText('Loading retained minute paths…',{exact:true}).waitFor({state:'hidden',timeout:60000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   coverage.push({symbol,universe:d.universe.length,daily:d.candles.length,contracts:d.smartapi.legs.length,quoted:d.smartapi.legs.filter(l=>l.last_price!=null).length,metrics:d.smartapi.metrics,panes:c.panes.map(p=>({identity:p.identity,minutes:p.sourceMinuteCount,completed:p.bars.filter(b=>b.closed).length})),errors:d.errors});
   await page.screenshot({path:`${out}/${symbol}-1440.png`,fullPage:true});
 }
 // Prove changing symbol removes an incompatible pinned option without dropping the lens.
 await page.goto(`${base}/strategy/trading-analytics?view=scalper&symbol=NIFTY&strike=25000&pin=true&expiry=2026-09-08`);
 await page.getByRole('combobox',{name:'Analytics underlying'}).selectOption('RELIANCE');
 const url=new URL(page.url());check('switch clears expiry and strike',url.searchParams.get('symbol')==='RELIANCE'&&!url.searchParams.has('strike')&&!url.searchParams.has('expiry')&&url.searchParams.get('view')==='scalper');
 await page.getByText(/RELIANCE-EQ · .*source minutes in retained archive/).first().waitFor({timeout:60000});
 await page.getByText('Loading retained minute paths…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   await page.getByRole('combobox',{name:'Analytics underlying'}).waitFor();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:`${out}/RELIANCE-${width}-selected.png`,fullPage:true});
   check(`${width} no page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const axe=await new AxeBuilder({page}).include('main').analyze();await fs.writeFile(`${out}/axe-${width}.json`,JSON.stringify(axe.violations,null,2));check(`${width} axe`,axe.violations.length===0);
 }
 check('no JavaScript errors',errors.length===0);
 await context.close();
} finally {await browser.close();await fs.writeFile(`${out}/results.json`,JSON.stringify({results,coverage},null,2));}
console.log(JSON.stringify({checks:results.length,passed:results.filter(x=>x.pass).length,coverage}));
