import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/ui-decimal-precision");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

const defaultRoutes = [
  "/", "/analytics", "/analytics/leadership", "/analytics/daily-setups", "/analytics/market-state",
  "/analytics/regime", "/analytics/supporting-metrics", "/analytics/risk", "/analytics/indicators",
  "/analytics/stock/RELIANCE", "/catalysts/context", "/catalysts/events", "/institutional/flow",
  "/institutional/reports", "/options/structure", "/options/snapshot", "/options/volatility-signals",
  "/strategy/evaluation", "/strategy/oiis-live", "/paper-trading", "/market/nifty-500", "/futures",
  "/analytics/flows", "/analytics/system/quality", "/analytics/system/map", "/heatmap/change",
  "/heatmap/rsi", "/heatmap/will", "/backtesting", "/backtesting/lab", "/backtesting/strategies",
  "/backtesting/strategies/fast-oversold-rebound", "/backtesting/results", "/backtesting/regimes",
  "/backtesting/stocks", "/backtesting/daily-summary", "/backtesting/compare", "/backtesting/runs",
  "/backtesting/h30", "/analytics/learn", "/analytics/simulator", "/control-plane"
];
const routes = process.env.PLAYWRIGHT_ROUTES?.split(",").map((route) => route.trim()).filter(Boolean) ?? defaultRoutes;

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${baseUrl}/auth/session/dev-login`, {
  data: { identifier: "admin", password }
});
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await bootstrap.storageState();
await bootstrap.close();

const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, storageState });
const page = await context.newPage();
const results = [];

try {
  for (const route of routes) {
    let response;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (response?.status() !== 502 || attempt === 3) break;
      await page.waitForTimeout(attempt * 750);
    }
    const mainVisible = await page.locator("main").waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
    if (!mainVisible) {
      results.push({ route, status: response?.status() ?? null, mainVisible, longDecimals: [] });
      continue;
    }
    await page.waitForTimeout(500);
    const longDecimals = await page.evaluate(() => {
      const matches = new Map();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !["SCRIPT", "STYLE", "CODE", "PRE"].includes(parent.tagName)) {
          const style = window.getComputedStyle(parent);
          if (style.display !== "none" && style.visibility !== "hidden") {
            const text = node.textContent?.trim() ?? "";
            const auditableText = text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, "");
            for (const match of auditableText.matchAll(/(?:₹|[+-])?\d[\d,]*\.\d{3,}(?:%|×)?/g)) {
              if (!matches.has(match[0])) {
                matches.set(match[0], {
                  value: match[0],
                  element: parent.tagName,
                  className: parent.className,
                  text: text.slice(0, 160)
                });
              }
            }
          }
        }
        node = walker.nextNode();
      }
      return [...matches.values()].slice(0, 30);
    });
    results.push({ route, status: response?.status() ?? null, mainVisible, longDecimals });
  }
} finally {
  await context.close();
  await browser.close();
}

await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((row) => row.status !== 200 || !row.mainVisible || row.longDecimals.length > 0);
console.log(JSON.stringify({ routes: results.length, passed: results.length - failures.length, failed: failures.length, outputDir }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
