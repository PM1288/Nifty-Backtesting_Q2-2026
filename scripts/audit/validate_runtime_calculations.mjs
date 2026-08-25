#!/usr/bin/env node
/** Independently recompute representative UI/API metrics without writing data. */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromTools = createRequire(path.join(repoRoot, "tools/playwright/package.json"));
const { chromium } = requireFromTools("playwright");
const origin = (process.env.PLAYWRIGHT_ORIGIN ?? "http://127.0.0.1:19090").replace(/\/$/, "");
const envFile = process.env.PLAYWRIGHT_ADMIN_PASSWORD_FILE;
if (!envFile) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD_FILE is required");
const rawEnv = await fs.readFile(envFile, "utf8");
const passwordLine = rawEnv.split(/\r?\n/).find((line) => line.startsWith("DEV_LOCAL_AUTH_PASSWORD="));
if (!passwordLine) throw new Error("DEV_LOCAL_AUTH_PASSWORD was not found in the supplied file");
const password = passwordLine.slice(passwordLine.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const closeEnough = (a, b, tolerance = 0.011) => Math.abs(a - b) <= tolerance;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ timezoneId: "Asia/Kolkata", locale: "en-IN" });
const login = await context.request.post(`${origin}/n50/auth/session/dev-login`, { data: { identifier: "admin", password } });
if (!login.ok()) throw new Error(`Authorised login failed with HTTP ${login.status()}`);
const page = await context.newPage();
await page.goto(`${origin}/n50/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

async function get(pathname) {
  return page.evaluate(async (pathname) => {
    const started = performance.now();
    const response = await fetch(pathname, { credentials: "include", headers: { Accept: "application/json" } });
    const body = await response.text();
    return { status: response.status, durationMs: Math.round(performance.now() - started), body };
  }, pathname).then((result) => {
    if (result.status !== 200) throw new Error(`${pathname} returned HTTP ${result.status}: ${result.body.slice(0, 180)}`);
    return { data: JSON.parse(result.body), durationMs: result.durationMs };
  });
}

const [overviewResult, heatmapResult, paperResult] = await Promise.all([
  get("/n50/v1/overview"), get("/n50/v1/change-heatmap"), get("/n50/v1/workspace/paper-trading")
]);
const overview = overviewResult.data;
const heatmap = heatmapResult.data;
const paper = paperResult.data;
const checks = [];
const add = (id, pageName, ui, calculated, tolerance, source, notes = "") => checks.push({ id, page: pageName, ui, independentlyCalculated: calculated, difference: ui == null || calculated == null ? null : Number((finite(ui) - finite(calculated)).toFixed(8)), tolerance, result: ui != null && calculated != null && closeEnough(finite(ui), finite(calculated), tolerance) ? "PASS" : "FAIL", source, notes });

const stocks = (overview.sectors ?? []).flatMap((sector) => sector.stocks ?? []);
for (const stock of stocks.filter((row) => finite(row.previousClose) > 0 && Number.isFinite(Number(row.last))).slice(0, 10)) {
  const expected = (finite(stock.last) - finite(stock.previousClose)) / finite(stock.previousClose) * 100;
  add(`overview-change-${stock.symbol}`, "Home / Overview", finite(stock.changePct), expected, 0.011, "/v1/overview", "Percentage change from API last and previousClose.");
}

add("paper-combined-gross", "Paper Trading", finite(paper.summary?.combined_gross_pnl), finite(paper.summary?.realised_gross_pnl) + finite(paper.summary?.unrealised_pnl), 0.011, "/v1/workspace/paper-trading", "Backend declares REALISED_GROSS_PLUS_OPEN_UNREALISED_GROSS.");
const qualityRows = (paper.stockTrades ?? []).filter((trade) => Number.isFinite(Number(trade.quality_score)));
if (qualityRows.length) add("paper-quality-average", "Paper Trading", finite(paper.summary?.quality_score), qualityRows.reduce((sum, row) => sum + finite(row.quality_score), 0) / qualityRows.length, 0.51, "/v1/workspace/paper-trading", "Summary rounds the mean to an integer.");
const upside = (paper.stockTrades ?? []).reduce((sum, row) => sum + Math.max(0, finite(row.entry_notional) * finite(row.mfe_30d_pct) / 100), 0);
add("paper-analytical-upside", "Paper Trading", finite(paper.summary?.analytical_upside), upside, 0.02, "/v1/workspace/paper-trading", "Observed 30-session MFE opportunity; not executable/booked P&L.");

for (const trade of (paper.stockTrades ?? []).filter((row) => finite(row.average_entry_price) > 0 && Number.isFinite(Number(row.last_mark))).slice(0, 10)) {
  const expectedReturn = (String(trade.side).toUpperCase() === "SELL" ? finite(trade.average_entry_price) - finite(trade.last_mark) : finite(trade.last_mark) - finite(trade.average_entry_price)) / finite(trade.average_entry_price);
  add(`paper-current-return-${trade.trade_group_id}`, "Paper Trading", finite(trade.current_return), expectedReturn, 0.000001, "/v1/workspace/paper-trading", `${trade.symbol}; direction-normalised current return ratio.`);
  const expectedNotional = finite(trade.average_entry_price) * finite(trade.opened_quantity);
  add(`paper-entry-notional-${trade.trade_group_id}`, "Paper Trading", finite(trade.entry_notional), expectedNotional, 0.02, "/v1/workspace/paper-trading", `${trade.symbol}; entry price × opened quantity.`);
}

const heatmapRows = heatmap.rows ?? [];
for (const row of heatmapRows.filter((item) => Number.isFinite(Number(item.changePct)) && Number.isFinite(Number(item.latestChangePct))).slice(0, 10)) {
  const seriesIndex = heatmapRows.indexOf(row);
  const series = heatmap.values?.[seriesIndex] ?? [];
  const lastSeriesValue = [...series].reverse().find((value) => value != null && Number.isFinite(Number(value)));
  if (lastSeriesValue != null) add(`heatmap-latest-${row.symbol}`, "Change Heatmap", finite(row.latestChangePct), finite(lastSeriesValue), 0.011, "/v1/change-heatmap", "Latest row change must reconcile to the last non-null time-series cell.");
}

await browser.close();
const report = {
  generatedAt: new Date().toISOString(),
  environment: paper.environment,
  sourceAsOf: { overview: overview.asOf, heatmap: heatmap.asOf, paper: paper.asOf },
  responseTimeMs: { overview: overviewResult.durationMs, heatmap: heatmapResult.durationMs, paper: paperResult.durationMs },
  checks,
  summary: { total: checks.length, passed: checks.filter((row) => row.result === "PASS").length, failed: checks.filter((row) => row.result === "FAIL").length }
};
await fs.writeFile(path.join(repoRoot, "docs/trading-app-audit/evidence/calculation-validation.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed) process.exitCode = 1;
