import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base = process.env.CRYPTO_APP_ORIGIN ?? 'https://n50.nifty50today.co.in';
const authOrigin = 'https://n50.nifty50today.co.in';
const output = process.env.CRYPTO_OUTPUT ?? '/home/novius2/NIFTY50/evidence/crypto-scalper-20261011';
const password = (await fs.readFile('.env','utf8')).split(/\r?\n/).find(line => line.startsWith('DEV_LOCAL_AUTH_PASSWORD='))?.split('=').slice(1).join('=').trim();
assert.ok(password, 'Protected login configuration required');
await fs.mkdir(output, { recursive:true });
const browser = await chromium.launch({headless:true});
const checks = [], errors = [];
try {
 const context = await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
 const login = await context.request.post(authOrigin+'/n50/auth/session/dev-login', {data:{identifier:'admin',password},headers:{Origin:authOrigin}});
 assert.equal(login.status(),200); checks.push('Authenticated public gateway login');
 if (base.includes('127.0.0.1')) await context.addCookies((await context.storageState()).cookies.map(c => ({...c,domain:'127.0.0.1',path:'/',secure:false,sameSite:'Lax'})));
 const page = await context.newPage();page.on('pageerror',e => errors.push(e.message));
 const bridge = async route => { const response = await context.request.get(process.env.CRYPTO_API_ORIGIN+'/v1/crypto-market'); await route.fulfill({response}); };
 if (process.env.CRYPTO_API_ORIGIN) await page.route('**/v1/crypto-market',bridge);
 await page.goto(base+'/n50/strategy/trading-analytics?view=crypto', {waitUntil:'domcontentloaded'});
 const root = page.getByTestId('crypto-scalper');
 await root.getByTestId('crypto-DOGE').waitFor({timeout:60000}).catch(async e=>{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error('Page URL:',page.url());console.error((await page.locator('body').innerText()).slice(0,2500));throw e;});
 await page.waitForFunction(() => document.querySelectorAll('[data-testid^="crypto-"] canvas').length >= 6);
 const api = await context.request.get((process.env.CRYPTO_API_ORIGIN ?? authOrigin+'/n50')+'/v1/crypto-market');
 assert.equal(api.status(),200); const data = await api.json(); assert.equal(data.markets.length,6);
 for (const m of data.markets) {
  assert.equal(m.state,'READY',m.symbol);assert.equal(m.bars.length,1000);
  const last=m.bars.at(-1);assert.ok(last.closeTime<Date.now());assert.ok(last.volumeCoin>=0&&last.volumeUsdt>=0&&Number.isInteger(last.tradeCount));
  assert.ok(await root.getByTestId('crypto-'+m.coin).isVisible());
 }
 await fs.writeFile(path.join(output,'live-snapshot.json'),JSON.stringify(data,null,2));
 checks.push('Six live pairs with 1000 completed Binance candles and actual base/quote volume and trades');
 assert.equal(await page.getByRole('button',{name:'Crypto Scalper',exact:true}).getAttribute('aria-current'),'page');
 assert.ok(await page.getByRole('button',{name:'Scalper V2',exact:true}).isVisible());checks.push('Crypto tab beside existing Scalper V2');
 await root.getByLabel('Volume',{exact:true}).selectOption('usdt');await root.getByLabel('Chart range').selectOption('4');
 await root.getByText('Completed candle data',{exact:true}).click();await root.getByLabel('Pair',{exact:true}).selectOption('DOGEUSDT');
 assert.equal(await root.locator('tbody tr').count(),24);checks.push('Range, volume unit and pair table controls');
 const downloadPromise=page.waitForEvent('download');await root.getByRole('button',{name:'Export CSV'}).click();const download=await downloadPromise;
 const csv=await fs.readFile(await download.path(),'utf8');assert.equal(csv.trim().split('\n').length,6001);assert.ok(csv.includes('volume_coin,volume_usdt,trade_count'));
 const first=data.markets[0].bars[0];assert.ok(csv.includes([new Date(first.openTime).toISOString(),'BTCUSDT',first.open,first.high,first.low,first.close,first.volumeCoin,first.volumeUsdt,first.tradeCount].join(',')));
 checks.push('CSV contains 6000 exact source candles');
 for(const viewport of [{width:1920,height:1080},{width:390,height:844}]) {
  await page.setViewportSize(viewport);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(output,`crypto-${viewport.width}.png`),fullPage:true});checks.push('Six-chart layout without page overflow '+viewport.width);
 }
 await page.unroute('**/v1/crypto-market');
 await page.route('**/v1/crypto-market',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...data,markets:data.markets.map(m=>({...m,state:'STALE',error:'Binance data could not be refreshed. Retry shortly.'}))})}));
 await root.getByRole('button',{name:'Refresh crypto',exact:true}).click();await root.getByTestId('crypto-BTC').getByText('STALE',{exact:true}).waitFor();
 assert.ok(await root.locator('canvas').count()>0);checks.push('Stale refresh preserves candles and marks evidence stale');
 await page.unroute('**/v1/crypto-market');if(process.env.CRYPTO_API_ORIGIN)await page.route('**/v1/crypto-market',bridge);
 await page.getByRole('button',{name:'Scalper V2',exact:true}).click();await page.getByTestId('scalper-v2').waitFor({timeout:90000}).catch(async e=>{await page.screenshot({path:path.join(output,'v2-failure.png'),fullPage:true});throw e;});
 assert.equal(new URL(page.url()).searchParams.get('view'),'scalper_v2');checks.push('Original Scalper V2 remains accessible');
 assert.deepEqual(errors,[]);checks.push('No browser JavaScript errors');await context.close();
}finally{await browser.close();await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify({passed:checks.length,output}));
