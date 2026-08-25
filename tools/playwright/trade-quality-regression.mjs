import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:19090/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/trade-quality");
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${baseUrl}/auth/session/dev-login`, {
    data: { identifier: "admin", password },
  });
  if (!login.ok()) throw new Error(`admin login failed: ${login.status()}`);
  const sessionCookies = await context.cookies();
  if (!sessionCookies.length) {
    const setCookie = login.headersArray().find((header) => header.name.toLowerCase() === "set-cookie")?.value;
    const pair = setCookie?.split(";", 1)[0];
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator < 1) throw new Error("admin login did not establish a session cookie");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
  } else if (baseUrl.startsWith("http://127.0.0.1")) {
    await context.clearCookies();
    await context.addCookies(sessionCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: cookie.httpOnly,
      secure: false,
      sameSite: cookie.sameSite,
    })));
  }

  const policyResponse = await context.request.get(`${baseUrl}/v1/trade-quality/policy`);
  if (!policyResponse.ok()) throw new Error(`trade-quality policy failed: ${policyResponse.status()}`);
  const policy = await policyResponse.json();
  if (policy.version !== "1.1.0") throw new Error(`unexpected policy version: ${policy.version}`);
  if (policy.cash.processMaximum !== 55 || policy.cash.outcomeMaximum !== 45) throw new Error("cash weights do not total 55 / 45");
  if (policy.options.processMaximum !== 60 || policy.options.outcomeMaximum !== 40) throw new Error("options weights do not total 60 / 40");
  if (policy.cash.hardFails.length !== 12 || policy.options.hardFails.length !== 16) throw new Error("hard-risk governance catalogue is incomplete");

  const workspaceResponse = await context.request.get(`${baseUrl}/v1/workspace/paper-trading`);
  if (!workspaceResponse.ok()) throw new Error(`paper workspace failed: ${workspaceResponse.status()}`);
  const workspace = await workspaceResponse.json();
  const trades = workspace.stockTrades ?? [];
  if (!trades.length) throw new Error("paper workspace returned no trades");
  for (const trade of trades) {
    if (!trade.trade_quality) throw new Error(`${trade.symbol}: trade_quality is missing`);
    if (trade.trade_quality.totalScore == null) throw new Error(`${trade.symbol}: automatic point-in-time score is missing`);
    if (trade.trade_quality.process.coveragePct < 80) throw new Error(`${trade.symbol}: process evidence coverage is below 80%`);
    if (!trade.trade_quality.scoreBasis) throw new Error(`${trade.symbol}: score basis is missing`);
    if (trade.stop_loss_limit !== 6000 || trade.stop_loss_scenario_pnl == null) throw new Error(`${trade.symbol}: ₹6,000 stop-loss simulation is missing`);
    const fiveCompleted = (trade.horizons ?? []).some((horizon) => Number(horizon.horizon_sessions) === 5 && horizon.status === "COMPLETED");
    if (!fiveCompleted && Number(trade.sessions_observed ?? 0) <= 5 && Math.abs(Number(trade.horizon_5d_snapshot_pnl) - Number(trade.horizon_30d_snapshot_pnl)) > 0.01)
      throw new Error(`${trade.symbol}: developing 5D and inclusive 30D snapshots diverge before 5D maturity`);
  }
  const completedEodTrades = trades.filter((trade) => trade.intraday_eod_complete === true);
  if (!completedEodTrades.length) throw new Error("no trade has a canonical 15:30 entry-session mark");
  if (completedEodTrades.some((trade) => trade.intraday_eod_pnl == null || trade.intraday_max_profit == null || trade.intraday_max_drawdown == null))
    throw new Error("completed D0 evidence is missing P/L or extrema");
  const total = (rows, field) => rows.reduce((sum, trade) => sum + Number(trade[field] ?? 0), 0);
  const intradayClosedTrades = trades.filter((trade) => trade.closed_in_intraday === true);
  const swingPathTrades = trades.filter((trade) => trade.closed_in_intraday !== true);
  const rollup = {
    eodPnl: total(completedEodTrades, "intraday_eod_pnl"),
    d0MaxProfit: total(trades, "intraday_max_profit"),
    d0MaxDrawdown: total(trades, "intraday_max_drawdown"),
    intradayBooked: total(intradayClosedTrades, "realised_net_pnl"),
    swingRealised: total(swingPathTrades.filter((trade) => Number(trade.remaining_quantity) <= 0), "realised_net_pnl"),
    swingOpenGross: total(swingPathTrades.filter((trade) => Number(trade.remaining_quantity) > 0), "open_unrealised_gross_pnl"),
    neverClosedCarry: total(trades, "hypothetical_carry_pnl"),
  };
  const csrfRejected = await context.request.post(`${baseUrl}/v1/workspace/paper-trading/trades/${trades[0].trade_group_id}/quality-review`, {
    data: { ratings: {}, hardFailFlags: [], entryEvidenceConfirmed: false, evidenceNote: "CSRF negative contract test only" },
  });
  if (csrfRejected.status() !== 403) throw new Error(`quality review without CSRF should be rejected; got ${csrfRejected.status()}`);

  const page = await context.newPage();
  const consoleErrors = [];
  const knownAnalyticsWarnings = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if ((/https:\/\/[a-z]\.clarity\.ms\/collect/.test(message.text()) && message.text().includes("Content Security Policy"))
      || message.text() === "Failed to load resource: net::ERR_NETWORK_CHANGED") {
      knownAnalyticsWarnings.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });
  const response = await page.goto(`${baseUrl}/paper-trading?tab=quality`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!response?.ok()) throw new Error(`paper route failed: ${response?.status()}`);
  await page.getByRole("button", { name: "What good looks like" }).click();
  await page.getByRole("heading", { name: "A good result is not automatically a good trade." }).waitFor();
  await page.getByRole("heading", { name: "Trade-quality register" }).waitFor();
  await page.getByRole("button", { name: /^All ·/ }).waitFor();
  await page.getByRole("button", { name: /^Good ·/ }).waitFor();
  await page.getByRole("button", { name: /^Developing ·/ }).waitFor();
  await page.getByRole("button", { name: /^Needs attention ·/ }).waitFor();
  const qualityRows = page.locator('section[aria-labelledby="all-trade-quality-title"] tbody tr[data-grade]');
  const matrixPoints = page.locator('[class*="qualityMatrixChart"] button[class*="matrixPoint"]');
  const expected30Day = trades.filter((trade) => trade.opened_at && new Date(trade.opened_at).getTime() >= Date.now() - 30 * 86_400_000).length;
  if (await qualityRows.count() !== expected30Day) throw new Error(`expected ${expected30Day} rows in the default 30-day register`);
  if (await matrixPoints.count() !== expected30Day) throw new Error(`expected ${expected30Day} points in the default 30-day matrix`);
  const expectedGood = trades.filter((trade) => trade.opened_at && new Date(trade.opened_at).getTime() >= Date.now() - 30 * 86_400_000 && String(trade.trade_quality?.label ?? "").startsWith("GOOD_")).length;
  await page.getByRole("button", { name: /^Good ·/ }).click();
  if (await qualityRows.count() !== expectedGood) throw new Error(`good filter expected ${expectedGood} rows`);
  if (await matrixPoints.count() !== expectedGood) throw new Error(`good filter expected ${expectedGood} matrix points`);
  await page.getByRole("button", { name: /^All ·/ }).click();
  const searchSymbol = String(trades[0].symbol);
  const expectedSymbolMatches = trades.filter((trade) => trade.opened_at && new Date(trade.opened_at).getTime() >= Date.now() - 30 * 86_400_000 && String(trade.symbol).toLowerCase().includes(searchSymbol.toLowerCase())).length;
  await page.getByLabel("Find trade").fill(searchSymbol);
  if (await qualityRows.count() !== expectedSymbolMatches) throw new Error(`symbol filter expected ${expectedSymbolMatches} rows`);
  if (await matrixPoints.count() !== expectedSymbolMatches) throw new Error(`symbol filter expected ${expectedSymbolMatches} matrix points`);
  await page.getByLabel("Find trade").fill("");
  await page.getByRole("button", { name: "All history" }).click();
  if (await qualityRows.count() !== trades.length) throw new Error(`all-history filter expected ${trades.length} rows`);
  if (await matrixPoints.count() !== trades.length) throw new Error(`all-history filter expected ${trades.length} matrix points`);
  await page.getByRole("button", { name: "Last 30 days" }).click();
  if (expected30Day > 1) {
    const targetPoint = matrixPoints.nth(1);
    const targetLabel = await targetPoint.textContent();
    await targetPoint.evaluate((element) => element.click());
    await page.getByRole("heading", { name: new RegExp(`^${targetLabel?.trim()} · Trade Quality Matrix$`) }).waitFor();
    if (await targetPoint.getAttribute("data-selected") !== "true") throw new Error("clicked matrix stock is not marked selected");
    const selectedBackground = await targetPoint.evaluate((element) => getComputedStyle(element).backgroundColor);
    if (selectedBackground !== "rgb(11, 122, 83)") throw new Error(`selected matrix stock is not green: ${selectedBackground}`);
  }
  const registerAfterMatrix = await page.evaluate(() => {
    const matrix = document.querySelector('[class*="classificationMatrix"]');
    const register = document.querySelector('section[aria-labelledby="all-trade-quality-title"]');
    return Boolean(matrix && register && (matrix.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  if (!registerAfterMatrix) throw new Error("trade-quality register is not at the bottom after the assessment content");
  await page.getByRole("heading", { name: /Trade Quality Matrix$/ }).waitFor();
  if (await page.getByLabel("Paper trade").count()) throw new Error("legacy paper-trade dropdown is still rendered");
  await page.getByRole("heading", { name: "Available criterion evidence" }).waitFor();
  const criterionRails = page.locator('[class*="qualityCriteriaSummary"] [class*="criterionRatingRail"]');
  if (!await criterionRails.count()) throw new Error("criterion C01-C17 rating rails are missing");
  const invalidRatingRail = await page.locator('[class*="qualityCriteriaSummary"] > div[data-status="SCORED"]').evaluateAll((rows) => rows.some((row) => {
    const scoreText = row.querySelector("strong")?.textContent ?? "";
    const rating = Number(scoreText.split("/")[0]);
    const rail = row.querySelector('[class*="criterionRatingRail"] > span');
    if (!Number.isFinite(rating) || !rail) return true;
    return Math.abs(parseFloat(getComputedStyle(rail).width) / parseFloat(getComputedStyle(rail.parentElement).width) * 100 - rating / 5 * 100) > 1;
  }));
  if (invalidRatingRail) throw new Error("criterion rating rail does not reflect its 0-to-5 score");
  await page.getByRole("heading", { name: "Admin evidence review" }).waitFor();
  await page.getByRole("button", { name: "Save versioned review" }).waitFor();
  await page.getByText("Cash equity · 55 process + 45 outcome", { exact: true }).waitFor();
  await page.getByText("Options · 60 process + 40 outcome", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "paper-trade-quality-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "paper-trade-quality-mobile.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error("trade-quality mobile page has horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("heading", { name: "Reward vs pain map" }).waitFor();
  await page.getByRole("heading", { name: "Complete trade evidence" }).waitFor();
  await page.getByLabel("Paper trade horizon totals").waitFor();
  await page.getByRole("heading", { name: "Paper performance heatmap" }).waitFor();
  const observedRewardCard = page.getByText("Observed reward / pain", { exact: true }).locator("..");
  const expectedMaxProfit = trades.reduce((sum, trade) => sum + Number(trade.entry_notional) * Math.max(0, Number(trade.mfe_30d_pct)) / 100, 0);
  if (expectedMaxProfit <= 0) throw new Error("fixture has no maximum profit to reconcile");
  if (!String(await observedRewardCard.textContent()).includes("Maximum profit to date")) throw new Error("maximum-profit rollup is missing");
  const intradayBookedCard = page.getByText("Intraday booked", { exact: true }).locator("..");
  if (String(await intradayBookedCard.textContent()).includes("Open unrealised")) throw new Error("intraday rollup still misclassifies open unrealised P/L");
  const stopLossCard = page.getByText("₹6,000 stop simulation", { exact: true }).locator("..");
  if (!String(await stopLossCard.textContent()).includes("First-breach gross result")) throw new Error("₹6,000 stop-loss KPI is missing its simulation basis");
  const thirtyDayCard = page.getByText("30-day inclusive path", { exact: true }).locator("..");
  if (!String(await thirtyDayCard.textContent()).includes("Current D0–D30 total")) throw new Error("30D KPI is not presented as an inclusive current path");
  const monthLabels = page.locator('[class*="yearMonthLabels"] span');
  if (await monthLabels.count() < 12) throw new Error("year calendar does not expose month labels across the rolling year");
  const monthLabelValues = await monthLabels.allTextContents();
  if (monthLabelValues.some((label) => !/^[A-Z][a-z]{2,3}$/.test(label.trim()))) throw new Error(`year calendar month labels are not concise month names: ${JSON.stringify(monthLabelValues)}`);
  if (await page.locator('[class*="yearWeekdayLabels"] span').count() !== 7) throw new Error("year calendar does not expose all seven weekday labels");
  const yearWidth = await page.locator('[class*="yearHeatmap"][role="grid"]').evaluate((element) => ({ grid: element.getBoundingClientRect().width, parent: element.parentElement?.getBoundingClientRect().width ?? 0 }));
  if (!yearWidth.parent || yearWidth.grid / yearWidth.parent < 0.9) throw new Error(`year calendar does not use the available width: ${yearWidth.grid}/${yearWidth.parent}`);
  await page.getByRole("button", { name: "Current week" }).click();
  await page.getByText(/trading week/).waitFor();
  if (await page.locator('[class*="weekDayHeader"]').count() !== 5) throw new Error("weekly chart does not expose five trading-day columns");
  if (await page.locator('[class*="weekHeatCell"]').count() !== 20) throw new Error("weekly chart is not a four-metric by five-day heatmap");
  await page.screenshot({ path: path.join(outputDir, "paper-performance-week.png"), fullPage: true });
  await page.getByRole("button", { name: "Intraday events" }).click();
  await page.getByRole("button", { name: "15:30 EOD", exact: true }).click();
  if (await page.locator('[class*="intradayTimeHeader"]').count() !== 14) throw new Error("intraday chart does not expose the complete 09:15-15:30 time axis");
  if (!await page.locator('[class*="intradayStockRow"]').count()) throw new Error("intraday chart has no stock rows");
  if (!await page.locator('[class*="intradayHeatCell"][data-event-kind="eod"]').count()) throw new Error("intraday heatmap has no 15:30 EOD cells");
  await page.screenshot({ path: path.join(outputDir, "paper-performance-intraday-eod.png"), fullPage: true });
  await page.getByRole("button", { name: "Year" }).click();
  if (await page.locator('[class*="yearHeatCell"][data-has-trades="true"]').count() < 1) throw new Error("year heatmap has no populated trade day");
  for (const heading of ["Intraday +0.3%", "Intraday +0.4%", "Intraday +0.5%", "Intraday +1.0%", "Swing +1%", "Swing +3%", "Swing +5%", "Horizon 5D", "Horizon 30D"]) {
    await page.getByRole("columnheader", { name: heading }).waitFor();
  }
  await page.getByRole("columnheader", { name: "Time since entry" }).waitFor();
  await page.getByRole("columnheader", { name: "D0 15:30 P/L" }).waitFor();
  await page.getByRole("columnheader", { name: "Maximum profit" }).waitFor();
  await page.getByRole("columnheader", { name: "Maximum drawdown" }).waitFor();
  await page.getByRole("columnheader", { name: "Never-closed carry" }).waitFor();
  const evidenceRows = page.locator('[class*="unifiedTable"] tbody tr[data-target-result]');
  if (await evidenceRows.count() !== trades.length) throw new Error(`complete evidence expected ${trades.length} rows`);
  const targetCells = page.locator('[class*="unifiedTable"] tbody td[data-target-state]');
  if (await targetCells.count() !== trades.length * 7) throw new Error("complete evidence does not render seven target cells per trade");
  const tintedRows = await evidenceRows.evaluateAll((rows) => rows.every((row) => Boolean(row.style.getPropertyValue("--target-row-tint")) && Boolean(row.style.getPropertyValue("--target-row-edge"))));
  if (!tintedRows) throw new Error("trade rows do not expose the hit-to-miss colour scale");
  const cachedCarryCount = trades.filter((trade) => trade.hypothetical_carry_mark_source === "SMARTAPI_QUOTE_CACHE").length;
  if (!cachedCarryCount) throw new Error("no paper trade uses the canonical SmartAPI carry mark");
  if (trades.some((trade) => trade.hypothetical_carry_pnl == null)) throw new Error("one or more paper trades has no hypothetical never-closed P&L");
  const scoredBubbles = await page.locator("svg circle[data-grade]").count();
  if (scoredBubbles !== trades.length) throw new Error(`expected ${trades.length} scored atlas bubbles, got ${scoredBubbles}`);
  const qualityBubbleLabels = await page.locator("svg text").filter({ hasText: /^\d{1,3}$/ }).count();
  if (!qualityBubbleLabels) throw new Error("reward/pain atlas has no visible quality percentages");
  await page.screenshot({ path: path.join(outputDir, "paper-complete-evidence-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileEvidenceCards = page.locator('[class*="tradeCards"] > button');
  if (await mobileEvidenceCards.count() !== trades.length) throw new Error(`mobile complete evidence expected ${trades.length} cards`);
  const mobileTargetCells = page.locator('[class*="mobileTargetGrid"] > span');
  if (await mobileTargetCells.count() !== trades.length * 9) throw new Error("mobile cards do not expose seven targets and two horizons");
  const portfolioOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (portfolioOverflow) throw new Error("paper portfolio mobile page has horizontal overflow");
  await page.screenshot({ path: path.join(outputDir, "paper-complete-evidence-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const backtestResponse = await page.goto(`${baseUrl}/backtesting/results`, { waitUntil: "networkidle", timeout: 60_000 });
  if (!backtestResponse?.ok()) throw new Error(`backtesting results route failed: ${backtestResponse?.status()}`);
  await page.getByRole("columnheader", { name: "Trade quality" }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "backtesting-trade-quality-desktop.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    status: "PASS",
    policyVersion: policy.version,
    trades: trades.length,
    automaticallyScoredTrades: trades.filter((trade) => trade.trade_quality.totalScore != null).length,
    scoredAtlasBubbles: scoredBubbles,
    rewardPainScreenshot: path.join(outputDir, "paper-complete-evidence-desktop.png"),
    completeEvidenceDesktop: path.join(outputDir, "paper-complete-evidence-desktop.png"),
    completeEvidenceMobile: path.join(outputDir, "paper-complete-evidence-mobile.png"),
    canonicalCarryMarks: cachedCarryCount,
    completedEodTrades: completedEodTrades.length,
    maximumProfitRollup: expectedMaxProfit,
    rollup,
    performanceHeatmap: true,
    weekHeatmapScreenshot: path.join(outputDir, "paper-performance-week.png"),
    intradayEodScreenshot: path.join(outputDir, "paper-performance-intraday-eod.png"),
    matrixRendered: true,
    durableAdminReviewRendered: true,
    csrfNegativeTest: "PASS",
    knownAnalyticsConsoleWarnings: knownAnalyticsWarnings.length,
    desktopScreenshot: path.join(outputDir, "paper-trade-quality-desktop.png"),
    mobileScreenshot: path.join(outputDir, "paper-trade-quality-mobile.png"),
    backtestingScreenshot: path.join(outputDir, "backtesting-trade-quality-desktop.png"),
  }, null, 2));
} finally {
  await browser.close();
}
