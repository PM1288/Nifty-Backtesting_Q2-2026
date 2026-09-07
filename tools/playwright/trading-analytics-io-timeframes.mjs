import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50';
if(!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected password required');
const browser=await chromium.launch({headless:true});const results=[];
function check(name,pass){results.push({name,pass});if(!pass)throw new Error(name);}
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const login=await context.request.post(`${base}/auth/session/dev-login`,{headers:{Origin:new URL(base).origin},data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});check('authenticated login',login.ok());
 const page=await context.newPage();page.on('request',r=>{if(r.url().includes('trading-analytics/charts'))console.log('Chart request',r.url());});page.on('requestfailed',r=>{if(r.url().includes('trading-analytics/charts'))console.log('Chart failure',r.failure()?.errorText);});await page.goto(`${base}/strategy/trading-analytics?view=structure`);
 await page.getByRole('button',{name:'Full evidence JSON',exact:true}).waitFor({timeout:60000});
 await page.getByText('Loading recorded intraday candles…',{exact:true}).waitFor({state:'hidden',timeout:60000});
 for(const interval of [5,60]){
  const [r]=await Promise.all([page.waitForResponse(r=>r.url().includes('/v1/trading-analytics/charts?')&&new URL(r.url()).searchParams.get('interval')===String(interval)),page.getByRole('combobox',{name:/Intraday interval/}).selectOption(String(interval))]);
  const d=await r.json();check(`${interval}m uses actual API interval`,r.ok()&&d.interval===interval&&d.panes[0].bars.length>0);
  check(`${interval}m complete bars use session duration`,d.panes[0].bars.filter(b=>b.closed).every(b=>b.expectedMinutes<=interval&&b.coverage===b.expectedMinutes));
 }
 await page.getByRole('heading',{name:'Daily',exact:true}).waitFor();
 const summary=page.getByText('Daily context',{exact:true});
 const before=await page.locator('main canvas').count();await summary.click();
 await page.getByRole('heading',{name:'Daily',exact:true}).waitFor({state:'hidden'});
 await page.waitForFunction(expected=>document.querySelectorAll('main canvas').length===expected,before-1);
 check('collapsed period chart is unmounted',await page.locator('main canvas').count()===before-1);
 await summary.click();await page.getByRole('heading',{name:'Daily',exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/trading-analytics-io-20260907/timeframe-controls.png',fullPage:true});
}finally{await browser.close();await fs.mkdir('output/playwright/trading-analytics-io-20260907',{recursive:true});await fs.writeFile('output/playwright/trading-analytics-io-20260907/timeframe-results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.pass).length}));
