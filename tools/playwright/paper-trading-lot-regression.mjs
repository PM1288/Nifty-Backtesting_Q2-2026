import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-trading-lot");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);

  const api = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`);
  if (!api.ok()) throw new Error(`paper workspace API failed: ${api.status()}`);
  const payload = await api.json();
  const trades = payload.stockTrades ?? [];
  if (!trades.length) throw new Error("paper workspace returned no trade rows");
  for (const trade of trades) {
    if (!Number.isFinite(Number(trade.opened_quantity)) || Number(trade.opened_quantity) <= 0) throw new Error(`${trade.symbol}: invalid quantity`);
    const expected = Number(trade.actual_pnl_total) / Number(trade.opened_quantity);
    if (Math.abs(Number(trade.actual_pnl_per_unit) - expected) > 0.000001) throw new Error(`${trade.symbol}: per-share P&L mismatch`);
  }
  const shortTrade = trades.find((trade) => trade.side === "SELL");
  if (!shortTrade) throw new Error("no SHORT paper trade was available for the deployed regression");

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!response?.ok()) throw new Error(`paper route failed: ${response?.status()}`);
  await page.getByRole("heading", { name: "Complete horizon matrix" }).waitFor();
  await page.getByRole("columnheader", { name: "Qty" }).waitFor();
  await page.getByRole("columnheader", { name: "Actual P&L / share" }).waitFor();
  await page.getByText("SHORT · SELL → BUY", { exact: false }).first().waitFor();
  await page.getByText(/\(Total [−]?₹/, { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(outputDir, "paper-trading-quantity-and-short-pnl.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", trades: trades.length, shortSymbol: shortTrade.symbol, quantityFields: true, perShareAndTotalPnl: true }, null, 2));
} finally {
  await browser.close();
}
