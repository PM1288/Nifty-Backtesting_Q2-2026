import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=process.env.REVIEW_ORIGIN??'http://127.0.0.1:15218';
const output=process.env.REVIEW_OUTPUT??'output/playwright/paper-analyzer';
const env=await fs.readFile('.env','utf8');
const password=env.split(/\r?\n/).find(line=>line.startsWith('DEV_LOCAL_AUTH_PASSWORD='))?.split('=').slice(1).join('=').trim();
assert.ok(password);await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
const result={origin,errors:[],mutations:[],views:[],status:'NOT_RUN'};
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080}});
 const login=await context.request.post('http://127.0.0.1:19090/n50/auth/session/dev-login',{data:{identifier:'admin',password}});assert.ok(login.ok());
 const cookie=(await context.storageState()).cookies.find(c=>c.name.includes('session'));if(cookie)await context.addCookies([{...cookie,domain:'127.0.0.1',path:'/',secure:false,sameSite:'Lax'}]);
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
 page.on('request',req=>{if(req.url().includes('/v1/workspace/paper-trading')&&req.method()!=='GET')result.mutations.push(req.url());});
 await page.goto(`${origin}/n50/paper-trading?tab=analyzer`);
 const root=page.getByTestId('paper-trade-analyzer');await root.waitFor({timeout:120000});
 await page.waitForFunction(()=>{const e=document.querySelector('[data-testid="paper-refresh-time"]');return e&&!e.textContent.includes('Waiting for complete ledger');},{},{timeout:120000});
 await root.getByRole('img',{name:'Paper outcome distribution',exact:true}).waitFor({timeout:30000});
 assert.ok(await root.locator('canvas').count()>=3,'Distribution, scatter and correlation render');
 await page.screenshot({path:`${output}/closed-desktop.png`,fullPage:true});
 for(const basis of ['open','eod','closed']){await root.getByLabel('Outcome basis',{exact:true}).selectOption(basis);await page.waitForTimeout(200);result.views.push(basis);}
 await root.getByLabel('Parameter',{exact:true}).selectOption('volume');
 await root.getByLabel('Compare by').selectOption('parameter');
 await root.getByText('Dataset-relative Q1/Q2/Q3 boundaries:',{exact:false}).waitFor();
 await root.getByLabel('Compare by').selectOption('direction');
 await root.getByLabel('Probability density').check();
 await root.getByLabel('Stock',{exact:true}).fill('NO_MATCH_123');await root.getByText('No eligible outcomes for these filters.',{exact:false}).waitFor();
 await root.getByLabel('Stock',{exact:true}).fill('');
 const csv=page.waitForEvent('download');await root.getByRole('button',{name:'Export CSV',exact:true}).click();assert.ok((await csv).suggestedFilename().endsWith('.csv'));
 const json=page.waitForEvent('download');await root.getByRole('button',{name:'Export analysis JSON',exact:true}).click();assert.ok((await json).suggestedFilename().endsWith('.json'));
 await root.locator('table').last().getByRole('button').first().click();await page.getByRole('button',{name:'Close trade detail'}).waitFor();assert.ok(new URL(page.url()).searchParams.has('tradeId'));await page.getByRole('button',{name:'Close trade detail'}).click();
 for(const width of [1920,390]){await page.setViewportSize({width,height:width===390?844:1080});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No page-wide overflow');await page.screenshot({path:`${output}/analyzer-${width}.png`,fullPage:true});}
 await page.getByRole('navigation',{name:'Paper Trading views'}).getByRole('button',{name:'Simple view',exact:true}).click();assert.ok(new URL(page.url()).searchParams.get('tab')==='simple');
 await page.getByRole('navigation',{name:'Paper Trading views'}).getByRole('button',{name:'Analyzer',exact:true}).click();await root.waitFor();
 assert.equal(result.errors.length,0);assert.equal(result.mutations.length,0);result.status='PASS';
}catch(e){result.status='FAIL';result.failure=String(e);process.exitCode=1;}
finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify(result,null,2));}
console.log(JSON.stringify(result));
