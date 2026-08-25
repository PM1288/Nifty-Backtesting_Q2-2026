import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/trendlyne-summary-20260824");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  check("authenticated", login.ok(), `status=${login.status()}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/clarity\.ms|googletagmanager/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (!/clarity\.ms|analytics\.google|google-analytics|googletagmanager/i.test(request.url())) failedRequests.push(`${request.url()} ${request.failure()?.errorText}`);
  });

  await page.goto(`${baseUrl}/strategy/trendlyne-summary`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("heading", { name: "Trendlyne Summary", exact: true }).waitFor({ timeout: 60_000 });
  await page.getByText(/visible \/ .* reports/).waitFor({ timeout: 60_000 });
  await page.getByRole("link", { name: /Strategy/ }).first().hover();
  const strategyMenuItem = page.getByRole("menuitem", { name: /Trendlyne Summary/ });
  await strategyMenuItem.waitFor();
  check("Strategy dropdown entry", await strategyMenuItem.isVisible());
  const api = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, payload: await response.json() };
  }, `${baseUrl}/v1/trendlyne-summary/dashboard`);
  check("dashboard API", api.status === 200, `status=${api.status}`);
  check("six-month report population", api.payload.rows?.length > 0, `rows=${api.payload.rows?.length}`);
  check("directional recommendation population", api.payload.summary?.actionable > 0 && api.payload.summary.actionable <= api.payload.rows.length, `actionable=${api.payload.summary?.actionable}`);
  check("stock symbols and names", api.payload.rows.every((row) => row.symbol && row.stock_name), "missing symbol/name");
  check("house evidence", api.payload.houseSummary?.length > 10, `houses=${api.payload.houseSummary?.length}`);
  check("stock evidence", api.payload.stockSummary?.length > 100, `stocks=${api.payload.stockSummary?.length}`);
  check("charts rendered", await page.getByRole("img").count() >= 2, `charts=${await page.getByRole("img").count()}`);

  const recommendationFilter = page.locator("select").nth(0);
  const stockFilter = page.locator('input[placeholder="Symbol or company"]');
  await recommendationFilter.selectOption("Sell");
  const sellRows = await page.locator("section").filter({ hasText: "COMPLETE SIX-MONTH LEDGER" }).locator("tbody tr").count();
  check("recommendation filter", sellRows > 0 && sellRows < api.payload.summary.actionable, `sellRows=${sellRows}`);
  await recommendationFilter.selectOption("ACTIONABLE");
  await stockFilter.fill("PAYTM");
  const filteredRows = page.locator("section").filter({ hasText: "COMPLETE SIX-MONTH LEDGER" }).locator("tbody tr");
  check("stock filter", await filteredRows.count() > 0, `rows=${await filteredRows.count()}`);
  await filteredRows.first().click();
  await page.getByRole("heading", { name: "Recommendation chronology" }).waitFor();
  check("trade inspector", await page.getByText("First observable session").isVisible());
  check("stock 360 linkage", await page.getByRole("link", { name: "Open Stock 360" }).isVisible());
  await page.getByRole("button", { name: "Close inspector" }).click();

  check("page overflow contained", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  check("console clean", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("requests clean", failedRequests.length === 0, failedRequests.join(" | "));
  await page.screenshot({ path: path.join(outputDir, "trendlyne-summary-desktop.png"), fullPage: false });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((row) => row.passed).length, outputDir }, null, 2));
