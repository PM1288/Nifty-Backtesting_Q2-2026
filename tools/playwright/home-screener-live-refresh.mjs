import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const apiBase = (process.env.PLAYWRIGHT_API_BASE_URL ?? base).replace(/\/$/, "");
const authOrigin = process.env.PLAYWRIGHT_AUTH_ORIGIN ?? new URL(base).origin;
const stripBasePath = process.env.PLAYWRIGHT_STRIP_BASE_PATH === "1";
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const output = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/home-screener-live-refresh");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
await fs.mkdir(output, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw new Error(`${name}: ${detail}`);
}

async function login(context) {
  const response = await context.request.post(`${apiBase}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
    headers: { Origin: authOrigin },
  });
  check("Authenticated browser", response.ok(), `HTTP ${response.status()}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  if (stripBasePath) await context.route("**/n50/**", (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/n50/, "") || "/";
    return route.continue({ url: url.toString() });
  });
  await login(context);

  const home = await context.newPage();
  let homeNavigations = 0;
  home.on("framenavigated", (frame) => { if (frame === home.mainFrame()) homeNavigations += 1; });
  await home.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const homeSurface = home.locator('[data-testid="today-summary"], [data-analytics-section="home_sector_heatmap"]').first();
  await homeSurface.waitFor({ state: "visible", timeout: 45_000 });
  const initialHomeNavigations = homeNavigations;
  await homeSurface.evaluate((node) => { window.__n50HomeRefreshAnchor = node; });
  await home.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/v1/overview")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "synthetic refresh failure" }) });
    return route.continue();
  });
  await home.waitForTimeout(20_000);
  const homeAlert = home.getByTestId("live-refresh-health").filter({ hasText: "Refresh issue" });
  check("Home reports background refresh failure", await homeAlert.isVisible(), (await home.getByTestId("live-refresh-health").allTextContents()).join(" | "));
  check("Home keeps last good market canvas", await homeSurface.isVisible(), "Home market surface disappeared");
  check("Home canvas was not remounted", await home.evaluate(() => window.__n50HomeRefreshAnchor?.isConnected === true && (window.__n50HomeRefreshAnchor === document.querySelector('[data-testid="today-summary"]') || window.__n50HomeRefreshAnchor === document.querySelector('[data-analytics-section="home_sector_heatmap"]'))), "home root changed");
  check("Home did not navigate or reload", homeNavigations === initialHomeNavigations, `before=${initialHomeNavigations} after=${homeNavigations}`);
  await home.screenshot({ path: path.join(output, "home-refresh-failure-retained.png"), fullPage: false });
  await home.unroute("**/*");
  await homeAlert.getByRole("button", { name: "Retry now" }).click();
  await home.getByTestId("live-refresh-health").filter({ hasText: /Live refresh active|Refreshing in place/ }).waitFor({ state: "visible", timeout: 45_000 });
  check("Home recovers in place after retry", homeNavigations === initialHomeNavigations, `navigations=${homeNavigations}`);

  const screener = await context.newPage();
  let screenerNavigations = 0;
  screener.on("framenavigated", (frame) => { if (frame === screener.mainFrame()) screenerNavigations += 1; });
  await screener.goto(`${base}/strategy/scalper-dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await screener.getByTestId("scalper-table").waitFor({ state: "visible", timeout: 45_000 });
  const initialScreenerNavigations = screenerNavigations;
  const initialRows = await screener.getByTestId("scalper-table").locator("tbody tr").count();
  await screener.getByTestId("scalper-table").evaluate((node) => { window.__n50ScreenerRefreshAnchor = node; });
  await screener.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/v1/overview/scalper-progression")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "synthetic screener refresh failure" }) });
    return route.continue();
  });
  await screener.waitForTimeout(70_000);
  const screenerAlert = screener.getByTestId("live-refresh-health").filter({ hasText: "Refresh issue" });
  check("Screener reports background refresh failure", await screenerAlert.isVisible(), (await screener.getByTestId("live-refresh-health").allTextContents()).join(" | "));
  check("Screener retains all last-good rows", await screener.getByTestId("scalper-table").locator("tbody tr").count() === initialRows && initialRows > 0, `before=${initialRows} after=${await screener.getByTestId("scalper-table").locator("tbody tr").count()}`);
  check("Screener table was not remounted", await screener.evaluate(() => window.__n50ScreenerRefreshAnchor?.isConnected === true && window.__n50ScreenerRefreshAnchor === document.querySelector('[data-testid="scalper-table"]')), "table root changed");
  check("Screener did not navigate or reload", screenerNavigations === initialScreenerNavigations, `before=${initialScreenerNavigations} after=${screenerNavigations}`);
  await screener.screenshot({ path: path.join(output, "screener-refresh-failure-retained.png"), fullPage: false });
  await screener.unroute("**/*");
  await screenerAlert.getByRole("button", { name: "Retry now" }).click();
  await screener.getByTestId("live-refresh-health").filter({ hasText: /Live refresh active|Refreshing in place/ }).waitFor({ state: "visible", timeout: 45_000 });
  check("Screener recovers in place after retry", screenerNavigations === initialScreenerNavigations, `navigations=${screenerNavigations}`);
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ passed: results.length, output }, null, 2));
