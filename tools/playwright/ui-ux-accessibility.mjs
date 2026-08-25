import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const parsedBase = new URL(baseUrl);
const origin = parsedBase.origin;
const appPath = (process.env.PLAYWRIGHT_APP_PATH ?? parsedBase.pathname).replace(/\/$/, "");
const authPath = (process.env.PLAYWRIGHT_AUTH_PATH ?? `${appPath}/auth`).replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/ui-ux-accessibility");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

const requestedScreen = process.env.ACCESSIBILITY_SCREEN;
const routes = [
  ["today", "/"],
  ["markets", "/analytics"],
  ["stock-360", "/analytics/stock/RELIANCE"],
  ["oiis-lab", "/strategy/oiis-live"],
  ["paper-trading", "/paper-trading"],
  ["derivatives", "/options/intelligence"],
  ["data-operations", "/analytics/system/quality"],
  ["admin", "/control-plane"]
].filter(([name]) => !requestedScreen || name === requestedScreen);
const requestedViewport = process.env.ACCESSIBILITY_VIEWPORT;
const viewports = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "mobile", width: 390, height: 844 }
].filter(({ name }) => !requestedViewport || name === requestedViewport);

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${origin}${authPath}/session/dev-login`, {
  data: { identifier: "admin", password }
});
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await bootstrap.storageState();
await bootstrap.close();

const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, storageState, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const [name, route] of routes) {
      await page.goto(`${origin}${appPath}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.getByRole("main").waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(750);
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      results.push({
        viewport: viewport.name,
        route,
        screen: name,
        violations: report.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.length,
          targets: violation.nodes.slice(0, 10).map((node) => node.target),
          examples: violation.nodes.slice(0, 10).map((node) => ({
            target: node.target,
            html: node.html,
            failureSummary: node.failureSummary
          }))
        }))
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "axe-results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

const violations = results.flatMap((result) => result.violations.map((violation) => ({ ...violation, screen: result.screen, viewport: result.viewport })));
console.log(JSON.stringify({ scans: results.length, violations: violations.length, affectedNodes: violations.reduce((sum, item) => sum + item.nodes, 0), outputDir }, null, 2));
if (violations.length) process.exitCode = 1;
