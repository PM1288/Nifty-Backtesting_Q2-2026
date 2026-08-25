import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-investment-scenarios");
await fs.mkdir(outputDir, { recursive: true });

const closeEnough = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.01;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);

  const response = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`, { timeout: 120_000 });
  if (!response.ok()) throw new Error(`paper workspace API failed: ${response.status()}`);
  const payload = await response.json();
  const trades = payload.stockTrades ?? [];
  if (!trades.length) throw new Error("paper workspace returned no trades");
  for (const trade of trades) {
    const entry = Number(trade.average_entry_price);
    const quantity = Number(trade.opened_quantity);
    const fixedQuantity = Math.floor(200000 / entry);
    if (!closeEnough(trade.fno_quantity_investment_required, entry * quantity)) {
      throw new Error(`${trade.symbol}: F&O-quantity investment mismatch`);
    }
    if (Number(trade.fixed_investment_quantity) !== fixedQuantity) {
      throw new Error(`${trade.symbol}: fixed quantity mismatch`);
    }
    if (!closeEnough(trade.fixed_investment_deployed, fixedQuantity * entry)) {
      throw new Error(`${trade.symbol}: fixed deployed amount mismatch`);
    }
    if (!closeEnough(Number(trade.fixed_investment_deployed) + Number(trade.fixed_investment_cash_remaining), 200000)) {
      throw new Error(`${trade.symbol}: fixed capital reconciliation mismatch`);
    }
  }
  const totals = trades.reduce((result, trade) => ({
    fnoInvestment: result.fnoInvestment + Number(trade.fno_quantity_investment_required),
    fixedBudget: result.fixedBudget + Number(trade.fixed_investment_budget),
    fixedDeployed: result.fixedDeployed + Number(trade.fixed_investment_deployed),
    fixedActualPnl: result.fixedActualPnl + Number(trade.fixed_investment_actual_pnl),
    fixedCarryPnl: result.fixedCarryPnl + Number(trade.fixed_investment_carry_pnl),
    fixedMaxProfit: result.fixedMaxProfit + Number(trade.fixed_investment_mfe_30d_pnl),
    fixedMaxDrawdown: result.fixedMaxDrawdown + Number(trade.fixed_investment_mae_30d_pnl),
  }), { fnoInvestment: 0, fixedBudget: 0, fixedDeployed: 0, fixedActualPnl: 0, fixedCarryPnl: 0, fixedMaxProfit: 0, fixedMaxDrawdown: 0 });

  const page = await context.newPage();
  const consoleErrors = [];
  const ignoredExternalCsp = /(?:static\.cloudflareinsights\.com|https:\/\/[^/]+\.clarity\.ms\/collect)/;
  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredExternalCsp.test(message.text()) && !message.text().includes("net::ERR_NETWORK_CHANGED")) consoleErrors.push(message.text());
  });
  const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!route?.ok()) throw new Error(`paper route failed: ${route?.status()}`);
  await page.getByRole("heading", { name: "Complete trade evidence" }).waitFor({ timeout: 120_000 });
  await page.getByRole("columnheader", { name: "Investment required" }).waitFor();
  await page.getByText("F&O quantity vs fixed ₹2 lakh per trade", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText("Fixed ₹2L scenario", { exact: true }).first().waitFor({ timeout: 120_000 });
  await page.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", trades: trades.length, formulaRows: trades.length, totals, desktop: true, mobile: true }, null, 2));
} finally {
  await browser.close();
}
