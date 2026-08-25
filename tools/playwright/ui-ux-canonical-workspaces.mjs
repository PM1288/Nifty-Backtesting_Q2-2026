import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/ui-ux-canonical-workspaces");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

const viewports = [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "tablet-1024x768", width: 1024, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 }
];

const destinations = [
  { name: "01-today-market-canvas", route: "/" },
  { name: "02-markets-market-story", route: "/analytics" },
  { name: "03-stocks-stock-360", route: "/analytics/stock/RELIANCE" },
  { name: "04-oiis-lab-live-selection", route: "/strategy/oiis-live" },
  { name: "05-paper-trading-command-center", route: "/paper-trading" },
  { name: "06-derivatives-options-overview", route: "/options/intelligence" },
  { name: "07-data-operations-trust", route: "/analytics/system/quality" },
  { name: "08-admin-control-plane", route: "/control-plane", admin: true }
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const bootstrap = await browser.newContext();
const login = await bootstrap.request.post(`${baseUrl}/auth/session/dev-login`, {
  data: { identifier: "admin", password }
});
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`);
const storageState = await bootstrap.storageState();
await bootstrap.close();

const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, storageState });
    const page = await context.newPage();
    for (const destination of destinations) {
      const responseErrors = [];
      const consoleErrors = [];
      const onResponse = (response) => {
        if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseUrl).origin) {
          responseErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
      };
      const onConsole = (message) => {
        if (
          message.type() === "error" &&
          !/static\.cloudflareinsights\.com.*Content Security Policy|ERR_NETWORK_CHANGED|clarity/i.test(message.text())
        ) consoleErrors.push(message.text());
      };
      page.on("response", onResponse);
      page.on("console", onConsole);

      const navigation = await page.goto(`${baseUrl}${destination.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      });
      await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
      if (destination.admin) {
        await page.locator('[data-admin-shell="true"]').waitFor({ timeout: 30_000 });
      } else {
        await page.getByRole("navigation", {
          name: viewport.width <= 720 ? "Mobile workspace navigation" : "Workspace navigation",
          exact: true
        }).waitFor({ timeout: 30_000 });
      }
      await page.waitForTimeout(1_000);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const screenshot = path.join(outputDir, `${destination.name}-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      results.push({
        viewport: viewport.name,
        dashboard: destination.name,
        route: destination.route,
        navigationStatus: navigation?.status() ?? null,
        overflow,
        responseErrors,
        consoleErrors,
        screenshot
      });
      page.off("response", onResponse);
      page.off("console", onConsole);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

const failures = results.filter(
  (result) => result.navigationStatus !== 200 || result.overflow || result.responseErrors.length || result.consoleErrors.length
);
console.log(JSON.stringify({ dashboards: results.length, passed: results.length - failures.length, failed: failures.length, outputDir }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
