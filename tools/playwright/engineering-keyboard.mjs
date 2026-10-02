import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected credentials and output directory required');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const checks=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const auth=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});
 assert.equal(auth.status(),200);
 const page=await context.newPage();
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.locator('main').waitFor();
 const skip=page.getByRole('link',{name:'Skip to content'});
 await skip.focus(); await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'main-content');
 checks.push('skip link focuses main content');
 const trigger=page.getByRole('contentinfo').getByRole('button').first();
 await trigger.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 for(const key of ['Tab','Tab','Tab','Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab','Shift+Tab','Shift+Tab']){
  await page.keyboard.press(key);
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
 }
 checks.push('forward and reverse tab remain inside modal');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.ok(await trigger.evaluate(el=>el===document.activeElement));
 checks.push('escape closes modal and restores trigger focus');
 await context.close();
}finally{await browser.close();await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2));}
console.log(JSON.stringify({checks:checks.length}));
