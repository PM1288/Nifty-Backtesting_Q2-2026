import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4190/n50").replace(/\/$/, "");
const outputRoot = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/ui-v2-regression");
const routes = [
  { slug: "home", path: "/", expectsV2: false },
  { slug: "market", path: "/analytics", expectsV2: true },
  { slug: "oiis", path: "/strategy/oiis-live", expectsV2: true },
  { slug: "strategy-lab", path: "/backtesting/lab", expectsV2: true },
  { slug: "operations", path: "/analytics/system/map", expectsV2: true }
];
const viewports = [
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-1024", width: 1024, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "wide-1920", width: 1920, height: 1080 }
];

await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const route of routes) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(600);
      const evidence = await page.evaluate(() => {
        const scope = document.querySelector('[data-ui-generation="trading-v2"]');
        return {
          title: document.title,
          path: location.pathname,
          hasV2Scope: Boolean(scope),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          mainWidth: document.querySelector("main")?.getBoundingClientRect().width ?? null
        };
      });
      const passed =
        response?.ok() !== false &&
        evidence.hasV2Scope === route.expectsV2 &&
        !evidence.horizontalOverflow &&
        (evidence.mainWidth == null || evidence.mainWidth >= viewport.width - 100 || viewport.width >= 980);
      await page.screenshot({
        path: path.join(outputRoot, `${viewport.name}-${route.slug}.png`),
        fullPage: true
      });
      results.push({ viewport, route, status: response?.status() ?? null, passed, consoleErrors, ...evidence });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(path.join(outputRoot, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failures = results.filter((row) => !row.passed);
console.log(JSON.stringify({ baseUrl, checks: results.length, passed: results.length - failures.length, failed: failures.length }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
