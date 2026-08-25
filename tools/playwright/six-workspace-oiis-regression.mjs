import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/six-workspace-oiis");
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required.");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  record("admin login", login.ok(), `status=${login.status()}`);

  const page = await context.newPage();
  const consoleErrors = [];
  const failedResponses = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/static\.cloudflareinsights\.com.*Content Security Policy|ERR_NETWORK_CHANGED/i.test(message.text())
    ) consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseUrl).origin) {
      failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
  const primary = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
  await primary.waitFor();
  record("seven primary workspaces", await primary.getByRole("link").count() === 7, "expected seven decision-led workspaces");
  for (const label of ["Today", "Markets", "Stocks", "OIIS Lab", "Paper Trading", "Derivatives", "Data & Operations"]) {
    record(`workspace ${label}`, await primary.getByRole("link", { name: new RegExp(`^${label}\\b`) }).count() === 1, `${label} missing`);
  }
  record("today ticker", await page.locator('[data-clarity-region="top_ticker"]').count() === 1, "ticker should be visible on Today");
  record("home sector heatmap restored", await page.locator('[data-analytics-section="home_sector_heatmap"] [class*="sectorsViewport"]').isVisible(), "dynamic sector heatmap is hidden");

  record("legacy sidebar absent", await page.locator("#primary-site-sidebar").count() === 0, "retired sidebar remains in DOM");
  await primary.getByRole("link", { name: /^Markets\b/ }).click();
  await page.waitForURL(/\/analytics$/);
  record("router controls active workspace", await primary.getByRole("link", { name: /^Markets\b/ }).getAttribute("aria-current") === "page", "Markets is not active after route navigation");

  await page.goto(`${baseUrl}/strategy/oiis-live`, { waitUntil: "networkidle", timeout: 60_000 });
  record("strategy ticker suppressed", await page.locator('[data-clarity-region="top_ticker"]').count() === 0, "ticker should be absent in Strategy Lab");
  await page.getByRole("button", { name: /^Opportunity leaderboard/ }).click();
  await page.getByRole("heading", { name: "Opportunity leaderboard" }).waitFor();
  record("opportunity disclaimer", await page.getByText("this is not trade permission", { exact: false }).count() === 1, "opportunity and execution concepts are mixed");
  const qualitySums = await page.locator("tbody tr td:nth-child(3) strong").evaluateAll((nodes) => nodes.slice(0, 20).map((node) => Number(node.textContent)));
  record("quality sum descending", qualitySums.every((value, index) => index === 0 || qualitySums[index - 1] >= value), "O + X + DQ sequence is not descending");
  record("quality row colours", await page.locator('tbody tr[data-quality-band="green"],tbody tr[data-quality-band="yellow"],tbody tr[data-quality-band="orange"],tbody tr[data-quality-band="grey"]').count() > 0, "quality threshold bands missing");
  record("direction colours", await page.locator('[data-state="LONG"],[data-state="SHORT"]').count() > 0, "LONG/SHORT direction markers missing");
  await page.getByRole("button", { name: /^Execution queue/ }).click();
  await page.getByRole("heading", { name: "Execution queue" }).waitFor();
  record("execution distinction", await page.getByText("only entry-enabled rows are trades", { exact: false }).count() === 1, "entry permission distinction missing");
  await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
  await page.getByRole("heading", { name: "Data, gate and universe diagnostics" }).waitFor();
  await page.getByRole("heading", { name: "Data, gate and universe diagnostics" }).scrollIntoViewIfNeeded();
  record("all F&O diagnostic", await page.getByText("All F&O evaluated", { exact: true }).count() === 1, "all-F&O universe diagnostic missing");
  await page.getByRole("button", { name: /^All F&O evidence/ }).click();
  record("all F&O evidence table", await page.getByRole("columnheader", { name: "Opportunity / stock" }).count() === 1, "evidence table missing");
  record("OIIS document overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "OIIS page overflows viewport");
  await page.screenshot({ path: path.join(outputDir, "strategy-lab-oiis-all-fno.png"), fullPage: true });

  await page.goto(`${baseUrl}/analytics/stock/TITAN`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText("Selection evidence and technical history", { exact: true }).waitFor();
  record("stock OIIS evidence", await page.getByText("Every OIIS gate for this stock", { exact: true }).count() === 1, "stock gate evidence missing");
  record("stock technical chart", await page.getByRole("img", { name: "TITAN daily technical history" }).count() === 1, "price/Bollinger/pivot/volume/RSI chart missing");
  record("stock SmartAPI F&O", await page.getByText("SmartAPI F&O quotes, liquidity and Greeks", { exact: true }).count() === 1, "SmartAPI F&O detail missing");
  await page.screenshot({ path: path.join(outputDir, "stock-360-titan-evidence.png"), fullPage: true });

  await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "networkidle", timeout: 60_000 });
  record("paper workspace suppresses ticker noise", await page.locator('[data-clarity-region="top_ticker"]').count() === 0, "ticker should be absent in Paper Trading");

  await page.goto(`${baseUrl}/analytics/system/quality`, { waitUntil: "networkidle", timeout: 60_000 });
  record("operations ticker suppressed", await page.locator('[data-clarity-region="top_ticker"]').count() === 0, "ticker should be absent in Data & Operations");

  await page.goto(`${baseUrl}/control-plane`, { waitUntil: "networkidle", timeout: 60_000 });
  record("separate admin shell", await page.locator('[data-admin-shell="true"]').count() === 1, "admin shell marker missing");
  record("admin brand", await page.getByText("NIFTY 50 ADMIN", { exact: true }).count() === 1, "admin brand missing");
  record("trader navigation removed from admin", await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).count() === 0, "trader navigation visible in admin shell");
  record("admin navigation present", await page.getByRole("navigation", { name: "Administration navigation", exact: true }).count() === 1, "administration navigation missing");
  record("application responses", failedResponses.length === 0, failedResponses.join(" | "));
  record("console errors", consoleErrors.length === 0, `${consoleErrors.join(" | ")} ${failedResponses.join(" | ")}`.trim());
  await page.screenshot({ path: path.join(outputDir, "admin-control-plane.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length }, null, 2));
