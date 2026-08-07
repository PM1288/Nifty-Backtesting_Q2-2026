import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import path from "node:path";
import { serveSnapshotRoute } from "../lib/dashboardSnapshots";
import {
  loadPublishedBacktestingCompare,
  loadPublishedBacktestingDailySummary,
  loadPublishedBacktestingOverview,
  loadPublishedBacktestingRuns,
  loadPublishedBacktestingStrategies,
  loadPublishedBacktestingStrategyDetail
} from "../lib/backtestingPublished";
import {
  DEFAULT_BACKTEST_STRATEGY_ID,
  getBacktestingRegistry
} from "../lib/backtestingRegistry";

type ScenarioSeed = {
  key: string;
  universeMode: "single_stock" | "nifty_100";
  capitalMode: "no_capital_limit" | "capital_16l" | "capital_10l" | "capital_20l" | "capital_50l";
  stock: string | null;
  label: string;
  startValue: number;
  finalValue: number;
  fdFinalValue: number | null;
  winRatePct: number;
  maxDrawdownPct: number;
  totalCharges: number;
  openPositions: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalReturnPct: number;
  avgHoldDays: number;
  maxHoldDays: number;
  benchmarkMode: "finite_fd" | "normalized_fd" | "nifty50_price";
};

const SNAPSHOT_META = {
  marketDate: "2026-03-11",
  generatedAt: "2026-03-11T05:18:00.000Z",
  snapshotAgeLabel: "12 minutes"
} as const;

const CHARGES_MODEL = {
  brokerage_delivery_equity: 0,
  stt_delivery_rate: 0.1,
  transaction_charge_rate_nse_equity_cash: 0.00307,
  sebi_charge_per_crore: 10,
  gst_rate: 18,
  stamp_duty_buy_rate_delivery: 0.015,
  dp_charge_sell_order_total: 15.34
} as const;

function seededFallbackEnabled() {
  return process.env.BACKTESTING_ALLOW_SEEDED_FALLBACK === "1";
}

function publishedSnapshotRequiredError() {
  return {
    status: 503,
    code: "BACKTESTING_SNAPSHOT_UNAVAILABLE",
    message:
      "Published backtesting snapshots are unavailable. Run the backtesting precompute publish before serving this module, or opt into seeded fallback explicitly for local development."
  };
}

const SCENARIO_SEEDS: ScenarioSeed[] = [
  {
    key: "nifty_100:capital_16l",
    universeMode: "nifty_100",
    capitalMode: "capital_16l",
    stock: null,
    label: "Nifty 100 • ₹16L / ₹2L tickets / max 8",
    startValue: 1600000,
    finalValue: 1968800,
    fdFinalValue: 1874000,
    winRatePct: 61.8,
    maxDrawdownPct: -9.2,
    totalCharges: 33120,
    openPositions: 6,
    realizedPnl: 312000,
    unrealizedPnl: 56800,
    totalReturnPct: 23.05,
    avgHoldDays: 12.3,
    maxHoldDays: 49,
    benchmarkMode: "nifty50_price"
  },
  {
    key: "nifty_100:capital_10l",
    universeMode: "nifty_100",
    capitalMode: "capital_10l",
    stock: null,
    label: "Nifty 100 • 10L",
    startValue: 1000000,
    finalValue: 1354600,
    fdFinalValue: 1198400,
    winRatePct: 63.4,
    maxDrawdownPct: -8.6,
    totalCharges: 21430,
    openPositions: 7,
    realizedPnl: 288420,
    unrealizedPnl: 66180,
    totalReturnPct: 35.46,
    avgHoldDays: 11.8,
    maxHoldDays: 47,
    benchmarkMode: "finite_fd"
  },
  {
    key: "nifty_100:capital_20l",
    universeMode: "nifty_100",
    capitalMode: "capital_20l",
    stock: null,
    label: "Nifty 100 • 20L",
    startValue: 2000000,
    finalValue: 2728400,
    fdFinalValue: 2396800,
    winRatePct: 63.9,
    maxDrawdownPct: -8.1,
    totalCharges: 39840,
    openPositions: 8,
    realizedPnl: 596400,
    unrealizedPnl: 131960,
    totalReturnPct: 36.42,
    avgHoldDays: 12.1,
    maxHoldDays: 51,
    benchmarkMode: "finite_fd"
  },
  {
    key: "nifty_100:capital_50l",
    universeMode: "nifty_100",
    capitalMode: "capital_50l",
    stock: null,
    label: "Nifty 100 • 50L",
    startValue: 5000000,
    finalValue: 6915000,
    fdFinalValue: 5992000,
    winRatePct: 64.2,
    maxDrawdownPct: -7.7,
    totalCharges: 88720,
    openPositions: 10,
    realizedPnl: 1532800,
    unrealizedPnl: 382200,
    totalReturnPct: 38.3,
    avgHoldDays: 12.4,
    maxHoldDays: 53,
    benchmarkMode: "finite_fd"
  },
  {
    key: "single_stock:no_capital_limit:RELIANCE",
    universeMode: "single_stock",
    capitalMode: "no_capital_limit",
    stock: "RELIANCE",
    label: "RELIANCE • No Capital Limit",
    startValue: 100,
    finalValue: 146.8,
    fdFinalValue: 119.4,
    winRatePct: 61.1,
    maxDrawdownPct: -6.8,
    totalCharges: 8420,
    openPositions: 1,
    realizedPnl: 31.2,
    unrealizedPnl: 15.6,
    totalReturnPct: 46.8,
    avgHoldDays: 9.6,
    maxHoldDays: 34,
    benchmarkMode: "normalized_fd"
  },
  {
    key: "single_stock:capital_10l:RELIANCE",
    universeMode: "single_stock",
    capitalMode: "capital_10l",
    stock: "RELIANCE",
    label: "RELIANCE • 10L",
    startValue: 1000000,
    finalValue: 1289200,
    fdFinalValue: 1198400,
    winRatePct: 60.4,
    maxDrawdownPct: -6.4,
    totalCharges: 12920,
    openPositions: 1,
    realizedPnl: 231400,
    unrealizedPnl: 57800,
    totalReturnPct: 28.92,
    avgHoldDays: 10.4,
    maxHoldDays: 36,
    benchmarkMode: "finite_fd"
  }
];

function isoMonthSeries(seed: ScenarioSeed) {
  const startDate = new Date("2023-03-01T00:00:00.000Z");
  const points: Array<{
    date: string;
    strategyValue: number;
    benchmarkValue: number | null;
    drawdownPct: number;
    deployedCapital: number;
    openPositions: number;
  }> = [];

  let runningPeak = seed.startValue;
  for (let index = 0; index < 37; index += 1) {
    const date = new Date(startDate);
    date.setUTCMonth(startDate.getUTCMonth() + index);
    const progress = index / 36;
    const wobble = Math.sin(index / 2.4) * (seed.startValue * 0.018);
    const drift = seed.startValue + (seed.finalValue - seed.startValue) * progress + wobble;
    const benchmark =
      seed.fdFinalValue == null ? 100 + progress * (seed.fdFinalValue ?? 19.4) : seed.startValue + (seed.fdFinalValue - seed.startValue) * progress;
    runningPeak = Math.max(runningPeak, drift);
    const drawdownPct = runningPeak > 0 ? (((drift - runningPeak) / runningPeak) * 100) : 0;
    points.push({
      date: date.toISOString().slice(0, 10),
      strategyValue: Math.round(drift),
      benchmarkValue: Math.round(benchmark),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      deployedCapital: Math.round(seed.startValue * (0.34 + progress * 0.46 + Math.max(0, Math.sin(index / 3)) * 0.08)),
      openPositions: seed.universeMode === "nifty_100" ? Math.min(10, 2 + (index % 7)) : Math.min(2, 1 + (index % 2))
    });
  }

  return points;
}

function monthlyReturnBars(seed: ScenarioSeed) {
  return isoMonthSeries(seed).slice(-12).map((point, index) => ({
    month: point.date.slice(0, 7),
    pnl: Math.round(((seed.totalReturnPct / 12) * (index % 2 === 0 ? 1.15 : 0.78) / 100) * seed.startValue),
    returnPct: Number((((seed.totalReturnPct / 12) * (index % 2 === 0 ? 1.15 : 0.78))).toFixed(2))
  }));
}

function histogramFromBuckets(seed: ScenarioSeed, type: "returns" | "holding") {
  const source =
    type === "returns"
      ? [
          { bucketLabel: "< -3%", count: 3 },
          { bucketLabel: "-3% to 0%", count: 11 },
          { bucketLabel: "0% to 1.25%", count: 14 },
          { bucketLabel: "1.25% to 2.5%", count: 28 },
          { bucketLabel: "> 2.5%", count: 9 }
        ]
      : [
          { bucketLabel: "1-5d", count: 8 },
          { bucketLabel: "6-10d", count: 17 },
          { bucketLabel: "11-20d", count: 22 },
          { bucketLabel: "21-30d", count: 10 },
          { bucketLabel: "31d+", count: 4 }
        ];
  return source.map((bucket, index) => ({
    ...bucket,
    count: bucket.count + (seed.universeMode === "nifty_100" ? index : 0)
  }));
}

function buildOpenPositions(seed: ScenarioSeed) {
  const baseRows = [
    ["RELIANCE", "2026-03-05", 121, 1348.4, 1365.2, 2.25, "Rising"],
    ["INFY", "2026-03-06", 92, 1492.3, 1507.1, 0.99, "Neutral"],
    ["HDFCBANK", "2026-03-10", 81, 1678.2, 1688.0, 0.58, "Shock"],
    ["TCS", "2026-03-07", 54, 4022.1, 4051.0, 0.72, "Volatile"]
  ];
  return baseRows.slice(0, seed.openPositions).map(([symbol, entryDate, quantity, entryPrice, markPrice, unrealizedPct, regime], index) => ({
    symbol,
    entryDate,
    quantity: Number(quantity),
    entryPrice: Number(entryPrice),
    markPrice: Number(markPrice),
    unrealizedPct: Number(unrealizedPct),
    unrealizedPnl: Math.round(Number(quantity) * (Number(markPrice) - Number(entryPrice))),
    regimeOnEntry: regime,
    stopStatus: index % 2 === 0 ? "On plan" : "Watch closely"
  }));
}

function buildTrades(seed: ScenarioSeed) {
  return [
    ["RELIANCE", "2026-02-25", "2026-03-03", "target_intraday_hit", 1.25, 1180, 9],
    ["INFY", "2026-02-19", "2026-02-28", "target_gap_open", 1.87, 960, 7],
    ["TCS", "2026-02-12", "2026-02-20", "target_intraday_hit", 1.25, 1120, 6],
    ["HDFCBANK", "2026-01-31", "2026-02-18", "target_intraday_hit", 1.25, 880, 12],
    ["SUNPHARMA", "2026-01-20", null, "open", 0.64, 620, 16]
  ].map(([symbol, signalDate, exitDate, exitReason, returnPct, charges, holdDays], index) => ({
    symbol,
    signalDate,
    entryDate: new Date(new Date(String(signalDate)).getTime() + 86400000).toISOString().slice(0, 10),
    exitDate,
    exitReason,
    returnPct: Number(returnPct) + (seed.universeMode === "nifty_100" ? index * 0.04 : 0),
    charges: Number(charges) + (seed.capitalMode === "capital_50l" ? index * 120 : index * 40),
    holdingDays: Number(holdDays),
    regimeOnEntry: ["Shock", "Volatile", "Rising", "Neutral", "Rising"][index],
    status: exitDate ? "closed" : "open"
  }));
}

function buildSkippedSignals(seed: ScenarioSeed) {
  return [
    { date: "2026-03-11", symbol: "SBIN", reason: "skipped_due_to_existing_position", detail: "Existing open ticket still active." },
    { date: "2026-03-11", symbol: "BAJFINANCE", reason: "skipped_due_to_ticket_too_small", detail: "Fixed ticket size could not buy one full share." },
    { date: "2026-03-10", symbol: "LT", reason: "skipped_due_to_cash_constraint", detail: "Finite cash bucket fully deployed on the same date." }
  ].filter((row) => seed.capitalMode !== "no_capital_limit" || row.reason !== "skipped_due_to_cash_constraint");
}

function buildRegimeBreakdown(seed: ScenarioSeed) {
  return [
    ["Rising", 31, 68.2, 1.41, 1.28, 8.8, 11.1, 6820],
    ["Neutral", 22, 59.1, 0.88, 0.75, 6.4, 10.2, 5410],
    ["Volatile", 19, 55.3, 0.64, 0.52, 7.9, 9.4, 4870],
    ["Shock", 11, 47.8, 0.12, 0.08, 5.1, 7.1, 2920],
    ["Falling", 14, 42.6, -0.34, -0.28, 9.7, 13.6, 3510]
  ].map(([regime, tradeCount, winRatePct, avgReturnPct, medianReturnPct, maxDrawdownContributionPct, avgHoldDays, totalCharges], index) => ({
    regime,
    tradeCount: Number(tradeCount) + (seed.universeMode === "nifty_100" ? index : 0),
    winRatePct: Number(winRatePct),
    avgReturnPct: Number(avgReturnPct),
    medianReturnPct: Number(medianReturnPct),
    maxDrawdownContributionPct: Number(maxDrawdownContributionPct),
    avgHoldDays: Number(avgHoldDays),
    totalCharges: Number(totalCharges) + (seed.capitalMode === "capital_50l" ? index * 800 : index * 160)
  }));
}

function buildStockBreakdown(seed: ScenarioSeed) {
  const rows = [
    ["RELIANCE", 12, 10, 2, 70.0, 1.52, 1.33, 4.2, -2.1, 10.4, 31, 842000, 885600, 27800, 15800, "2026-03-10", true],
    ["INFY", 10, 8, 2, 62.5, 1.08, 1.02, 3.4, -1.8, 9.2, 24, 764000, 801500, 22400, 12100, "2026-03-08", false],
    ["HDFCBANK", 9, 7, 2, 57.1, 0.84, 0.72, 2.8, -2.5, 12.1, 36, 698000, 721200, 14900, 11140, "2026-03-11", true],
    ["TCS", 7, 5, 2, 60.0, 0.93, 0.88, 2.5, -1.6, 8.6, 18, 583000, 612400, 19300, 9340, "2026-03-07", false]
  ];
  const result = seed.universeMode === "single_stock" ? rows.slice(0, 1) : rows;
  return result.map((row) => ({
    symbol: String(row[0]),
    signalCount: Number(row[1]),
    acceptedTrades: Number(row[2]),
    skippedTrades: Number(row[3]),
    winRatePct: Number(row[4]),
    avgReturnPct: Number(row[5]),
    medianReturnPct: Number(row[6]),
    maxGainPct: Number(row[7]),
    maxLossPct: Number(row[8]),
    avgHoldDays: Number(row[9]),
    maxHoldDays: Number(row[10]),
    totalInvested: Number(row[11]),
    currentValue: Number(row[12]),
    realizedPnl: Number(row[13]),
    unrealizedPnl: Number(row[14]),
    charges: Number(row[15]),
    lastSignalDate: String(row[16]),
    openPosition: Boolean(row[17])
  }));
}

function buildPriceIndicatorChart(seed: ScenarioSeed) {
  if (seed.universeMode !== "single_stock" || !seed.stock) return null;
  const startDate = new Date("2026-01-02T00:00:00.000Z");
  const points = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const price = 1210 + Math.sin(index / 2.8) * 38 + index * 2.8;
    return {
      date: date.toISOString().slice(0, 10),
      price: Number(price.toFixed(2)),
      rsi: Number((29 + Math.sin(index / 3.2) * 16).toFixed(2)),
      willr: Number((-82 + Math.cos(index / 2.4) * 18).toFixed(2)),
      buyMarker: index === 4 || index === 15,
      sellMarker: index === 9 || index === 20
    };
  });
  return {
    symbol: seed.stock,
    priceAxis: "Adjusted close",
    indicatorAxis: "RSI / WILLR",
    points
  };
}

function buildScenario(seed: ScenarioSeed) {
  const series = isoMonthSeries(seed);
  const latest = series.at(-1);
  return {
    scenarioKey: seed.key,
    universeMode: seed.universeMode,
    capitalMode: seed.capitalMode,
    stock: seed.stock,
    label: seed.label,
    benchmarkMode: seed.benchmarkMode,
    summary: {
      investedAmount: seed.startValue,
      currentValue: seed.finalValue,
      realizedPnl: seed.realizedPnl,
      unrealizedPnl: seed.unrealizedPnl,
      totalReturnPct: seed.totalReturnPct,
      winRatePct: seed.winRatePct,
      maxDrawdownPct: seed.maxDrawdownPct,
      totalCharges: seed.totalCharges,
      openPositions: seed.openPositions,
      maxOpenPositionsReached: latest?.openPositions ?? seed.openPositions,
      avgHoldDays: seed.avgHoldDays,
      maxHoldDays: seed.maxHoldDays,
      cashBalance: seed.capitalMode === "no_capital_limit" ? null : Math.max(0, Math.round(seed.startValue * 0.12)),
      exposurePct: seed.universeMode === "nifty_100" ? 67.4 : 22.1,
      fdFinalValue: seed.fdFinalValue,
      excessOverFd: seed.fdFinalValue == null ? null : seed.finalValue - seed.fdFinalValue
    },
    equityCurve: series.map((point) => ({
      date: point.date,
      strategyValue: point.strategyValue,
      benchmarkValue: point.benchmarkValue
    })),
    drawdownCurve: series.map((point) => ({
      date: point.date,
      drawdownPct: point.drawdownPct
    })),
    capitalDeploymentCurve: series.map((point) => ({
      date: point.date,
      deployedCapital: point.deployedCapital,
      openPositions: point.openPositions
    })),
    rollingWinRate: series.slice(-18).map((point, index) => ({
      date: point.date,
      winRate3m: Number((seed.winRatePct - 6 + (index % 5) * 1.2).toFixed(1)),
      winRate6m: Number((seed.winRatePct - 3 + (index % 4) * 0.9).toFixed(1))
    })),
    tradeReturnHistogram: histogramFromBuckets(seed, "returns"),
    holdingDurationHistogram: histogramFromBuckets(seed, "holding"),
    monthlyReturns: monthlyReturnBars(seed),
    priceIndicatorChart: buildPriceIndicatorChart(seed),
    openPositions: buildOpenPositions(seed),
    trades: buildTrades(seed),
    skippedSignals: buildSkippedSignals(seed),
    regimeBreakdown: buildRegimeBreakdown(seed),
    stockBreakdown: buildStockBreakdown(seed),
    chargesSummary: [
      { label: "Brokerage", value: CHARGES_MODEL.brokerage_delivery_equity, display: "0%" },
      { label: "STT", value: CHARGES_MODEL.stt_delivery_rate, display: "0.10%" },
      { label: "NSE txn", value: CHARGES_MODEL.transaction_charge_rate_nse_equity_cash, display: "0.00307%" },
      { label: "SEBI", value: CHARGES_MODEL.sebi_charge_per_crore, display: "₹10 / crore" },
      { label: "GST", value: CHARGES_MODEL.gst_rate, display: "18%" },
      { label: "Stamp duty", value: CHARGES_MODEL.stamp_duty_buy_rate_delivery, display: "0.015% buy-side" },
      { label: "DP charge", value: CHARGES_MODEL.dp_charge_sell_order_total, display: "₹15.34 / sell order" }
    ]
  };
}

function buildBacktestingDataset() {
  const scenarios = Object.fromEntries(SCENARIO_SEEDS.map((seed) => [seed.key, buildScenario(seed)]));
  return {
    generatedAt: SNAPSHOT_META.generatedAt,
    asOfDate: SNAPSHOT_META.marketDate,
    snapshotAgeLabel: SNAPSHOT_META.snapshotAgeLabel,
    chargesModel: CHARGES_MODEL,
    scenarioOptions: SCENARIO_SEEDS.map((seed) => ({
      key: seed.key,
      label: seed.label,
      universeMode: seed.universeMode,
      capitalMode: seed.capitalMode,
      stock: seed.stock
    })),
    scenarios
  };
}

function selectScenario(dataset: ReturnType<typeof buildBacktestingDataset>, scenarioKey?: string) {
  if (scenarioKey && dataset.scenarios[scenarioKey]) return dataset.scenarios[scenarioKey];
  return dataset.scenarios["nifty_100:capital_16l"];
}

function buildFilterModel(dataset: ReturnType<typeof buildBacktestingDataset>) {
  return {
    strategies: [
      {
        value: DEFAULT_BACKTEST_STRATEGY_ID,
        label: "RSI < 30 + WILLR < -80 + Positive Close Confirmation"
      }
    ],
    versions: [{ value: "1", label: "v1" }],
    universeModes: [
      { value: "single_stock", label: "Single Stock" },
      { value: "nifty_100", label: "Nifty 100" }
    ],
    capitalModes: [
      { value: "no_capital_limit", label: "No Capital Limit" },
      { value: "capital_16l", label: "₹16L / ₹2L tickets / max 8" },
      { value: "capital_10l", label: "10L" },
      { value: "capital_20l", label: "20L" },
      { value: "capital_50l", label: "50L" }
    ],
    dateRanges: [
      { value: "1y", label: "Last 1 year" },
      { value: "3y", label: "Last 3 years" },
      { value: "max", label: "Max available" }
    ],
    stocks: dataset.scenarioOptions
      .filter((option) => option.stock)
      .map((option) => ({ value: option.stock!, label: option.stock! }))
  };
}

export async function getBacktestingOverview(prisma: PrismaClient) {
  const published = await loadPublishedBacktestingOverview(prisma);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const registry = await getBacktestingRegistry(prisma);
  const dataset = buildBacktestingDataset();
  const scenario = selectScenario(dataset, "nifty_100:capital_16l");
  return {
    generatedAt: dataset.generatedAt,
    asOfDate: dataset.asOfDate,
    marketDate: dataset.asOfDate,
    snapshotAgeLabel: dataset.snapshotAgeLabel,
    activeStrategies: registry.strategies.length,
    symbolsCovered: 100,
    latestSnapshot: {
      generatedAt: dataset.generatedAt,
      marketDate: dataset.asOfDate,
      openPositionsToday: scenario.summary.openPositions
    },
    selectedScenarioKey: scenario.scenarioKey,
    quickStats: scenario.summary,
    miniEquityCurve: scenario.equityCurve.slice(-12),
    miniDrawdownCurve: scenario.drawdownCurve.slice(-12),
    shortcuts: [
      { label: "Open Strategy Detail", to: `/backtesting/strategies/${DEFAULT_BACKTEST_STRATEGY_ID}` },
      { label: "Open Daily Summary", to: "/backtesting/daily-summary" },
      { label: "Compare Strategies", to: "/backtesting/compare" }
    ]
  };
}

export async function getBacktestingStrategies(prisma: PrismaClient) {
  const published = await loadPublishedBacktestingStrategies(prisma);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const registry = await getBacktestingRegistry(prisma);
  const latestRuns = new Map<string, (typeof registry.runs)[number]>();
  for (const run of registry.runs) {
    if (!latestRuns.has(run.strategyVersionId)) {
      latestRuns.set(run.strategyVersionId, run);
    }
  }
  return {
    generatedAt: SNAPSHOT_META.generatedAt,
    asOfDate: SNAPSHOT_META.marketDate,
    items: registry.strategies.map((strategy: (typeof registry.strategies)[number]) => {
      const version = registry.versions.find(
        (item: (typeof registry.versions)[number]) => item.strategyId === strategy.strategyId && item.isActiveVersion
      );
      const latestRun = version ? latestRuns.get(version.strategyVersionId) : undefined;
      return {
        strategyId: strategy.strategyId,
        strategySlug: strategy.strategySlug,
        displayName: strategy.displayName,
        description: strategy.description,
        status: strategy.status,
        scope: "Stock only",
        supportedCapitalModes: ["No Capital Limit", "₹16L / ₹2L tickets / max 8", "10L", "20L", "50L"],
        activeVersionNumber: version?.versionNumber ?? 1,
        activeVersionId: version?.strategyVersionId ?? null,
        latestRunStatus: latestRun?.status ?? "unknown",
        latestAsOfDate: latestRun?.asOfDate ?? SNAPSHOT_META.marketDate
      };
    })
  };
}

async function getBacktestingStrategyDetail(prisma: PrismaClient, strategyId = DEFAULT_BACKTEST_STRATEGY_ID, scenarioKey?: string | null) {
  const published = await loadPublishedBacktestingStrategyDetail(prisma, strategyId, scenarioKey);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const registry = await getBacktestingRegistry(prisma);
  const dataset = buildBacktestingDataset();
  const strategy =
    registry.strategies.find((item: (typeof registry.strategies)[number]) => item.strategyId === strategyId) ?? registry.strategies[0];
  const version =
    registry.versions.find(
      (item: (typeof registry.versions)[number]) => item.strategyId === strategy.strategyId && item.isActiveVersion
    ) ?? registry.versions[0];
  const latestRuns = registry.runs.filter(
    (run: (typeof registry.runs)[number]) => run.strategyVersionId === version.strategyVersionId
  );
  return {
    generatedAt: dataset.generatedAt,
    asOfDate: dataset.asOfDate,
    strategy,
    version,
    latestRuns,
    chargesModel: dataset.chargesModel,
    filters: buildFilterModel(dataset),
    defaultScenarioKey: "nifty_100:capital_16l",
    scenarioOptions: dataset.scenarioOptions,
    scenarios: dataset.scenarios
  };
}

export async function getBacktestingDailySummary(prisma: PrismaClient) {
  const published = await loadPublishedBacktestingDailySummary(prisma);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const detail = await getBacktestingStrategyDetail(prisma);
  const scenario = selectScenario(buildBacktestingDataset(), detail.defaultScenarioKey);
  return {
    generatedAt: detail.generatedAt,
    asOfDate: detail.asOfDate,
    latestEntries: scenario.trades.slice(0, 3).map((trade) => ({
      symbol: trade.symbol,
      entryDate: trade.entryDate,
      returnPct: trade.returnPct
    })),
    latestExits: scenario.trades.filter((trade) => trade.exitDate).slice(0, 3).map((trade) => ({
      symbol: trade.symbol,
      exitDate: trade.exitDate,
      exitReason: trade.exitReason,
      returnPct: trade.returnPct
    })),
    currentOpenPositions: scenario.openPositions,
    skippedSignals: scenario.skippedSignals,
    deployment: {
      openPositions: scenario.summary.openPositions,
      exposurePct: scenario.summary.exposurePct,
      dailyPortfolioDelta: 12480,
      dailyBenchmarkDelta: 3280
    }
  };
}

export async function getBacktestingCompare(prisma: PrismaClient) {
  const published = await loadPublishedBacktestingCompare(prisma);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const detail = await getBacktestingStrategyDetail(prisma);
  const rows = Object.values(detail.scenarios).map((scenario) => ({
    strategyId: detail.strategy.strategyId,
    displayName: detail.strategy.displayName,
    versionNumber: detail.version.versionNumber,
    universeMode: scenario.universeMode,
    capitalMode: scenario.capitalMode,
    totalReturnPct: scenario.summary.totalReturnPct,
    excessOverFd: scenario.summary.excessOverFd,
    winRatePct: scenario.summary.winRatePct,
    maxDrawdownPct: scenario.summary.maxDrawdownPct,
    avgHoldDays: scenario.summary.avgHoldDays,
    maxHoldDays: scenario.summary.maxHoldDays,
    totalCharges: scenario.summary.totalCharges,
    exposurePct: scenario.summary.exposurePct,
    latestSnapshotAge: SNAPSHOT_META.snapshotAgeLabel
  }));
  return {
    generatedAt: detail.generatedAt,
    asOfDate: detail.asOfDate,
    rows,
    regimeCompare: Object.values(detail.scenarios).map((scenario) => ({
      scenarioKey: scenario.scenarioKey,
      label: scenario.label,
      regimes: scenario.regimeBreakdown
    }))
  };
}

export async function getBacktestingRuns(prisma: PrismaClient) {
  const published = await loadPublishedBacktestingRuns(prisma);
  if (published) return published;
  if (!seededFallbackEnabled()) {
    throw publishedSnapshotRequiredError();
  }
  const registry = await getBacktestingRegistry(prisma);
  return {
    generatedAt: SNAPSHOT_META.generatedAt,
    asOfDate: SNAPSHOT_META.marketDate,
    runs: registry.runs,
    validations: registry.validations,
    lastKnownGoodSnapshot: {
      key: "backtesting-overview",
      generatedAt: SNAPSHOT_META.generatedAt,
      asOfDate: SNAPSHOT_META.marketDate
    }
  };
}

export function registerBacktesting(app: Express, prisma: PrismaClient) {
  app.get("/v1/backtesting/h30/latest", async (req, res) => {
    const requestedRun = typeof req.query.runId === "string" ? req.query.runId : null;
    const runRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT r.run_id::text AS "runId",r.strategy_version_id AS "strategyVersionId",r.status,
             r.diagnostic_score::double precision AS "diagnosticScore",r.final_score::double precision AS "finalScore",
             r.blockers_json AS blockers,r.ranking_json AS ranking,r.created_at AS "generatedAt"
      FROM strategy_eval.strategy_horizon_ranking r
      WHERE ($1::uuid IS NULL OR r.run_id=$1::uuid)
      ORDER BY r.created_at DESC LIMIT 1`, requestedRun);
    if (!runRows.length) return res.status(404).json({ code: "H30_RESULT_NOT_FOUND", message: "No H30 evaluation has been persisted yet." });
    const run = runRows[0];
    const observations = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT symbol,entry_date AS "entryDate",coverage_status AS "coverageStatus",sessions_observed AS "sessionsObserved",
             max_close_price::double precision AS "maxClosePrice",max_close_date AS "maxCloseDate",
             max_close_session_index AS "sessionsToMax",after_tax_max_close_upside_pct::double precision AS "afterTaxUpsidePct",
             mae_before_max_close_pct::double precision AS "maeBeforeMaxPct",rankable_flag AS "rankable"
      FROM strategy_eval.long_horizon_observation WHERE run_id=$1::uuid ORDER BY entry_date,symbol LIMIT 1000`, run.runId);
    const charts = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT chart_id AS "chartId",format FROM strategy_eval.chart_artifact
      WHERE run_id=$1::uuid AND format IN ('png','svg') ORDER BY chart_id,format`, run.runId);
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json({ ...run, observations, charts: charts.map((row) => ({ ...row, url: `/v1/backtesting/h30/artifacts/${encodeURIComponent(String(row.chartId))}?runId=${run.runId}` })) });
  });

  app.get("/v1/backtesting/h30/artifacts/:chartId", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : null;
    if (!runId) return res.status(400).json({ code: "RUN_ID_REQUIRED" });
    const rows = await prisma.$queryRawUnsafe<Array<{ artifactPath: string }>>(`
      SELECT artifact_path AS "artifactPath" FROM strategy_eval.chart_artifact
      WHERE run_id=$1::uuid AND chart_id=$2 AND format='png' LIMIT 1`, runId, req.params.chartId);
    if (!rows.length) return res.status(404).json({ code: "CHART_NOT_FOUND" });
    const mountedRoot = process.env.H30_ARTIFACT_ROOT;
    const artifactPath = mountedRoot
      ? path.join(mountedRoot, runId, path.basename(rows[0].artifactPath))
      : rows[0].artifactPath;
    return res.sendFile(artifactPath);
  });

  app.get("/v1/backtesting/overview", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "backtesting-overview",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getBacktestingOverview
    })
  );

  app.get("/v1/backtesting/strategies", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "backtesting-strategies",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getBacktestingStrategies
    })
  );

  app.get("/v1/backtesting/strategies/:strategyId", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: `backtesting-strategy-${req.params.strategyId}-${typeof req.query.scenario === "string" ? req.query.scenario : "default"}`,
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: (db) => getBacktestingStrategyDetail(db, req.params.strategyId, typeof req.query.scenario === "string" ? req.query.scenario : undefined)
    })
  );

  app.get("/v1/backtesting/strategies/:strategyId/summary", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({
      generatedAt: detail.generatedAt,
      asOfDate: detail.asOfDate,
      strategy: detail.strategy,
      version: detail.version,
      scenario
    });
  });

  app.get("/v1/backtesting/strategies/:strategyId/equity", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({
      generatedAt: detail.generatedAt,
      asOfDate: detail.asOfDate,
      strategyId: detail.strategy.strategyId,
      scenarioKey: scenario.scenarioKey,
      points: scenario.equityCurve
    });
  });

  app.get("/v1/backtesting/strategies/:strategyId/drawdown", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({
      generatedAt: detail.generatedAt,
      asOfDate: detail.asOfDate,
      strategyId: detail.strategy.strategyId,
      scenarioKey: scenario.scenarioKey,
      points: scenario.drawdownCurve
    });
  });

  app.get("/v1/backtesting/strategies/:strategyId/open-positions", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({ items: scenario.openPositions, scenarioKey: scenario.scenarioKey, generatedAt: detail.generatedAt });
  });

  app.get("/v1/backtesting/strategies/:strategyId/trades", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({
      items: scenario.trades,
      skippedSignals: scenario.skippedSignals,
      scenarioKey: scenario.scenarioKey,
      generatedAt: detail.generatedAt
    });
  });

  app.get("/v1/backtesting/strategies/:strategyId/stocks", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({ items: scenario.stockBreakdown, scenarioKey: scenario.scenarioKey, generatedAt: detail.generatedAt });
  });

  app.get("/v1/backtesting/strategies/:strategyId/regimes", async (req, res) => {
    const scenarioKey = typeof req.query.scenario === "string" ? req.query.scenario : undefined;
    const detail = await getBacktestingStrategyDetail(prisma, req.params.strategyId, scenarioKey);
    const scenario = detail.scenarios[scenarioKey ?? detail.defaultScenarioKey] ?? detail.scenarios[detail.defaultScenarioKey] ?? Object.values(detail.scenarios)[0];
    return res.json({ items: scenario.regimeBreakdown, scenarioKey: scenario.scenarioKey, generatedAt: detail.generatedAt });
  });

  app.get("/v1/backtesting/daily-summary", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "backtesting-daily-summary",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getBacktestingDailySummary
    })
  );

  app.get("/v1/backtesting/compare", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "backtesting-compare",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getBacktestingCompare
    })
  );

  app.get("/v1/backtesting/runs", async (req, res) =>
    serveSnapshotRoute(req, res, prisma, {
      key: "backtesting-runs",
      cacheControl: "private, max-age=300, stale-while-revalidate=300",
      freshnessMs: 5 * 60_000,
      build: getBacktestingRuns
    })
  );
}
