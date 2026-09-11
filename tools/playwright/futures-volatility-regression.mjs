import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.N50_CANDIDATE_URL || "http://127.0.0.1:4173/n50";
const outputDir = path.resolve("tools/playwright/output/futures-volatility");
fs.mkdirSync(outputDir, { recursive: true });

const row = {
  matchRank: 1, rankInValidReport: 1, symbol: "SYNTHPASS", reportDate: "2026-09-10",
  analysisSession: "2026-09-11", sourceRevisionId: "synthetic-revision", sourceCsvLine: 2,
  previousFuturesDailyVol: "0.02000000", currentFuturesDailyVol: "0.02012048",
  deltaRaw: "0.00012048", deltaBasisPoints: "1.20480000", qualifies: true,
  screenState: "MATCH", mappingState: "MAPPED_EQ", qualityFlags: [], isStock: true,
  reportUnderlyingClose: "100.00", reportUnderlyingPreviousClose: "99.00",
  reportFuturesClose: "101.00", reportFuturesPreviousClose: "100.00",
  underlyingLogReturn: "0.01005034", underlyingVolPrevious: "0.02000000",
  underlyingVolCurrent: "0.01999000", underlyingVolAnnual: "0.38100000",
  futuresLogReturn: "0.00995033", futuresVolAnnual: "0.38400000",
  applicableVolDaily: "0.02012048", applicableVolAnnual: "0.38400000",
  rawFields: { Date: "10-Sep-26", Symbol: "SYNTHPASS" },
  targetPreviousClose: "100.00", targetOpen: "101.00", targetHigh: "108.00",
  targetLow: "100.50", targetClose: "106.00", outcomeAsOf: "2026-09-11T12:00:00Z",
  outcomeState: "FINAL", openCloseChangePct: "4.95049505", previousCloseChangePct: "6.00000000",
  lowHighRangePct: "7.46268657", openCloseChange: "5.00", previousCloseChange: "6.00", lowHighRange: "7.50",
};
const fixture = {
  readiness: "READY", requestedAnalysisDate: null,
  ruleVersion: "FOVOLT_FUT_DAILY_DELTA_GT_0001_V1", thresholdRaw: "0.0001",
  scope: "stocks", matchesOnly: true,
  run: { report_date: "2026-09-10", analysis_session: "2026-09-11", timing_mode: "SYNTHETIC_BROWSER_FIXTURE" },
  counts: { displayed: 1, sourceRows: 221, computable: 221, matched: 4, priceCovered: 1 }, rows: [row],
};

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("console", message => {
      if (message.type() === "error" && !message.text().includes("WebSocket connection to") && !message.text().includes("/v1/stream")) errors.push(message.text());
    });
    await page.route("**/auth/session", route => route.fulfill({ json: { authenticated: true, csrfToken: "synthetic", user: { uid: "browser-test", email: "browser@example.test", displayName: "Browser Test", role: "admin" } } }));
    await page.route("**/v1/futures-volatility/screener?**", route => route.fulfill({ json: fixture }));
    const quote = { symbol: "NIFTY50", name: "NIFTY 50", last: 0, change: 0, changePct: 0 };
    await page.route("**/v1/overview/header", route => route.fulfill({ json: { asOf: "2026-09-11T12:00:00Z", market: { isOpen: false, label: "CLOSED" }, indices: { nifty50: quote, bankNifty: { ...quote, symbol: "BANKNIFTY", name: "BANK NIFTY" }, indiaVix: { ...quote, symbol: "INDIAVIX", name: "INDIA VIX" } }, tickerTape: [] } }));
    await page.route("**/v1/paper/notifications?**", route => route.fulfill({ json: { asOf: "2026-09-11T12:00:00Z", source: "paper_trading.trade_events", items: [] } }));
    const response = await page.goto(`${baseUrl}/futures/volatility`, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`candidate route returned ${response?.status()}`);
    await page.getByRole("heading", { name: "Futures Volatility Screener" }).waitFor();
    await page.getByText("SYNTHPASS", { exact: false }).first().waitFor();
    if (await page.getByText("1.2048", { exact: true }).count() === 0) throw new Error("exact delta display missing");
    if (await page.getByText("All 16 physical source fields", { exact: true }).count() === 0) throw new Error("raw-field inspector missing");
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    if (viewport.name === "mobile" && overflow) throw new Error("mobile page has accidental horizontal overflow");
    if (errors.length) throw new Error(`console errors: ${errors.join(" | ")}`);
    await context.close();
  }
  console.log(JSON.stringify({ status: "PASS", fixture: "SYNTHETIC", viewports: ["1440x900", "390x844"], outputDir }, null, 2));
} finally {
  await browser.close();
}
