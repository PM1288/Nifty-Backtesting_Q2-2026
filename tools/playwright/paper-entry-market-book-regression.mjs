import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-entry-market-book");
await fs.mkdir(outputDir, { recursive: true });

const allowedBookStates = new Set(["CAPTURED", "PARTIAL_DEPTH", "NO_TWO_SIDED_BOOK", "NO_NEARBY_QUOTE"]);
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
    const expectedDirection = String(trade.side).toUpperCase() === "SELL" ? "SHORT" : "LONG";
    if (trade.trade_direction !== expectedDirection) {
      throw new Error(`${trade.symbol}: expected ${expectedDirection}, received ${trade.trade_direction}`);
    }
    if (trade.entry_book_status != null && !allowedBookStates.has(trade.entry_book_status)) {
      throw new Error(`${trade.symbol}: unexpected entry book state ${trade.entry_book_status}`);
    }
    if (trade.entry_book_status == null && (trade.entry_bid_levels?.length || trade.entry_ask_levels?.length)) {
      throw new Error(`${trade.symbol}: historical trade has depth without a capture state`);
    }
  }

  if (process.env.PLAYWRIGHT_API_ONLY === "1") {
    console.log(JSON.stringify({ status: "PASS", trades: trades.length, directionRows: trades.length, apiOnly: true }, null, 2));
    process.exit(0);
  }

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/(?:cloudflareinsights|clarity\.ms)/.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!route?.ok()) throw new Error(`paper route failed: ${route?.status()}`);
  await page.getByText("Complete trade evidence", { exact: true }).waitFor({ state: "attached", timeout: 120_000 });
  await page.getByRole("columnheader", { name: "Direction" }).waitFor({ state: "attached" });
  await page.locator("#trade-evidence tbody tr").first().getByRole("button", { name: /Open .* evidence/ }).click();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await page.getByRole("heading", { name: "Entry-time SmartAPI market book" }).waitFor({ timeout: 120_000 });
  await page.screenshot({ path: path.join(outputDir, "desktop-entry-book.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", trades: trades.length, directionRows: trades.length, screenshot: path.join(outputDir, "desktop-entry-book.png") }, null, 2));
} finally {
  await browser.close();
}
