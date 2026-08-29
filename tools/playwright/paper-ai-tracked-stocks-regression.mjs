import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-ai-tracked-stocks");
await fs.mkdir(outputDir, { recursive: true });

const provider = (name, verdict, confidence, summary) => ({
  provider: name,
  model: `${name.toLowerCase()}-test-model`,
  status: "SUCCEEDED",
  verdict,
  confidence,
  newsSignal: "NEUTRAL",
  summary,
  keyDriver: `${name} verified the principal driver`,
  keyRisk: `${name} identified the principal risk`,
  entryView: "Wait for the governed entry condition",
  invalidation: "Exit when the governed invalidation is met",
  evidence: [{ date: "2026-08-29", publisher: "NSE", headline: `${name} source evidence`, url: "https://www.nseindia.com/" }],
  completedAt: "2026-08-29T04:45:00.000Z",
  durationMs: 1250,
  errorClass: null,
  deliveryStatus: "SENT",
});

const makeStock = (symbol, companyName, source, direction, ofactor, xfactor, close, volume) => ({
  evaluationId: `eval-${symbol}`,
  tradeDate: "2026-08-29",
  symbol,
  companyName,
  exchange: "NSE",
  direction,
  strategyStatus: direction === "LONG" ? "BUY NOW" : "WAIT FOR FAILED BOUNCE",
  ofactor,
  xfactor,
  referencePrice: close,
  sourceDataThrough: "2026-08-28",
  historySessionCount: 30,
  evaluationStatus: "COMPLETED",
  discoveredAt: "2026-08-29T04:30:00.000Z",
  completedAt: "2026-08-29T04:45:00.000Z",
  sources: [{ strategy: source, runId: `run-${symbol}`, candidateId: `candidate-${symbol}`, slot: "FIRST_SCAN", trigger: "NEW_STOCK", observedAt: "2026-08-29T04:30:00.000Z" }],
  providers: {
    CLAUDE: provider("CLAUDE", "TRADE", 82, `Claude research for ${symbol}`),
    QWEN: provider("QWEN", "WATCH", 68, `Qwen research for ${symbol}`),
    DEEPSEEK: provider("DEEPSEEK", "AVOID", 74, `DeepSeek research for ${symbol}`),
  },
  inputSnapshot: {
    history_30d: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      open: close - 2,
      high: close + 4,
      low: close - 5,
      close,
      volume,
    })),
  },
});

const stocks = [
  makeStock("SBIN", "State Bank of India", "OIIS_LIVE", "LONG", 82.4, 79.1, 815.25, 12_450_000),
  makeStock("INFY", "Infosys Limited", "OISS_V1_202608", "LONG", 77.8, 75.2, 1564.4, 6_240_000),
  makeStock("RELIANCE", "Reliance Industries Limited", "OIIS_LIVE", "SHORT", 0, 71.5, 1401.1, 8_110_000),
];

const fixture = {
  asOf: "2026-08-29T04:45:00.000Z",
  requestedDate: "2026-08-29",
  effectiveDate: "2026-08-29",
  usedLatestSession: false,
  count: stocks.length,
  stocks,
};

const browser = await chromium.launch({ headless: true });
const checks = [];
const check = (condition, label) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
};

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  check(login.ok(), `admin login HTTP ${login.status()}`);

  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/(?:cloudflareinsights|clarity\.ms)/.test(message.text())) consoleErrors.push(message.text());
  });
  await page.route("**/v1/workspace/paper-trading/tracked-stocks?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(fixture),
  }));

  const response = await page.goto(`${baseUrl}/paper-trading?tab=tracked`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  check(Boolean(response?.ok()), `tracked tab route HTTP ${response?.status()}`);
  await page.getByRole("heading", { name: "Stocks being tracked today", exact: true }).waitFor({ timeout: 120_000 });
  check(new URL(page.url()).searchParams.get("tab") === "tracked", "tracked tab is URL-addressable");
  check(await page.locator("tbody tr").count() === 3, "three tracked stock rows render");
  for (const symbol of ["SBIN", "INFY", "RELIANCE"]) check(await page.getByText(symbol, { exact: true }).count() >= 1, `${symbol} renders`);
  for (const heading of ["CLAUDE", "QWEN", "DEEPSEEK"]) check(await page.getByRole("columnheader", { name: heading }).count() === 1, `${heading} provider column renders`);
  check(await page.getByText("O 0 · X 71.5", { exact: true }).count() === 1, "numeric zero is preserved");

  const search = page.getByLabel("Search");
  await search.fill("OISS");
  check(await page.locator("tbody tr").count() === 1, "strategy search filters to one row");
  check(await page.getByText("INFY", { exact: true }).count() >= 1, "filtered INFY remains visible");
  await search.fill("");

  await page.getByRole("button", { name: "View details" }).first().click();
  const inspector = page.getByRole("dialog", { name: "SBIN AI research detail" });
  await inspector.waitFor();
  check(await inspector.getByRole("heading", { name: "CLAUDE", exact: true }).count() === 1, "Claude inspector detail renders");
  check(await inspector.getByRole("heading", { name: "QWEN", exact: true }).count() === 1, "Qwen inspector detail renders");
  check(await inspector.getByRole("heading", { name: "DEEPSEEK", exact: true }).count() === 1, "DeepSeek inspector detail renders");
  check(await inspector.locator("tbody tr").count() === 30, "30 immutable OHLCV sessions render");
  await page.keyboard.press("Escape");
  check(await inspector.count() === 0, "Escape closes inspector");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = path.join(outputDir, await download.suggestedFilename());
  await download.saveAs(downloadPath);
  const csv = await fs.readFile(downloadPath, "utf8");
  check(["SBIN", "INFY", "RELIANCE"].every((symbol) => csv.includes(`\"${symbol}\"`)), "CSV exports all three filtered rows");
  check(csv.includes("claude_verdict") && csv.includes("qwen_verdict") && csv.includes("deepseek_verdict"), "CSV preserves all provider columns");

  await page.screenshot({ path: path.join(outputDir, "desktop-1920x1080.png"), fullPage: true });
  check(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join(" | ") || "none"}`);
  await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify({ status: "PASS", checks: checks.length, stocks: stocks.map((stock) => stock.symbol), screenshot: "desktop-1920x1080.png", csv: path.basename(downloadPath) }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, outputDir }, null, 2));
} finally {
  await browser.close();
}
