import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'https://n50.nifty50today.co.in/n50';
const output = process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/home/novius2/NIFTY50/evidence/scalper-refresh-20260919';
const env = await fs.readFile('.env', 'utf8');
const password = env.split(/\r?\n/).find(l => l.startsWith('DEV_LOCAL_AUTH_PASSWORD='))?.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');
assert(password, 'Protected password required');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({viewport: {width:1920,height:1080}});
  assert((await context.request.post(`${base}/auth/session/dev-login`, {headers:{Origin:new URL(base).origin},data:{identifier:'admin',password}})).ok());
  const page = await context.newPage();
  const errors = [], requests = [], responseTimings = [];
  const started = new Map();
  let documents = 0;
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++;
    if (/trading-analytics\/(charts|option-price-history|scalper-context)/.test(r.url())) { requests.push({url:r.url(),at:Date.now()}); started.set(r,Date.now()); }
  });
  page.on('requestfinished', r => { if (started.has(r)) responseTimings.push({url:r.url(),elapsedMs:Date.now()-started.get(r)}); });
  await page.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`);
  await page.getByTestId('v2-chart-host-put').waitFor({timeout:120000});
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__chartRoots = [...document.querySelectorAll('[data-testid^="v2-chart-host-"] .tv-lightweight-charts')];
    window.__pageStarted = performance.timeOrigin;
  });
  const start = Date.now();
  // Simulate an available deployment: this must show Apply update, not reload.
  await page.route('**/app-version.json*', route => route.fulfill({json:{version:'index-refresh-regression.js'}}));
  await page.getByText('Scale', {exact:true}).click();
  await page.getByRole('button',{name:'Last 30',exact:true}).click();
  await page.getByText('Scale', {exact:true}).click();
  console.log('Hydrated; observing a real 70-second polling window');
  await page.waitForTimeout(70000);
  const stable = await page.evaluate(() => ({
    samePage: window.__pageStarted === performance.timeOrigin,
    sameCharts: window.__chartRoots.length === 3 && window.__chartRoots.every(n => n.isConnected),
    roots: document.querySelectorAll('[data-testid^="v2-chart-host-"] .tv-lightweight-charts').length,
    dataOperations: [...document.querySelectorAll('[data-testid^="v2-chart-host-"]')].map(n => ({id:n.dataset.testid,setData:n.dataset.setDataCount,update:n.dataset.updateCount})),
  }));
  const pollRequests = requests.filter(r => r.at >= start);
  const observedMs = Date.now() - start;
  const expectedPricePolls = observedMs / 15_000;
  assert(stable.samePage && stable.sameCharts && stable.roots === 3, JSON.stringify(stable));
  assert.equal(documents,1,'No document reloads');
  assert(await page.getByRole('button',{name:'Apply update',exact:true}).isVisible());
  assert(pollRequests.some(r => r.url.includes('/charts?')), 'Minute refresh must occur');
  const chartPollCount = pollRequests.filter(r => r.url.includes('/charts?')).length;
  assert(chartPollCount >= Math.max(1, Math.floor(expectedPricePolls) - 1) && chartPollCount <= Math.ceil(expectedPricePolls) + 1, `Bounded 15-second price refresh: ${chartPollCount} requests across ${observedMs}ms`);
  assert(requests.filter(r => r.url.includes('/charts?')).every(r => !new URL(r.url).searchParams.has('asOf') && new URL(r.url).searchParams.get('interval') === '5'));
  const optionHistoryPolls = pollRequests.filter(r => r.url.includes('/option-price-history?'));
  assert(optionHistoryPolls.length >= 1 && optionHistoryPolls.length <= Math.ceil(observedMs / 30_000) + 1, `Bounded 30-second option-history refresh: ${optionHistoryPolls.length} requests across ${observedMs}ms`);
  assert(optionHistoryPolls.every(r => new URL(r.url).searchParams.get('historyDays') === '3' && new URL(r.url).searchParams.get('interval') === '5'), 'Option-history refresh keeps the bounded active context');
  assert.equal(errors.length,0,JSON.stringify(errors));
  const freshness = await page.getByTestId('v2-data-freshness').innerText();
  await page.screenshot({path:path.join(output,'stable-minute-refresh.png'),fullPage:false});
  const alertPage = await context.newPage();
  await alertPage.addInitScript(() => {
    window.__notifications = [];
    window.Notification = class {
      static permission = 'granted';
      constructor(title, options) { window.__notifications.push({title,...options}); }
    };
  });
  // Synthetic missing-candle fixture, never persisted to the data source.
  await alertPage.route('**/v1/trading-analytics/charts?*', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.panes = data.panes.map(p => ({...p,bars:[]}));
    await route.fulfill({response,json:data});
  });
  await alertPage.goto(`${base}/strategy/trading-analytics?view=scalper_v2&interval=5`);
  await alertPage.getByTestId('v2-data-freshness').waitFor({timeout:120000});
  assert.equal(await alertPage.getByTestId('v2-data-freshness').getAttribute('data-state'),'stale');
  await alertPage.waitForFunction(() => window.__notifications.length > 0);
  const notifications = await alertPage.evaluate(() => window.__notifications);
  assert.equal(notifications.length,1,'One notification per missing-data episode');
  await alertPage.screenshot({path:path.join(output,'synthetic-missing-data-alert.png'),fullPage:false});
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({stable,documents,freshness,pollRequests,responseTimings,syntheticAlert:notifications,errors,observedMs},null,2));
  console.log(JSON.stringify({stable,documents,freshness,pollRequests:pollRequests.length,output}));
} finally { await browser.close(); }
