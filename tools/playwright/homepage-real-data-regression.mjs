import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/homepage-real-data");
const applicationOrigin = new URL(baseUrl).origin;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  check("admin login", login.ok(), `status=${login.status()}`);

  const page = await context.newPage();
  const consoleErrors = [];
  const blockedThirdPartyScripts = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/static\.cloudflareinsights\.com.*Content Security Policy/i.test(message.text())) {
      blockedThirdPartyScripts.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === applicationOrigin) {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    }
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.locator('[data-analytics-section="home_sector_heatmap"]').waitFor({ state: "visible" });

  const stockPills = page.locator("[data-stock-pill-symbol]");
  await stockPills.first().waitFor({ state: "visible" });
  const symbols = await stockPills.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-stock-pill-symbol")));
  check("all F&O stock underlyings", symbols.length === 208, `rendered=${symbols.length}`);
  check("unique F&O stock underlyings", new Set(symbols).size === 208, `unique=${new Set(symbols).size}`);

  const selected = page.locator('[data-stock-pill-symbol][data-oiis-selected="true"]');
  const selectedCount = await selected.count();
  check("OIIS selections visible", selectedCount > 0, `selected=${selectedCount}`);
  const selectedBorder = await selected.first().evaluate((node) => getComputedStyle(node).borderTopColor);
  check("OIIS purple border", selectedBorder === "rgb(118, 85, 213)", `border=${selectedBorder}`);

  const anomalyFlash = page.locator('[data-analytics-section="home_fno_anomaly_flash"]');
  check("above-fold anomaly flash", await anomalyFlash.isVisible(), "F&O anomaly flash is not visible");
  check("large ask or excess move highlighted", await anomalyFlash.getByText(/BIG ASK|EXCESS MOVE/).count() > 0, "expected BIG ASK or EXCESS MOVE flash");

  const contractRadar = page.locator('[data-analytics-section="home_fno_contract_radar"]');
  await contractRadar.waitFor({ state: "visible" });
  check("active contract universe", await contractRadar.getByText("36,343", { exact: true }).count() === 1, "expected 36,343 active contracts");
  check("big ask metric", await contractRadar.getByText("Big asks", { exact: true }).count() === 1, "Big asks KPI missing");
  check("big bid metric", await contractRadar.getByText("Big bids", { exact: true }).count() === 1, "Big bids KPI missing");
  check("excess move metric", await contractRadar.getByText("Excess moves", { exact: true }).count() === 1, "Excess moves KPI missing");
  check("large anomaly cards", await contractRadar.locator("button").count() >= 12, `cards=${await contractRadar.locator("button").count()}`);

  const supporting = page.locator('[data-analytics-section="home_supporting_metrics"]');
  await supporting.waitFor({ state: "visible" });
  check("Dow visible", await supporting.getByText(/Dow/i).count() > 0, "Dow Jones missing");
  check("oil visible", await supporting.getByText(/Brent/i).count() > 0, "Brent crude missing");

  const firstMetric = stockPills.first().locator('[class*="pctValue"]');
  const priceMetric = await firstMetric.textContent();
  await page.getByRole("radio", { name: "RSI", exact: true }).click();
  const rsiMetric = await firstMetric.textContent();
  check("lens changes stock metric", priceMetric !== rsiMetric && (rsiMetric ?? "").includes("RSI"), `price=${priceMetric} rsi=${rsiMetric}`);
  await page.getByRole("radio", { name: "Price 1D", exact: true }).click();

  const search = page.getByPlaceholder("Find F&O stock");
  await search.fill("LTM");
  check("stock search filters", await stockPills.count() === 1, `filtered=${await stockPills.count()}`);
  check("selected border survives filter", await page.locator('[data-stock-pill-symbol="LTM"][data-oiis-selected="true"]').count() === 1, "LTM selection marker missing");
  await search.fill("");

  check("no viewport overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "homepage has horizontal overflow");
  check("no failed requests", failedRequests.length === 0, failedRequests.join(" | "));
  check("no application console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  check(
    "unapproved Cloudflare beacon remains blocked by CSP",
    blockedThirdPartyScripts.length <= 1,
    `blocked=${blockedThirdPartyScripts.length}`
  );

  await page.screenshot({ path: path.join(outputDir, "homepage-all-fno-1920x1080.png") });
  await page.screenshot({ path: path.join(outputDir, "homepage-all-fno-full-page.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(checks, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: checks.length, passed: checks.filter((item) => item.passed).length }, null, 2));
