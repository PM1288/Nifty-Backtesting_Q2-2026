import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:15199/n50';
const output = process.env.PLAYWRIGHT_OUTPUT_DIR;
if (!output) throw new Error('Set a new attempt-specific PLAYWRIGHT_OUTPUT_DIR');
await fs.mkdir(output, { recursive: false });
const env = await fs.readFile('/home/novius2/trading-stack/.env', 'utf8');
const password = env.split(/\r?\n/).find(x => x.startsWith('DEV_LOCAL_AUTH_PASSWORD='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!password) throw new Error('Protected test login unavailable');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const login = await context.request.post('http://127.0.0.1:19090/n50/auth/session/dev-login', { data: { identifier: 'admin', password }, headers: { Origin: 'http://127.0.0.1:19090' } });
  if (!login.ok()) throw new Error(`Login HTTP ${login.status()}`);
  const cookies = await context.cookies();
  // Isolated loopback Vite serves proxied APIs outside /n50. This changes only
  // the test browser cookie path, not production authentication configuration.
  await context.addCookies(cookies.map(c => ({ ...c, path: '/', secure: false })));
  const page = await context.newPage();
  const failures = [];
  // Record path/status only: no headers, query strings, response bodies or secrets.
  page.on('response', response => { if (response.status() >= 400) failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on('requestfailed', request => failures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
  await page.goto(`${base}/strategy/oiis-live?tab=strategy-definition`, { waitUntil: 'domcontentloaded' });
  const definition = page.getByTestId('oiis-strategy-definition');
  await definition.waitFor({ timeout: 60000 });
  results.push({ check: 'U04 direct definition', pass: await definition.isVisible() });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await definition.waitFor();
  results.push({ check: 'U04 reload', pass: await definition.isVisible() });
  await page.screenshot({ path: path.join(output, 'desktop-oiis-definition.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.goBack();
  await definition.waitFor();
  results.push({ check: 'U04 history', pass: await definition.isVisible() });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('[class*="_decisionHero_"]').waitFor();
  for (const compact of [false, true]) for (const width of [320, 360, 390, 414, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => document.documentElement.setAttribute('data-ui-compact-v5', String(value)), compact);
    await page.locator('[class*="_decisionHero_"]').evaluate(el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(el.getBoundingClientRect().width)))));
    const geometry = await page.locator('[class*="_decisionHero_"]').evaluate(el => ({
      width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      columns: getComputedStyle(el).gridTemplateColumns,
      metaDisplay: getComputedStyle(el.querySelector('[class*="_decisionMeta_"]')).display,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    results.push({ check: `U01 ${width} compact=${compact}`, pass: geometry.width <= width && geometry.scrollWidth <= geometry.clientWidth + 2 && geometry.pageOverflow <= 2 && geometry.columns.split(' ').length === 1, geometry });
    await page.screenshot({ path: path.join(output, `oiis-${width}-compact-${compact}.png`), fullPage: true });
  }
  if (process.env.PLAYWRIGHT_EXTENDED === '1') {
    const screens = [['futures', '/futures'], ['regime', '/analytics/regime'], ['overview', '/analytics'], ['options', '/options/structure'], ['paper', '/paper-trading?tab=analyzer'], ['monthly', '/strategy/monthly'], ['scalper', '/strategy/trading-analytics?view=scalper_v2'], ['indicator', '/analytics/indicators/rsi']];
    for (const [name, route] of screens) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const start = failures.length;
        await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        const state = await page.locator('main').evaluate(el => ({
          headings: [...el.querySelectorAll('h1,h2')].map(x => x.textContent),
          tables: el.querySelectorAll('table').length,
          canvases: el.querySelectorAll('canvas').length,
          states: [...el.querySelectorAll('[role="alert"],[role="status"]')].map(x => x.textContent),
        })).catch(() => ({ missingMain: true }));
        // Discovery evidence only. A heading/table count is NOT readiness proof.
        results.push({ check: `${name}-${width} discovery`, status: 'NOT_VALIDATED', state, networkFailures: failures.slice(start) });
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
      }
    }
  }
  await fs.writeFile(path.join(output, 'network-failures.json'), JSON.stringify(failures, null, 2));
} catch (error) {
  results.push({ check: 'Browser execution', pass: false, error: String(error) });
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base, fixture: false, results }, null, 2));
}
console.log(JSON.stringify(results));
if (results.some(r => r.pass === false)) process.exitCode = 1;
