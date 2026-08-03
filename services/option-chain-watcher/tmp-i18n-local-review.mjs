import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import('file:///C:/Users/Chiu/AppData/Roaming/npm/node_modules/playwright/index.mjs');

const baseUrl = 'http://127.0.0.1:19090/n50';
const language = process.env.LOCALE_LANGUAGE || 'hi';
const digits = process.env.LOCALE_DIGITS || 'deva';
const viewportWidth = Number(process.env.LOCALE_WIDTH || '1440');
const viewportHeight = Number(process.env.LOCALE_HEIGHT || '900');
const routes = [
  ['home','/'],
  ['market-hub','/analytics'],
  ['indicators-rsi','/analytics/indicators/rsi'],
  ['supporting-metrics','/analytics/supporting-metrics'],
  ['stock-reliance','/analytics/stocks/RELIANCE'],
  ['backtesting-detail','/backtesting/strategies/rsi30_willr80_closegtprev_tp125'],
];
const outDir = `C:/Github_sync/trading-stack/output/playwright/i18n-local-review-${language}-${digits}-${viewportWidth}`;
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });
for (const [key, route] of routes) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ language, digits }) => {
    localStorage.setItem('n50.locale.language', language);
    localStorage.setItem('n50.locale.digits', digits);
  }, { language, digits });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const meta = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    uiLanguage: document.documentElement.dataset.uiLanguage,
    digitSystem: document.documentElement.dataset.digitSystem,
  }));
  await fs.writeFile(path.join(outDir, `${key}.txt`), JSON.stringify({ key, route, meta, bodyText: bodyText.slice(0, 6000) }, null, 2), 'utf8');
  await page.screenshot({ path: path.join(outDir, `${key}.png`), fullPage: true });
  console.log(`ROUTE=${key}`);
  console.log(JSON.stringify({ key, route, meta, sample: bodyText.slice(0, 800) }));
  await page.close();
}
await browser.close();
