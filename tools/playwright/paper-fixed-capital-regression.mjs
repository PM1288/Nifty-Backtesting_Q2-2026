import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "https://n50.nifty50today.co.in/n50").replace(/\/$/, "");
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!password) throw new Error("PLAYWRIGHT_ADMIN_PASSWORD is required");
const outputDir = path.resolve(process.env.PLAYWRIGHT_OUTPUT_DIR ?? "output/playwright/paper-fixed-capital");
await fs.mkdir(outputDir, { recursive: true });

const closeEnough = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.02;
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
  const comparisons = payload.fixedCapitalPortfolioStrategyComparisons ?? [];
  const swingComparisons = payload.fixedCapitalSwingOnlyStrategyComparisons ?? [];
  if (!comparisons.length) throw new Error("paper workspace returned no entry-strategy comparisons");
  if (swingComparisons.length !== comparisons.length) throw new Error("swing-only entry-strategy comparisons do not match the first-hit strategy set");
  const strategyByTrade = new Map((payload.stockTrades ?? []).map((trade) => [String(trade.trade_group_id), String(trade.entry_strategy ?? "UNSPECIFIED").toUpperCase()]));
  for (const comparison of [...comparisons, ...swingComparisons]) {
    for (const scenario of comparison.scenarios ?? []) {
      const swingOnly = String(scenario.exitPolicy) === "SWING_ONLY";
      for (const position of scenario.positions ?? []) {
        if (strategyByTrade.get(String(position.tradeGroupId)) !== String(comparison.entryStrategy)) {
          throw new Error(`${comparison.entryStrategy}: inter-strategy position ${position.tradeGroupId} detected`);
        }
        if (swingOnly && String(position.exitReason).startsWith("INTRADAY")) throw new Error(`${comparison.entryStrategy}: swing-only scenario used an intraday exit`);
      }
    }
  }
  const scenarios = payload.fixedCapitalPortfolioScenarios ?? [];
  const expected = [
    [100000, 10],
    [200000, 5],
    [500000, 2],
    [1000000, 1],
  ];
  if (scenarios.length !== expected.length) throw new Error(`expected four scenarios, received ${scenarios.length}`);
  scenarios.forEach((scenario, index) => {
    const [allocation, slots] = expected[index];
    if (Number(scenario.allocationPerTrade) !== allocation || Number(scenario.maximumConcurrentSlots) !== slots) {
      throw new Error(`${scenario.id}: allocation/slot contract mismatch`);
    }
    if (Number(scenario.tradesTaken) !== (scenario.positions ?? []).length) throw new Error(`${scenario.id}: trade/position count mismatch`);
    if (!closeEnough(Number(scenario.endingEquity) - Number(scenario.startingCash), scenario.totalGrossPnl)) {
      throw new Error(`${scenario.id}: ending-equity P&L reconciliation mismatch`);
    }
    if (!closeEnough(Number(scenario.realisedGrossPnl) + Number(scenario.openMarkedGrossPnl), scenario.totalGrossPnl)) {
      throw new Error(`${scenario.id}: realised/open P&L reconciliation mismatch`);
    }
    if (Number(scenario.maximumConcurrentUsed) > slots) throw new Error(`${scenario.id}: slot limit exceeded`);
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const ignoredExternal = /(?:static\.cloudflareinsights\.com|clarity\.ms|ERR_BLOCKED_BY_CLIENT|ERR_NETWORK_CHANGED)/;
  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredExternal.test(message.text())) consoleErrors.push(message.text());
  });
  const route = await page.goto(`${baseUrl}/paper-trading`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!route?.ok()) throw new Error(`paper route failed: ${route?.status()}`);
  await page.getByRole("heading", { name: "₹10 lakh capital recycling simulation" }).waitFor({ timeout: 120_000 });
  await page.getByRole("heading", { name: "Swing-only ₹10 lakh capital recycling" }).waitFor({ timeout: 120_000 });
  const firstHitPanel = page.locator('[data-capital-policy="FIRST_GOVERNED"]');
  const swingPanel = page.locator('[data-capital-policy="SWING_ONLY"]');
  const strategyTabs = firstHitPanel.locator('[aria-label="Paper entry strategy"] [role="tab"]');
  if (await strategyTabs.count() !== comparisons.length) throw new Error("entry-strategy tabs do not match API comparisons");
  const activeComparison = comparisons[Math.min(1, comparisons.length - 1)];
  await strategyTabs.nth(Math.min(1, comparisons.length - 1)).click();
  const tabs = firstHitPanel.getByRole("tab", { name: /\/ trade/ });
  if (await tabs.count() !== 4) throw new Error("all four allocation tabs are not visible");
  await tabs.filter({ hasText: "₹5,00,000" }).click();
  const fiveLakh = activeComparison.scenarios.find((scenario) => Number(scenario.allocationPerTrade) === 500000);
  const ganttRows = firstHitPanel.locator('[class*="capitalGanttRow"]');
  if (await ganttRows.count() !== Number(fiveLakh?.positions?.length ?? 0)) throw new Error("Gantt rows do not match selected scenario positions");
  const swingStrategyTabs = swingPanel.locator('[aria-label="Swing-only paper entry strategy"] [role="tab"]');
  if (await swingStrategyTabs.count() !== swingComparisons.length) throw new Error("swing-only entry-strategy tabs do not match API comparisons");
  await swingStrategyTabs.nth(Math.min(1, swingComparisons.length - 1)).click();
  const swingAllocationTabs = swingPanel.getByRole("tab", { name: /\/ trade/ });
  if (await swingAllocationTabs.count() !== 4) throw new Error("all four swing-only allocation tabs are not visible");
  await swingAllocationTabs.filter({ hasText: "₹5,00,000" }).click();
  const swingFiveLakh = swingComparisons[Math.min(1, swingComparisons.length - 1)].scenarios.find((scenario) => Number(scenario.allocationPerTrade) === 500000);
  if (await swingPanel.locator('[class*="capitalGanttRow"]').count() !== Number(swingFiveLakh?.positions?.length ?? 0)) throw new Error("swing-only Gantt rows do not match selected scenario positions");
  await firstHitPanel.getByText("Trades till date", { exact: true }).waitFor();
  await firstHitPanel.screenshot({ path: path.join(outputDir, "paper-fixed-capital-widget-desktop.png") });
  await swingPanel.screenshot({ path: path.join(outputDir, "paper-swing-capital-widget-desktop.png") });
  await page.screenshot({ path: path.join(outputDir, "paper-fixed-capital-desktop-1920x1080.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "₹10 lakh capital recycling simulation" }).waitFor({ timeout: 120_000 });
  await page.locator('[data-capital-policy="SWING_ONLY"] [aria-label="Swing-only paper entry strategy"] [role="tab"]').last().click();
  await page.locator('[data-capital-policy="SWING_ONLY"]').getByRole("tab", { name: /₹10,00,000 \/ trade/ }).click();
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (bodyOverflow) throw new Error("mobile page has horizontal body overflow");
  await page.locator('[data-capital-policy="FIRST_GOVERNED"]').screenshot({ path: path.join(outputDir, "paper-fixed-capital-widget-mobile.png") });
  await page.locator('[data-capital-policy="SWING_ONLY"]').screenshot({ path: path.join(outputDir, "paper-swing-capital-widget-mobile.png") });
  await page.screenshot({ path: path.join(outputDir, "paper-fixed-capital-mobile-390x844.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);

  console.log(JSON.stringify({
    status: "PASS",
    sourceTrades: payload.stockTrades?.length ?? 0,
    entryStrategies: comparisons.map((comparison) => ({ entryStrategy: comparison.entryStrategy, sourceTradeCount: comparison.sourceTradeCount })),
    strategyResults: comparisons.map((comparison) => ({
      entryStrategy: comparison.entryStrategy,
      scenarios: comparison.scenarios.map((scenario) => ({
        allocationPerTrade: scenario.allocationPerTrade,
        tradesTaken: scenario.tradesTaken,
        closedTargetTrades: scenario.closedTargetTrades,
        openTrades: scenario.openTrades,
        endingEquity: scenario.endingEquity,
        totalGrossPnl: scenario.totalGrossPnl,
        maxEventDrawdown: scenario.maxEventDrawdown,
      })),
    })),
    swingOnlyStrategyResults: swingComparisons.map((comparison) => ({
      entryStrategy: comparison.entryStrategy,
      scenarios: comparison.scenarios.map((scenario) => ({
        allocationPerTrade: scenario.allocationPerTrade,
        tradesTaken: scenario.tradesTaken,
        closedTargetTrades: scenario.closedTargetTrades,
        openTrades: scenario.openTrades,
        endingEquity: scenario.endingEquity,
        totalGrossPnl: scenario.totalGrossPnl,
        maxEventDrawdown: scenario.maxEventDrawdown,
      })),
    })),
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      allocationPerTrade: scenario.allocationPerTrade,
      maximumConcurrentSlots: scenario.maximumConcurrentSlots,
      tradesTaken: scenario.tradesTaken,
      closedTargetTrades: scenario.closedTargetTrades,
      openTrades: scenario.openTrades,
      endingEquity: scenario.endingEquity,
      totalGrossPnl: scenario.totalGrossPnl,
      maxEventDrawdown: scenario.maxEventDrawdown,
    })),
    desktop: "1920x1080",
    mobile: "390x844",
  }, null, 2));
} finally {
  await browser.close();
}
