import fs from 'node:fs/promises';import {chromium} from 'playwright';import AxeBuilder from '@axe-core/playwright';
const base=process.env.PLAYWRIGHT_BASE_URL??'http://127.0.0.1:19090/n50';if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const out='output/playwright/scalper-5m-20260907';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
function check(name,pass){results.push({name,pass});if(!pass)throw new Error(name);}
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900}});
 const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});check(`${width} login`,login.ok());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=page.waitForResponse(r=>r.url().includes('/v1/trading-analytics/charts?')&&new URL(r.url()).searchParams.get('interval')==='5',{timeout:60000});
 await page.goto(`${base}/strategy/trading-analytics?view=scalper`);const r=await response;check(`${width} actual 5m response`,r.ok()&&(await r.json()).interval===5);
 await page.getByText(/source minutes in retained archive/).first().waitFor();
 check(`${width} one day default`,await page.getByRole('combobox',{name:/Chart range/}).inputValue()==='day');
 check(`${width} grid default`,await page.getByRole('checkbox',{name:'NIFTY 50-point grid'}).isChecked());
 const summary=page.getByText(/NIFTY 50 · .*source minutes in retained archive/).first();const one=await summary.innerText();
 await page.getByRole('combobox',{name:/Chart range/}).selectOption('all');check(`${width} URL range`,new URL(page.url()).searchParams.get('range')==='all');check(`${width} all days retains more bars`,await summary.innerText()!==one);
 await page.getByRole('combobox',{name:/Chart range/}).selectOption('day');
 // Explicit test-only research counts; no default or database configuration mutation.
 await page.getByRole('spinbutton',{name:/daily R lookback/}).fill('20');await page.keyboard.press('Tab');
 await page.getByRole('spinbutton',{name:/weekly R lookback/}).fill('12');await page.keyboard.press('Tab');
 await page.getByText('Refreshing…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 const d=await context.request.get(`${base}/v1/trading-analytics?dailyLookback=20&weeklyLookback=12`);const data=await d.json();check(`${width} level scopes`,d.ok()&&data.resistance.length===3&&data.resistance.every(v=>v.lookback!=null));
 check(`${width} preview never enables execution`,data.liveOrdersEnabled===false&&data.paperOrdersEnabled===false&&data.resistance.every(v=>v.selected==null||v.selected.resistance>v.price));
 await page.screenshot({path:`${out}/${width}-scalper.png`,fullPage:true});
 const axe=await new AxeBuilder({page}).include('main').analyze();await fs.writeFile(`${out}/${width}-axe.json`,JSON.stringify(axe.violations,null,2));check(`${width} accessibility`,axe.violations.length===0);
 check(`${width} no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check(`${width} no JS errors`,errors.length===0);
 await fs.writeFile(`${out}/${width}-levels.json`,JSON.stringify(data.resistance,null,2));await context.close();
}}finally{await browser.close();await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.pass).length}));
