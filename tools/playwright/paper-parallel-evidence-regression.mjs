import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-parallel-evidence");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, { data: { identifier: "admin", password } });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const api = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`, { timeout: 120_000 });
  if (!api.ok()) throw new Error(`paper API failed: ${api.status()}`);
  const payload = await api.json();
  const trades = payload.stockTrades ?? [];
  if (!trades.length) throw new Error("no paper trades returned");

  const page = await context.newPage();
  const errors = [];
  const ignored = /(?:clarity\.ms|analytics\.google\.com|cloudflareinsights|ERR_BLOCKED_BY_CLIENT|ERR_ABORTED)/;
  page.on("console", (message) => { if (message.type() === "error" && !ignored.test(message.text())) errors.push(message.text()); });
  await page.goto(`${baseUrl}/paper-trading?section=factor-analysis`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Every stock from entry evidence to 30-session opportunity" }).waitFor({ timeout: 120_000 });

  const panel = page.getByRole("region", { name: /Every stock from entry evidence/ });
  const chart = panel.getByRole("group", { name: /Parallel coordinates/ });
  const lines = chart.locator('path[role="button"]');
  if (await lines.count() !== trades.length) throw new Error(`parallel line count ${await lines.count()} != trade count ${trades.length}`);
  for (const label of ["O", "X", "RSI", "ATR", "W%R", "RVOL", "Entry ₹", "Entry Δ", "D0 max", "Swing", "5D max", "30D max"]) {
    if (!await chart.getByText(label, { exact: true }).count()) throw new Error(`missing parallel axis ${label}`);
  }
  if (await page.getByText("Which entry conditions produced reward or pain", { exact: true }).isVisible()) throw new Error("legacy contour rendered while collapsed");

  const symbol = String(trades[0].symbol);
  await panel.getByLabel("Stock filter").fill(symbol);
  const filteredCount = await lines.count();
  if (filteredCount < 1 || filteredCount >= trades.length) throw new Error(`stock filter did not narrow lines: ${filteredCount}`);
  await panel.getByLabel("Colour lines by").selectOption("INTRADAY_MAX_PROFIT");

  await lines.first().focus();
  await panel.getByText("Open trade", { exact: true }).waitFor();
  await lines.first().press("Enter");
  const drawer = page.getByRole("complementary", { name: /paper trade detail/ });
  await drawer.waitFor();
  await drawer.getByRole("button", { name: "Close trade detail" }).click();
  await panel.getByLabel("Stock filter").fill("");

  const csvPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download data CSV" }).click();
  const csv = await csvPromise;
  const csvPath = path.join(outputDir, await csv.suggestedFilename());
  await csv.saveAs(csvPath);
  const csvText = await fs.readFile(csvPath, "utf8");
  for (const column of ["O_FACTOR", "X_FACTOR", "RSI14", "ATR14", "ENTRY_PRICE", "INTRADAY_MAX_PROFIT", "SWING_TARGET_PROFIT", "FIVE_DAY_MAX_PROFIT", "THIRTY_DAY_MAX_PROFIT"]) if (!csvText.includes(column)) throw new Error(`CSV missing ${column}`);

  const svgPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download plot SVG" }).click();
  const svg = await svgPromise;
  const svgPath = path.join(outputDir, await svg.suggestedFilename());
  await svg.saveAs(svgPath);
  const svgText = await fs.readFile(svgPath, "utf8");
  if (!svgText.includes("<svg") || !svgText.includes("Parallel coordinates")) throw new Error("SVG export is incomplete");

  await page.getByText("Open two-factor contour surfaces", { exact: true }).click();
  await page.getByRole("heading", { name: "Which entry conditions produced reward or pain" }).waitFor();

  const screenshots = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/paper-trading?section=factor-analysis`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("heading", { name: "Every stock from entry evidence to 30-session opportunity" }).waitFor({ timeout: 120_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error(`${viewport.width}x${viewport.height}: body overflow`);
    const file = `paper-parallel-evidence-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
    screenshots.push(file);
  }
  if (errors.length) throw new Error(`browser console errors: ${errors.join(" | ")}`);
  const result = { status: "PASS", asOf: payload.asOf, tradeCount: trades.length, axes: 12, minimumTickInterval: 1, csvPath, svgPath, screenshots };
  await fs.writeFile(path.join(outputDir, "regression-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
