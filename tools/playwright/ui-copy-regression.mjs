import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected credentials and output directory required');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}), checks=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const auth=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 assert.equal(auth.status(),200);
 const page=await context.newPage();
 await page.goto(base+'/analytics');await page.getByRole('heading',{name:'Market overview',exact:true}).waitFor({timeout:60000});
 assert.equal(await page.locator('main').count(),1);
 const details=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Market details'})}).first();
 await details.locator('summary').focus();await page.keyboard.press('Enter');assert.ok(await details.getAttribute('open')!==null);
 assert.ok(await details.getByRole('heading',{name:'Data quality',exact:true}).isVisible());
 assert.doesNotMatch(await page.locator('main').innerText(),/LLM brief|Machine facts|One short teaching note beginning/);
 assert.doesNotMatch(await details.innerText(), /\b(?:last|weekly_pcr|fii_buy_value_cr)=/i);
 checks.push('Market details open by keyboard and retain data-quality evidence without prompt residue');
 await page.screenshot({path:path.join(out,'market-details.png')});
 await page.goto(base+'/analytics/leadership');
 const interpretation=page.getByText('Interpretation and limitations',{exact:true}).first();
 await interpretation.waitFor({timeout:60000});
 assert.equal(await interpretation.locator('..').getAttribute('open'),null);
 await interpretation.focus();await page.keyboard.press('Enter');
 assert.notEqual(await interpretation.locator('..').getAttribute('open'),null);
 checks.push('Chart definitions and limitations remain keyboard accessible');
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  await page.setViewportSize(viewport);await page.goto(base+'/analytics/system/map');await page.getByRole('heading',{name:'Workspace directory'}).waitFor();
  assert.equal(await page.locator('main').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.ok(await page.getByRole('link',{name:'Paper trading',exact:true}).count()>0);
  checks.push('Directory links and contained layout '+viewport.width);
 }
 await page.goto(base+'/backtesting/h30');
 await page.getByRole('heading',{name:'Entry observations'}).waitFor({timeout:60000});
 await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.doesNotMatch(await page.locator('main').innerText(),/strategy_oiis_cash_daily_research_v1_0[12]/);
 checks.push('Historical charts render or show a concise unavailable state');
 await page.route('**/v1/options-intelligence/summary',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'SQL private diagnostic marker'})}));
 await page.goto(base+'/options/intelligence');await page.getByText('We couldn’t load this data. Try again.',{exact:true}).waitFor({timeout:60000});
 assert.doesNotMatch(await page.locator('main').innerText(),/SQL private diagnostic|API 500/);
 checks.push('Failed reads show safe product copy');
 await context.close();
}finally{await browser.close();await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2));}
console.log(JSON.stringify({checks:checks.length}));
