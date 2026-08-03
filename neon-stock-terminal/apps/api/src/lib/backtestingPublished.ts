import { Prisma, type PrismaClient } from "@prisma/client";

const DEFAULT_STRATEGY_ID = "rsi30_willr80_closegtprev_tp125";
const DEFAULT_SCENARIO_KEY = "nifty_100:capital_16l";

const CHARGES_MODEL = {
  brokerage_delivery_equity: 0,
  stt_delivery_rate: 0.1,
  transaction_charge_rate_nse_equity_cash: 0.00307,
  sebi_charge_per_crore: 10,
  gst_rate: 18,
  stamp_duty_buy_rate_delivery: 0.015,
  dp_charge_sell_order_total: 15.34
} as const;

type BatchRow = {
  batch_run_id: bigint | number;
  data_as_of_date: Date | string;
  generated_at: Date | string;
  stale_after: Date | string | null;
  row_counts: Prisma.JsonValue;
  validation_metrics: Prisma.JsonValue;
};

type StrategyRow = {
  strategy_id: string;
  strategy_slug: string;
  display_name: string;
  description: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type VersionRow = {
  strategy_version_id: string;
  strategy_id: string;
  version_number: number;
  config_json: Prisma.JsonValue;
  assumptions_json: Prisma.JsonValue;
  fee_profile_id: string | null;
  created_at: Date | string;
  created_by: string | null;
  is_active_version: boolean;
};

type RunRow = {
  strategy_version_id: string;
  scenario_key: string;
  scenario_label: string;
  universe_mode: string;
  capital_mode: string;
  stock_symbol: string | null;
  as_of_date: Date | string;
  generated_at: Date | string;
  status: string;
  rows_processed: number;
  warnings_count: number;
  errors_count: number;
  summary_json: Prisma.JsonValue;
};

type DailyEquityRow = {
  trade_date: Date | string;
  active_positions: number;
  deployed_capital: unknown;
  available_cash: unknown;
  market_value: unknown;
  total_equity: unknown;
  benchmark_value: unknown;
  daily_return_pct: unknown;
  drawdown_pct: unknown;
};

type TradeRow = {
  symbol: string;
  security_name: string | null;
  sector: string | null;
  signal_date: Date | string;
  entry_date: Date | string;
  exit_date: Date | string | null;
  exit_reason: string | null;
  regime_on_entry: string | null;
  signal_rsi: unknown;
  signal_willr: unknown;
  close_vs_prev_close_pct: unknown;
  entry_price: unknown;
  exit_price: unknown;
  quantity: unknown;
  gross_entry_value: unknown;
  gross_exit_value: unknown;
  total_charges: unknown;
  net_pnl: unknown;
  return_pct: unknown;
  holding_days: number | null;
  trade_status: string;
};

type OpenPositionRow = {
  symbol: string;
  signal_date: Date | string;
  entry_date: Date | string;
  regime_on_entry: string | null;
  entry_price: unknown;
  current_price: unknown;
  quantity: unknown;
  allocated_capital: unknown;
  market_value: unknown;
  unrealized_pnl: unknown;
  unrealized_return_pct: unknown;
  target_price: unknown;
  days_open: number | null;
};

type StockSummaryRow = {
  symbol: string;
  signal_count: number;
  accepted_trades: number;
  skipped_trades: number;
  win_rate_pct: unknown;
  avg_return_pct: unknown;
  median_return_pct: unknown;
  max_gain_pct: unknown;
  max_loss_pct: unknown;
  avg_hold_days: unknown;
  max_hold_days: number | null;
  total_invested: unknown;
  current_value: unknown;
  realized_pnl: unknown;
  unrealized_pnl: unknown;
  charges: unknown;
  last_signal_date: Date | string | null;
  open_position_flag: boolean;
};

type RegimeSummaryRow = {
  regime_label: string;
  trade_count: number;
  win_rate_pct: unknown;
  avg_return_pct: unknown;
  median_return_pct: unknown;
  max_drawdown_contribution_pct: unknown;
  avg_hold_days: unknown;
  total_charges: unknown;
};

type SkippedSignalRow = {
  signal_date: Date | string;
  symbol: string;
  reason: string;
  details_json: Prisma.JsonValue;
};

type SymbolDailyRow = {
  trade_date: Date | string;
  close_price: unknown;
  rsi_14: unknown;
  willr_14: unknown;
};

type StrategySummaryMartRow = {
  strategy_version_id: string;
  scenario_key: string;
  strategy_id: string;
  display_name: string;
  archetype: string;
  universe_mode: string;
  capital_mode: string;
  stock_symbol: string | null;
  as_of_date: Date | string;
  summary_json: Prisma.JsonValue;
  metadata_json: Prisma.JsonValue;
};

type CompareMartRow = {
  strategy_version_id: string;
  scenario_key: string;
  strategy_id: string;
  display_name: string;
  archetype: string;
  universe_mode: string;
  capital_mode: string;
  as_of_date: Date | string;
  compare_json: Prisma.JsonValue;
  version_number: number;
  strategy_slug: string;
};

type StockSummaryMartRow = {
  strategy_version_id: string;
  scenario_key: string;
  symbol: string;
  summary_json: Prisma.JsonValue;
};

type RegimeSummaryMartRow = {
  strategy_version_id: string;
  scenario_key: string;
  regime_label: string;
  summary_json: Prisma.JsonValue;
};

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function toNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function humanizeCapitalMode(value: string) {
  return {
    no_capital_limit: "No Capital Limit",
    capital_16l: "₹16L / ₹2L tickets / max 8",
    capital_10l: "10L",
    capital_20l: "20L",
    capital_50l: "50L"
  }[value] ?? value;
}

function scenarioSortRank(row: Pick<RunRow, "universe_mode" | "capital_mode" | "stock_symbol">) {
  const universeRank = row.universe_mode === "nifty_100" ? 0 : 1;
  const capitalRank =
    row.capital_mode === "capital_16l" ? 0 :
      row.capital_mode === "no_capital_limit" ? 1 :
        row.capital_mode === "capital_10l" ? 2 :
          row.capital_mode === "capital_20l" ? 3 :
            row.capital_mode === "capital_50l" ? 4 : 5;
  return [universeRank, capitalRank, row.stock_symbol ?? ""] as const;
}

function bucketize(values: number[], bounds: number[]) {
  const labels = bounds.map((bound, index) => {
    if (index === 0) return `< ${bound}`;
    if (index === bounds.length - 1) return `>= ${bounds[index - 1]}`;
    return `${bounds[index - 1]} to ${bound}`;
  });
  const counts = Array.from({ length: bounds.length }, () => 0);
  for (const value of values) {
    let bucketIndex = bounds.findIndex((bound) => value < bound);
    if (bucketIndex === -1) bucketIndex = bounds.length - 1;
    counts[bucketIndex] += 1;
  }
  return labels.map((bucketLabel, index) => ({ bucketLabel, count: counts[index] }));
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function buildRollingWinRate(trades: TradeRow[]) {
  const closed = trades
    .filter((trade) => trade.exit_date)
    .sort((a, b) => toIsoDate(a.exit_date).localeCompare(toIsoDate(b.exit_date)));
  const windows = [63, 126];
  return closed.map((trade, index) => {
    const slice3m = closed.slice(Math.max(0, index - windows[0] + 1), index + 1);
    const slice6m = closed.slice(Math.max(0, index - windows[1] + 1), index + 1);
    const pct = (rows: TradeRow[]) => (rows.length ? (rows.filter((row) => toNumber(row.return_pct) > 0).length / rows.length) * 100 : 0);
    return {
      date: toIsoDate(trade.exit_date),
      winRate3m: Number(pct(slice3m).toFixed(2)),
      winRate6m: Number(pct(slice6m).toFixed(2))
    };
  });
}

function buildMonthlyReturns(trades: TradeRow[]) {
  const byMonth = new Map<string, { pnl: number; invested: number }>();
  for (const trade of trades) {
    if (!trade.exit_date) continue;
    const key = monthKey(toIsoDate(trade.exit_date));
    const bucket = byMonth.get(key) ?? { pnl: 0, invested: 0 };
    bucket.pnl += toNumber(trade.net_pnl);
    bucket.invested += toNumber(trade.gross_entry_value);
    byMonth.set(key, bucket);
  }
  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([month, values]) => ({
      month,
      pnl: Number(values.pnl.toFixed(2)),
      returnPct: Number((values.invested > 0 ? (values.pnl / values.invested) * 100 : 0).toFixed(2))
    }));
}

function buildChargesSummary(totalCharges: number) {
  return [
    { label: "Brokerage", value: CHARGES_MODEL.brokerage_delivery_equity, display: "Delivery brokerage: 0" },
    { label: "STT", value: CHARGES_MODEL.stt_delivery_rate, display: "0.10% on delivery turnover" },
    { label: "Transaction charges", value: CHARGES_MODEL.transaction_charge_rate_nse_equity_cash, display: "NSE cash delivery transaction rate" },
    { label: "GST", value: CHARGES_MODEL.gst_rate, display: "18% on brokerage and statutory exchange charges" },
    { label: "Stamp duty", value: CHARGES_MODEL.stamp_duty_buy_rate_delivery, display: "0.015% on the buy leg" },
    { label: "DP charge", value: CHARGES_MODEL.dp_charge_sell_order_total, display: "Flat DP charge on the sell leg" },
    { label: "Scenario total", value: totalCharges, display: `Observed charges in this scenario: INR ${Math.round(totalCharges).toLocaleString("en-IN")}` }
  ];
}

function mapCompareJson(compareJson: Prisma.JsonValue) {
  const compare = asJsonObject(compareJson);
  const regimeStrength = asJsonObject((compare.regimeStrengthSummary as Prisma.JsonValue) ?? {});
  return {
    strategyId: String(compare.strategyId ?? ""),
    strategyVersionId: String(compare.strategyVersionId ?? ""),
    displayName: String(compare.displayName ?? ""),
    archetype: String(compare.archetype ?? "custom"),
    versionNumber: toNumber(compare.versionNumber, 1),
    universeMode: String(compare.universeMode ?? "nifty_100"),
    capitalMode: String(compare.capitalMode ?? "capital_16l"),
    stock: compare.stock == null ? null : String(compare.stock),
    currentValue: toNumber(compare.currentValue),
    realizedPnl: toNumber(compare.realizedPnl),
    unrealizedPnl: toNumber(compare.unrealizedPnl),
    totalReturnPct: toNumber(compare.totalReturnPct),
    excessOverFd: compare.excessOverFd == null ? null : toNumber(compare.excessOverFd),
    winRatePct: toNumber(compare.winRatePct),
    totalClosedTrades: toNumber(compare.totalClosedTrades),
    openPositions: toNumber(compare.openPositions),
    maxDrawdownPct: toNumber(compare.maxDrawdownPct),
    avgHoldDays: toNumber(compare.avgHoldDays),
    minHoldDays: toNumber(compare.minHoldDays),
    maxHoldDays: toNumber(compare.maxHoldDays),
    totalCharges: toNumber(compare.totalCharges),
    avgExposurePct: toNumber(compare.avgExposurePct),
    topPerformingStock: compare.topPerformingStock == null ? null : String(compare.topPerformingStock),
    worstPerformingStock: compare.worstPerformingStock == null ? null : String(compare.worstPerformingStock),
    regimeStrengthSummary: {
      bestRegime: regimeStrength.bestRegime == null ? null : String(regimeStrength.bestRegime),
      worstRegime: regimeStrength.worstRegime == null ? null : String(regimeStrength.worstRegime)
    }
  };
}

async function loadLatestPublishedBatch(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<BatchRow[]>(Prisma.sql`
    SELECT batch_run_id, data_as_of_date, generated_at, stale_after, row_counts, validation_metrics
    FROM nse_app.batch_run_audit
    WHERE batch_name = 'backtesting_precompute'
      AND published_flag = TRUE
    ORDER BY published_at DESC NULLS LAST, generated_at DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function loadActiveStrategyContext(prisma: PrismaClient, strategyId: string) {
  const [strategyRows, versionRows] = await Promise.all([
    prisma.$queryRaw<StrategyRow[]>(Prisma.sql`
      SELECT strategy_id, strategy_slug, display_name, description, status, created_at, updated_at
      FROM nse_app.backtest_strategy
      WHERE strategy_id = ${strategyId}
      LIMIT 1
    `),
    prisma.$queryRaw<VersionRow[]>(Prisma.sql`
      SELECT strategy_version_id, strategy_id, version_number, config_json, assumptions_json, fee_profile_id, created_at, created_by, is_active_version
      FROM nse_app.backtest_strategy_version
      WHERE strategy_id = ${strategyId}
        AND is_active_version = TRUE
      ORDER BY version_number DESC
      LIMIT 1
    `)
  ]);
  return {
    strategy: strategyRows[0] ?? null,
    version: versionRows[0] ?? null
  };
}

async function loadRunsForVersion(prisma: PrismaClient, batchRunId: number, strategyVersionId: string) {
  return prisma.$queryRaw<RunRow[]>(Prisma.sql`
    SELECT strategy_version_id, scenario_key, scenario_label, universe_mode, capital_mode, stock_symbol, as_of_date, generated_at, status, rows_processed, warnings_count, errors_count, summary_json
    FROM nse_app.backtest_run
    WHERE batch_run_id = ${batchRunId}
      AND strategy_version_id = ${strategyVersionId}
    ORDER BY universe_mode ASC, capital_mode ASC, stock_symbol ASC NULLS FIRST
  `);
}

function chooseScenario(runs: RunRow[], preferredScenarioKey?: string | null) {
  if (preferredScenarioKey) {
    const preferred = runs.find((run) => run.scenario_key === preferredScenarioKey);
    if (preferred) return preferred;
  }
  return (
    runs.find((run) => run.scenario_key === DEFAULT_SCENARIO_KEY)
    ?? [...runs].sort((left, right) => {
      const [leftUniverse, leftCapital, leftStock] = scenarioSortRank(left);
      const [rightUniverse, rightCapital, rightStock] = scenarioSortRank(right);
      return leftUniverse - rightUniverse || leftCapital - rightCapital || leftStock.localeCompare(rightStock);
    })[0]
    ?? null
  );
}

function mapSummary(summaryJson: Prisma.JsonValue, _fallbackCapitalMode: string) {
  const summary = asJsonObject(summaryJson);
  return {
    investedAmount: toNumber(summary.investedAmount),
    currentValue: toNumber(summary.currentValue),
    realizedPnl: toNumber(summary.realizedPnl),
    preTaxRealizedPnl: toNumber(summary.preTaxRealizedPnl ?? summary.realizedPnl),
    profitTaxRate: toNumber(summary.profitTaxRate, 0.35),
    taxDeducted: toNumber(summary.taxDeducted),
    afterTaxRealizedPnl: toNumber(summary.afterTaxRealizedPnl ?? summary.realizedPnl),
    unrealizedPnl: toNumber(summary.unrealizedPnl),
    totalReturnPct: toNumber(summary.totalReturnPct),
    winRatePct: toNumber(summary.winRatePct),
    maxDrawdownPct: toNumber(summary.maxDrawdownPct),
    totalCharges: toNumber(summary.totalCharges),
    openPositions: toNumber(summary.openPositions),
    maxOpenPositionsReached: toNumber(summary.maxOpenPositionsReached),
    avgHoldDays: toNumber(summary.avgHoldDays),
    maxHoldDays: toNumber(summary.maxHoldDays),
    cashBalance: summary.cashBalance == null ? null : toNumber(summary.cashBalance),
    exposurePct: toNumber(summary.exposurePct),
    fdFinalValue: summary.fdFinalValue == null ? null : toNumber(summary.fdFinalValue),
    excessOverFd: summary.excessOverFd == null ? null : toNumber(summary.excessOverFd),
    benchmarkFinalValue: summary.benchmarkFinalValue == null ? null : toNumber(summary.benchmarkFinalValue),
    excessOverBenchmark: summary.excessOverBenchmark == null ? null : toNumber(summary.excessOverBenchmark),
    benchmarkLabel: String(summary.benchmarkLabel ?? "NIFTY 50 price index"),
    benchmarkMode: String(summary.benchmarkMode ?? "nifty50_price")
  };
}

async function buildPublishedScenario(prisma: PrismaClient, batchRunId: number, run: RunRow) {
  const strategyVersionId = run.strategy_version_id;
  const scenarioKey = run.scenario_key;
  const [dailyRows, closedTrades, openPositions, stockRows, regimeRows, skippedRows, symbolRows] = await Promise.all([
    prisma.$queryRaw<DailyEquityRow[]>(Prisma.sql`
      SELECT trade_date, active_positions, deployed_capital, available_cash, market_value, total_equity, benchmark_value, daily_return_pct, drawdown_pct
      FROM nse_app.backtest_daily_equity
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY trade_date ASC
    `),
    prisma.$queryRaw<TradeRow[]>(Prisma.sql`
      SELECT symbol, security_name, sector, signal_date, entry_date, exit_date, exit_reason, regime_on_entry, signal_rsi, signal_willr, close_vs_prev_close_pct, entry_price, exit_price, quantity, gross_entry_value, gross_exit_value, total_charges, net_pnl, return_pct, holding_days, trade_status
      FROM nse_app.backtest_trade_log
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY entry_date DESC, symbol ASC
    `),
    prisma.$queryRaw<OpenPositionRow[]>(Prisma.sql`
      SELECT symbol, signal_date, entry_date, regime_on_entry, entry_price, current_price, quantity, allocated_capital, market_value, unrealized_pnl, unrealized_return_pct, target_price, days_open
      FROM nse_app.backtest_open_position
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY entry_date DESC, symbol ASC
    `),
    prisma.$queryRaw<StockSummaryRow[]>(Prisma.sql`
      SELECT symbol, signal_count, accepted_trades, skipped_trades, win_rate_pct, avg_return_pct, median_return_pct, max_gain_pct, max_loss_pct, avg_hold_days, max_hold_days, total_invested, current_value, realized_pnl, unrealized_pnl, charges, last_signal_date, open_position_flag
      FROM nse_app.backtest_stock_summary
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY symbol ASC
    `),
    prisma.$queryRaw<RegimeSummaryRow[]>(Prisma.sql`
      SELECT regime_label, trade_count, win_rate_pct, avg_return_pct, median_return_pct, max_drawdown_contribution_pct, avg_hold_days, total_charges
      FROM nse_app.backtest_regime_summary
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY regime_label ASC
    `),
    prisma.$queryRaw<SkippedSignalRow[]>(Prisma.sql`
      SELECT signal_date, symbol, reason, details_json
      FROM nse_app.backtest_skipped_signal
      WHERE batch_run_id = ${batchRunId}
        AND strategy_version_id = ${strategyVersionId}
        AND scenario_key = ${scenarioKey}
      ORDER BY signal_date DESC, symbol ASC
    `),
    run.stock_symbol
      ? prisma.$queryRaw<SymbolDailyRow[]>(Prisma.sql`
          SELECT trade_date, close_price, rsi_14, willr_14
          FROM nse_app.backtest_symbol_daily
          WHERE batch_run_id = ${batchRunId}
            AND strategy_version_id = ${strategyVersionId}
            AND symbol = ${run.stock_symbol}
          ORDER BY trade_date ASC
        `)
      : Promise.resolve([])
  ]);

  const summary = mapSummary(run.summary_json, run.capital_mode);
  const combinedTrades = [
    ...closedTrades.map((trade: TradeRow) => ({
      symbol: trade.symbol,
      signalDate: toIsoDate(trade.signal_date),
      entryDate: toIsoDate(trade.entry_date),
      exitDate: trade.exit_date ? toIsoDate(trade.exit_date) : null,
      exitReason: trade.exit_reason ?? "closed",
      returnPct: toNumber(trade.return_pct),
      charges: toNumber(trade.total_charges),
      holdingDays: trade.holding_days ?? 0,
      regimeOnEntry: trade.regime_on_entry ?? "Neutral",
      status: trade.trade_status
    })),
    ...openPositions.map((row: OpenPositionRow) => {
      const grossEntry = toNumber(row.entry_price) * toNumber(row.quantity);
      const entryCharges = toNumber(row.allocated_capital) - grossEntry;
      return {
        symbol: row.symbol,
        signalDate: toIsoDate(row.signal_date),
        entryDate: toIsoDate(row.entry_date),
        exitDate: null,
        exitReason: "open",
        returnPct: toNumber(row.unrealized_return_pct),
        charges: Number(entryCharges.toFixed(2)),
        holdingDays: row.days_open ?? 0,
        regimeOnEntry: row.regime_on_entry ?? "Neutral",
        status: "open"
      };
    })
  ].sort((left, right) => right.entryDate.localeCompare(left.entryDate) || left.symbol.localeCompare(right.symbol));

  const buyMarkers = new Set(combinedTrades.map((trade: { entryDate: string }) => trade.entryDate));
  const sellMarkers = new Set(closedTrades.filter((trade: TradeRow) => trade.exit_date).map((trade: TradeRow) => toIsoDate(trade.exit_date)));

  return {
    scenarioKey,
    universeMode: run.universe_mode,
    capitalMode: run.capital_mode,
    stock: run.stock_symbol,
    label: run.scenario_label,
    benchmarkMode: summary.benchmarkMode as "finite_fd" | "normalized_fd" | "nifty50_price",
    summary: {
      investedAmount: summary.investedAmount,
      currentValue: summary.currentValue,
      realizedPnl: summary.realizedPnl,
      preTaxRealizedPnl: summary.preTaxRealizedPnl,
      profitTaxRate: summary.profitTaxRate,
      taxDeducted: summary.taxDeducted,
      afterTaxRealizedPnl: summary.afterTaxRealizedPnl,
      unrealizedPnl: summary.unrealizedPnl,
      totalReturnPct: summary.totalReturnPct,
      winRatePct: summary.winRatePct,
      maxDrawdownPct: summary.maxDrawdownPct,
      totalCharges: summary.totalCharges,
      openPositions: summary.openPositions,
      maxOpenPositionsReached: summary.maxOpenPositionsReached,
      avgHoldDays: summary.avgHoldDays,
      maxHoldDays: summary.maxHoldDays,
      cashBalance: summary.cashBalance,
      exposurePct: summary.exposurePct,
      fdFinalValue: summary.fdFinalValue,
      excessOverFd: summary.excessOverFd,
      benchmarkFinalValue: summary.benchmarkFinalValue,
      excessOverBenchmark: summary.excessOverBenchmark,
      benchmarkLabel: summary.benchmarkLabel
    },
    equityCurve: dailyRows.map((row: DailyEquityRow) => ({
      date: toIsoDate(row.trade_date),
      strategyValue: toNumber(row.total_equity),
      benchmarkValue: row.benchmark_value == null ? null : toNumber(row.benchmark_value)
    })),
    drawdownCurve: dailyRows.map((row: DailyEquityRow) => ({
      date: toIsoDate(row.trade_date),
      drawdownPct: toNumber(row.drawdown_pct)
    })),
    capitalDeploymentCurve: dailyRows.map((row: DailyEquityRow) => ({
      date: toIsoDate(row.trade_date),
      deployedCapital: toNumber(row.deployed_capital),
      openPositions: row.active_positions
    })),
    rollingWinRate: buildRollingWinRate(closedTrades),
    tradeReturnHistogram: bucketize(closedTrades.map((trade: TradeRow) => toNumber(trade.return_pct)), [-3, 0, 1.25, 2.5, Number.POSITIVE_INFINITY]),
    holdingDurationHistogram: bucketize(closedTrades.map((trade: TradeRow) => trade.holding_days ?? 0), [6, 11, 21, 31, Number.POSITIVE_INFINITY]),
    monthlyReturns: buildMonthlyReturns(closedTrades),
    priceIndicatorChart: run.stock_symbol
      ? {
          symbol: run.stock_symbol,
          priceAxis: "Price",
          indicatorAxis: "RSI / WILLR",
          points: symbolRows.slice(-120).map((row: SymbolDailyRow) => {
            const date = toIsoDate(row.trade_date);
            return {
              date,
              price: toNumber(row.close_price),
              rsi: toNumber(row.rsi_14),
              willr: toNumber(row.willr_14),
              buyMarker: buyMarkers.has(date),
              sellMarker: sellMarkers.has(date)
            };
          })
        }
      : null,
    openPositions: openPositions.map((row: OpenPositionRow) => ({
      symbol: row.symbol,
      entryDate: toIsoDate(row.entry_date),
      quantity: toNumber(row.quantity),
      entryPrice: toNumber(row.entry_price),
      markPrice: toNumber(row.current_price, toNumber(row.entry_price)),
      unrealizedPct: toNumber(row.unrealized_return_pct),
      unrealizedPnl: toNumber(row.unrealized_pnl),
      regimeOnEntry: row.regime_on_entry ?? "Neutral",
      stopStatus: toNumber(row.current_price) >= toNumber(row.target_price) ? "At target" : "Open"
    })),
    trades: combinedTrades,
    skippedSignals: skippedRows.map((row: SkippedSignalRow) => ({
      date: toIsoDate(row.signal_date),
      symbol: row.symbol,
      reason: row.reason,
      detail: String(asJsonObject(row.details_json).message ?? row.reason)
    })),
    regimeBreakdown: regimeRows.map((row: RegimeSummaryRow) => ({
      regime: row.regime_label,
      tradeCount: row.trade_count,
      winRatePct: toNumber(row.win_rate_pct),
      avgReturnPct: toNumber(row.avg_return_pct),
      medianReturnPct: toNumber(row.median_return_pct),
      maxDrawdownContributionPct: toNumber(row.max_drawdown_contribution_pct),
      avgHoldDays: toNumber(row.avg_hold_days),
      totalCharges: toNumber(row.total_charges)
    })),
    stockBreakdown: stockRows.map((row: StockSummaryRow) => ({
      symbol: row.symbol,
      signalCount: row.signal_count,
      acceptedTrades: row.accepted_trades,
      skippedTrades: row.skipped_trades,
      winRatePct: toNumber(row.win_rate_pct),
      avgReturnPct: toNumber(row.avg_return_pct),
      medianReturnPct: toNumber(row.median_return_pct),
      maxGainPct: toNumber(row.max_gain_pct),
      maxLossPct: toNumber(row.max_loss_pct),
      avgHoldDays: toNumber(row.avg_hold_days),
      maxHoldDays: row.max_hold_days ?? 0,
      totalInvested: toNumber(row.total_invested),
      currentValue: toNumber(row.current_value),
      realizedPnl: toNumber(row.realized_pnl),
      unrealizedPnl: toNumber(row.unrealized_pnl),
      charges: toNumber(row.charges),
      lastSignalDate: toIsoDate(row.last_signal_date),
      openPosition: row.open_position_flag
    })),
    chargesSummary: buildChargesSummary(summary.totalCharges)
  };
}

export async function loadPublishedBacktestingOverview(prisma: PrismaClient) {
  const batch = await loadLatestPublishedBatch(prisma);
  if (!batch) return null;
  const batchRunId = toNumber(batch.batch_run_id);
  const context = await loadActiveStrategyContext(prisma, DEFAULT_STRATEGY_ID);
  if (!context.strategy || !context.version) return null;
  const strategyCountRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM nse_app.backtest_strategy
    WHERE status = 'active'
  `);
  const runs = await loadRunsForVersion(prisma, batchRunId, context.version.strategy_version_id);
  const selectedRun = chooseScenario(runs, DEFAULT_SCENARIO_KEY);
  if (!selectedRun) return null;
  const scenario = await buildPublishedScenario(prisma, batchRunId, selectedRun);
  const symbolCountRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT symbol) AS count
    FROM nse_app.backtest_symbol_daily
    WHERE batch_run_id = ${batchRunId}
      AND strategy_version_id = ${context.version.strategy_version_id}
      AND trade_date = ${selectedRun.as_of_date}
  `);
  return {
    generatedAt: toIsoDateTime(batch.generated_at),
    asOfDate: toIsoDate(batch.data_as_of_date),
    marketDate: toIsoDate(batch.data_as_of_date),
    snapshotAgeLabel: "Published daily snapshot",
    activeStrategies: toNumber(strategyCountRows[0]?.count),
    symbolsCovered: toNumber(symbolCountRows[0]?.count),
    latestSnapshot: {
      generatedAt: toIsoDateTime(selectedRun.generated_at),
      marketDate: toIsoDate(selectedRun.as_of_date),
      openPositionsToday: scenario.summary.openPositions
    },
    selectedScenarioKey: scenario.scenarioKey,
    quickStats: scenario.summary,
    miniEquityCurve: scenario.equityCurve.slice(-90),
    miniDrawdownCurve: scenario.drawdownCurve.slice(-90),
    shortcuts: [
      { label: "Open Latest Analysis Report", to: "/backtesting/results" },
      { label: "Open Strategy Detail", to: `/backtesting/strategies/${DEFAULT_STRATEGY_ID}` },
      { label: "Open Daily Summary", to: "/backtesting/daily-summary" },
      { label: "Compare Strategies", to: "/backtesting/compare" },
      { label: "Open Run Audit", to: "/backtesting/runs" }
    ]
  };
}

export async function loadPublishedBacktestingStrategies(prisma: PrismaClient) {
  const batch = await loadLatestPublishedBatch(prisma);
  if (!batch) return null;
  const batchRunId = toNumber(batch.batch_run_id);
  const [strategies, versions, runs, summaryRows] = await Promise.all([
    prisma.$queryRaw<StrategyRow[]>(Prisma.sql`
      SELECT strategy_id, strategy_slug, display_name, description, status, created_at, updated_at
      FROM nse_app.backtest_strategy
      ORDER BY updated_at DESC, strategy_id ASC
    `),
    prisma.$queryRaw<VersionRow[]>(Prisma.sql`
      SELECT strategy_version_id, strategy_id, version_number, config_json, assumptions_json, fee_profile_id, created_at, created_by, is_active_version
      FROM nse_app.backtest_strategy_version
      WHERE is_active_version = TRUE
      ORDER BY strategy_id ASC, version_number DESC
    `),
    prisma.$queryRaw<RunRow[]>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, scenario_label, universe_mode, capital_mode, stock_symbol, as_of_date, generated_at, status, rows_processed, warnings_count, errors_count, summary_json
      FROM nse_app.backtest_run
      WHERE batch_run_id = ${batchRunId}
      ORDER BY generated_at DESC
    `),
    prisma.$queryRaw<StrategySummaryMartRow[]>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, strategy_id, display_name, archetype, universe_mode, capital_mode, stock_symbol, as_of_date, summary_json, metadata_json
      FROM nse_app.backtest_strategy_summary_mart
      WHERE batch_run_id = ${batchRunId}
        AND stock_symbol IS NULL
    `)
  ]);

  return {
    generatedAt: toIsoDateTime(batch.generated_at),
    asOfDate: toIsoDate(batch.data_as_of_date),
    items: strategies.map((strategy: StrategyRow) => {
      const version = versions.find((item: VersionRow) => item.strategy_id === strategy.strategy_id) ?? null;
      const latestRun = version ? runs.find((run: RunRow) => run.strategy_version_id === version.strategy_version_id) : null;
      const summaryRow = version ? summaryRows.find((row: StrategySummaryMartRow) => row.strategy_version_id === version.strategy_version_id && row.capital_mode === "capital_16l") ?? summaryRows.find((row: StrategySummaryMartRow) => row.strategy_version_id === version.strategy_version_id) : null;
      const config = version ? asJsonObject(version.config_json) : {};
      const capitalModes = Array.isArray(config.capital_modes) ? config.capital_modes.map(String) : ["no_capital_limit", "capital_16l"];
      return {
        strategyId: strategy.strategy_id,
        strategySlug: strategy.strategy_slug,
        displayName: strategy.display_name,
        description: strategy.description ?? "",
        archetype: summaryRow?.archetype ?? "custom",
        status: strategy.status,
        scope: "Stock only",
        supportedCapitalModes: capitalModes.map(humanizeCapitalMode),
        activeVersionNumber: version?.version_number ?? 1,
        activeVersionId: version?.strategy_version_id ?? null,
        latestRunStatus: latestRun?.status ?? "unknown",
        latestAsOfDate: latestRun ? toIsoDate(latestRun.as_of_date) : toIsoDate(batch.data_as_of_date)
      };
    })
  };
}

export async function loadPublishedBacktestingStrategyDetail(prisma: PrismaClient, strategyId: string, scenarioKey?: string | null) {
  const batch = await loadLatestPublishedBatch(prisma);
  if (!batch) return null;
  const batchRunId = toNumber(batch.batch_run_id);
  const [context, allStrategies] = await Promise.all([
    loadActiveStrategyContext(prisma, strategyId),
    prisma.$queryRaw<StrategyRow[]>(Prisma.sql`
      SELECT strategy_id, strategy_slug, display_name, description, status, created_at, updated_at
      FROM nse_app.backtest_strategy
      WHERE status = 'active'
      ORDER BY display_name ASC
    `)
  ]);
  if (!context.strategy || !context.version) return null;
  const runs = await loadRunsForVersion(prisma, batchRunId, context.version.strategy_version_id);
  const selectedRun = chooseScenario(runs, scenarioKey);
  if (!selectedRun) return null;
  const scenario = await buildPublishedScenario(prisma, batchRunId, selectedRun);
  const scenarioOptions = [...runs]
    .sort((left, right) => {
      const [leftUniverse, leftCapital, leftStock] = scenarioSortRank(left);
      const [rightUniverse, rightCapital, rightStock] = scenarioSortRank(right);
      return leftUniverse - rightUniverse || leftCapital - rightCapital || leftStock.localeCompare(rightStock);
    })
    .map((run: RunRow) => ({
      key: run.scenario_key,
      label: run.scenario_label,
      universeMode: run.universe_mode,
      capitalMode: run.capital_mode,
      stock: run.stock_symbol
    }));
  const stockOptions = scenarioOptions
    .filter((option) => option.universeMode === "single_stock" && option.stock)
    .map((option) => ({ value: option.stock as string, label: option.stock as string }))
    .filter((option, index, all) => all.findIndex((item) => item.value === option.value) === index)
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    generatedAt: toIsoDateTime(batch.generated_at),
    asOfDate: toIsoDate(batch.data_as_of_date),
    strategy: {
      strategyId: context.strategy.strategy_id,
      strategySlug: context.strategy.strategy_slug,
      displayName: context.strategy.display_name,
      description: context.strategy.description ?? "",
      archetype: String(asJsonObject(context.version.config_json).entry_kind ?? "custom"),
      status: context.strategy.status,
      createdAt: toIsoDateTime(context.strategy.created_at),
      updatedAt: toIsoDateTime(context.strategy.updated_at)
    },
    version: {
      strategyVersionId: context.version.strategy_version_id,
      strategyId: context.version.strategy_id,
      versionNumber: context.version.version_number,
      config: asJsonObject(context.version.config_json),
      assumptions: asJsonObject(context.version.assumptions_json),
      feeProfileId: context.version.fee_profile_id,
      createdAt: toIsoDateTime(context.version.created_at),
      createdBy: context.version.created_by,
      isActiveVersion: context.version.is_active_version
    },
    latestRuns: runs.map((run: RunRow) => ({
      runId: `${toNumber(batch.batch_run_id)}:${run.scenario_key}`,
      strategyVersionId: run.strategy_version_id,
      asOfDate: toIsoDate(run.as_of_date),
      generatedAt: toIsoDateTime(run.generated_at),
      status: run.status,
      universeMode: run.universe_mode,
      capitalMode: run.capital_mode,
      snapshotKey: run.scenario_key,
      rowsProcessed: run.rows_processed,
      warningsCount: run.warnings_count,
      errorsCount: run.errors_count
    })),
    chargesModel: CHARGES_MODEL,
    filters: {
      strategies: allStrategies.map((item: StrategyRow) => ({ value: item.strategy_id, label: item.display_name })),
      versions: [{ value: context.version.strategy_version_id, label: `v${context.version.version_number}` }],
      universeModes: [
        { value: "nifty_100", label: "Nifty 100" },
        { value: "single_stock", label: "Single Stock" }
      ],
      capitalModes: [
        { value: "no_capital_limit", label: "No Capital Limit" },
        { value: "capital_16l", label: "₹16L / ₹2L tickets / max 8" },
        { value: "capital_10l", label: "10L" },
        { value: "capital_20l", label: "20L" },
        { value: "capital_50l", label: "50L" }
      ],
      dateRanges: [{ value: "3y", label: "Last 3 years" }],
      stocks: stockOptions
    },
    defaultScenarioKey: scenario.scenarioKey,
    scenarioOptions,
    scenarios: {
      [scenario.scenarioKey]: scenario
    }
  };
}

export async function loadPublishedBacktestingDailySummary(prisma: PrismaClient) {
  const detail = await loadPublishedBacktestingStrategyDetail(prisma, DEFAULT_STRATEGY_ID, DEFAULT_SCENARIO_KEY);
  if (!detail) return null;
  const scenario = detail.scenarios[detail.defaultScenarioKey];
  const dailyEquity = scenario.equityCurve;
  const lastPoint = dailyEquity[dailyEquity.length - 1];
  const prevPoint = dailyEquity[dailyEquity.length - 2];
  return {
    generatedAt: detail.generatedAt,
    asOfDate: detail.asOfDate,
    latestEntries: [...scenario.trades]
      .sort((left, right) => right.entryDate.localeCompare(left.entryDate))
      .slice(0, 3)
      .map((trade: { symbol: string; entryDate: string; returnPct: number }) => ({ symbol: trade.symbol, entryDate: trade.entryDate, returnPct: trade.returnPct })),
    latestExits: [...scenario.trades]
      .filter((trade: { exitDate: string | null }) => trade.exitDate)
      .sort((left, right) => String(right.exitDate).localeCompare(String(left.exitDate)))
      .slice(0, 3)
      .map((trade: { symbol: string; exitDate: string | null; exitReason: string; returnPct: number }) => ({ symbol: trade.symbol, exitDate: trade.exitDate, exitReason: trade.exitReason, returnPct: trade.returnPct })),
    currentOpenPositions: scenario.openPositions,
    skippedSignals: scenario.skippedSignals.slice(0, 8),
    deployment: {
      openPositions: scenario.summary.openPositions,
      exposurePct: scenario.summary.exposurePct,
      dailyPortfolioDelta: lastPoint && prevPoint ? Number((lastPoint.strategyValue - prevPoint.strategyValue).toFixed(2)) : 0,
      dailyBenchmarkDelta:
        lastPoint && prevPoint && lastPoint.benchmarkValue != null && prevPoint.benchmarkValue != null
          ? Number((lastPoint.benchmarkValue - prevPoint.benchmarkValue).toFixed(2))
          : 0
    }
  };
}

export async function loadPublishedBacktestingCompare(prisma: PrismaClient) {
  const batch = await loadLatestPublishedBatch(prisma);
  if (!batch) return null;
  const batchRunId = toNumber(batch.batch_run_id);
  const [compareRows, dailyRows, regimeRows, stockRows] = await Promise.all([
    prisma.$queryRaw<CompareMartRow[]>(Prisma.sql`
      SELECT
        c.strategy_version_id,
        c.scenario_key,
        c.strategy_id,
        c.display_name,
        c.archetype,
        c.universe_mode,
        c.capital_mode,
        c.as_of_date,
        c.compare_json,
        v.version_number,
        s.strategy_slug
      FROM nse_app.backtest_compare_summary_mart c
      JOIN nse_app.backtest_strategy_version v
        ON v.strategy_version_id = c.strategy_version_id
      JOIN nse_app.backtest_strategy s
        ON s.strategy_id = c.strategy_id
      WHERE c.batch_run_id = ${batchRunId}
        AND c.universe_mode = 'nifty_100'
      ORDER BY c.capital_mode ASC, c.display_name ASC
    `),
    prisma.$queryRaw<Array<DailyEquityRow & { strategy_version_id: string; scenario_key: string }>>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, trade_date, active_positions, deployed_capital, available_cash, market_value, total_equity, benchmark_value, daily_return_pct, drawdown_pct
      FROM nse_app.backtest_daily_equity
      WHERE batch_run_id = ${batchRunId}
        AND scenario_key LIKE 'nifty_100:%'
      ORDER BY trade_date ASC
    `),
    prisma.$queryRaw<RegimeSummaryMartRow[]>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, regime_label, summary_json
      FROM nse_app.backtest_regime_summary_mart
      WHERE batch_run_id = ${batchRunId}
        AND scenario_key LIKE 'nifty_100:%'
    `),
    prisma.$queryRaw<StockSummaryMartRow[]>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, symbol, summary_json
      FROM nse_app.backtest_stock_summary_mart
      WHERE batch_run_id = ${batchRunId}
        AND scenario_key LIKE 'nifty_100:%'
    `)
  ]);

  const rows = compareRows.map((row: CompareMartRow) => {
    const compare = mapCompareJson(row.compare_json);
    return {
      strategyId: row.strategy_id,
      strategySlug: row.strategy_slug,
      displayName: row.display_name,
      archetype: row.archetype,
      versionNumber: row.version_number,
      universeMode: row.universe_mode,
      capitalMode: row.capital_mode,
      stock: null,
      currentValue: compare.currentValue,
      realizedPnl: compare.realizedPnl,
      unrealizedPnl: compare.unrealizedPnl,
      totalReturnPct: compare.totalReturnPct,
      excessOverFd: compare.excessOverFd,
      winRatePct: compare.winRatePct,
      totalClosedTrades: compare.totalClosedTrades,
      openPositions: compare.openPositions,
      maxDrawdownPct: compare.maxDrawdownPct,
      avgHoldDays: compare.avgHoldDays,
      minHoldDays: compare.minHoldDays,
      maxHoldDays: compare.maxHoldDays,
      totalCharges: compare.totalCharges,
      exposurePct: compare.avgExposurePct,
      avgExposurePct: compare.avgExposurePct,
      latestSnapshotAge: "Published daily snapshot",
      regimeStrengthSummary: compare.regimeStrengthSummary,
      topPerformingStock: compare.topPerformingStock,
      worstPerformingStock: compare.worstPerformingStock
    };
  });

  const equityCurves = compareRows.map((row: CompareMartRow) => {
    const points = dailyRows.filter((item: DailyEquityRow & { strategy_version_id: string; scenario_key: string }) => item.strategy_version_id === row.strategy_version_id && item.scenario_key === row.scenario_key);
    const base = toNumber(points[0]?.total_equity, 1) || 1;
    return {
      strategyId: row.strategy_id,
      displayName: row.display_name,
      archetype: row.archetype,
      universeMode: row.universe_mode,
      capitalMode: row.capital_mode,
      points: points.map((point: DailyEquityRow & { strategy_version_id: string; scenario_key: string }) => ({
        date: toIsoDate(point.trade_date),
        strategyValue: Number(((toNumber(point.total_equity) / base) * 100).toFixed(2)),
        benchmarkValue: point.benchmark_value == null ? null : Number(((toNumber(point.benchmark_value) / (toNumber(points[0]?.benchmark_value, 1) || 1)) * 100).toFixed(2))
      }))
    };
  });

  const regimeCompare = compareRows.map((row: CompareMartRow) => ({
    strategyId: row.strategy_id,
    displayName: row.display_name,
    archetype: row.archetype,
    universeMode: row.universe_mode,
    capitalMode: row.capital_mode,
    regimes: regimeRows
      .filter((item: RegimeSummaryMartRow) => item.strategy_version_id === row.strategy_version_id && item.scenario_key === row.scenario_key)
      .map((item: RegimeSummaryMartRow) => {
        const summary = asJsonObject(item.summary_json);
        return {
          regime: item.regime_label,
          tradeCount: toNumber(summary.trade_count),
          winRatePct: toNumber(summary.win_rate_pct),
          avgReturnPct: toNumber(summary.avg_return_pct),
          medianReturnPct: toNumber(summary.median_return_pct),
          maxDrawdownContributionPct: toNumber(summary.max_drawdown_contribution_pct),
          avgHoldDays: toNumber(summary.avg_hold_days),
          totalCharges: toNumber(summary.total_charges)
        };
      })
  }));

  const stockSuitability = stockRows.map((row: StockSummaryMartRow) => {
    const summary = asJsonObject(row.summary_json);
    const compareRow = compareRows.find((item: CompareMartRow) => item.strategy_version_id === row.strategy_version_id && item.scenario_key === row.scenario_key);
    return {
      strategyId: compareRow?.strategy_id ?? "",
      displayName: compareRow?.display_name ?? "",
      archetype: compareRow?.archetype ?? "custom",
      universeMode: compareRow?.universe_mode ?? "nifty_100",
      capitalMode: compareRow?.capital_mode ?? "capital_16l",
      symbol: row.symbol,
      signalCount: toNumber(summary.signal_count),
      acceptedTrades: toNumber(summary.accepted_trades),
      skippedTrades: toNumber(summary.skipped_trades),
      winRatePct: toNumber(summary.win_rate_pct),
      avgReturnPct: toNumber(summary.avg_return_pct),
      medianReturnPct: toNumber(summary.median_return_pct),
      totalNetPnl: toNumber(summary.total_net_pnl),
      bestRegime: String(summary.best_regime ?? "Neutral"),
      worstRegime: String(summary.worst_regime ?? "Neutral"),
      lastSignalDate: toIsoDate(summary.last_signal_date as string | Date | null | undefined),
      openPosition: Boolean(summary.open_position_flag)
    };
  });

  return {
    generatedAt: toIsoDateTime(batch.generated_at),
    asOfDate: toIsoDate(batch.data_as_of_date),
    rows,
    equityCurves,
    regimeCompare,
    stockSuitability,
    capitalSensitivity: rows
      .filter((row: typeof rows[number]) => row.capitalMode !== "no_capital_limit")
      .map((row: typeof rows[number]) => ({
        strategyId: row.strategyId,
        displayName: row.displayName,
        archetype: row.archetype,
        capitalMode: row.capitalMode,
        totalReturnPct: row.totalReturnPct,
        excessOverFd: row.excessOverFd,
        maxDrawdownPct: row.maxDrawdownPct,
        winRatePct: row.winRatePct,
        currentValue: row.currentValue
      }))
  };
}

export async function loadPublishedBacktestingRuns(prisma: PrismaClient) {
  const batch = await loadLatestPublishedBatch(prisma);
  if (!batch) return null;
  const batchRunId = toNumber(batch.batch_run_id);
  const [runs, validations] = await Promise.all([
    prisma.$queryRaw<RunRow[]>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, scenario_label, universe_mode, capital_mode, stock_symbol, as_of_date, generated_at, status, rows_processed, warnings_count, errors_count, summary_json
      FROM nse_app.backtest_run
      WHERE batch_run_id = ${batchRunId}
      ORDER BY generated_at DESC, scenario_key ASC
    `),
    prisma.$queryRaw<Array<{ strategy_version_id: string; scenario_key: string | null; validation_name: string; status: string; details_json: Prisma.JsonValue; created_at: Date | string }>>(Prisma.sql`
      SELECT strategy_version_id, scenario_key, validation_name, status, details_json, created_at
      FROM nse_app.backtest_run_validation
      WHERE batch_run_id = ${batchRunId}
      ORDER BY created_at DESC
      LIMIT 100
    `)
  ]);
  return {
    generatedAt: toIsoDateTime(batch.generated_at),
    asOfDate: toIsoDate(batch.data_as_of_date),
    runs: runs.map((run: RunRow) => ({
      ...(summary => ({
        symbolsCovered: toNumber(summary.symbolsCovered ?? summary.symbols_covered),
        tradeCount: toNumber(summary.totalClosedTrades ?? summary.tradeCount),
        netPnl: toNumber(summary.preTaxRealizedPnl ?? summary.realizedPnl),
        taxDeducted: toNumber(summary.taxDeducted),
        afterTaxNetPnl: toNumber(summary.afterTaxRealizedPnl ?? summary.realizedPnl),
        benchmarkLabel: String(summary.benchmarkLabel ?? "NIFTY 50 price index")
      }))(asJsonObject(run.summary_json)),
      runId: `${batchRunId}:${run.scenario_key}`,
      strategyVersionId: run.strategy_version_id,
      asOfDate: toIsoDate(run.as_of_date),
      generatedAt: toIsoDateTime(run.generated_at),
      status: run.status,
      universeMode: run.universe_mode,
      capitalMode: run.capital_mode,
      snapshotKey: run.scenario_key,
      rowsProcessed: run.rows_processed,
      warningsCount: run.warnings_count,
      errorsCount: run.errors_count
    })),
    validations: validations.map((row: { strategy_version_id: string; scenario_key: string | null; validation_name: string; status: string; details_json: Prisma.JsonValue; created_at: Date | string }) => ({
      runId: `${batchRunId}:${row.scenario_key ?? "batch"}`,
      validationName: row.validation_name,
      status: row.status,
      details: asJsonObject(row.details_json),
      createdAt: toIsoDateTime(row.created_at)
    })),
    lastKnownGoodSnapshot: {
      key: "backtesting_precompute",
      generatedAt: toIsoDateTime(batch.generated_at),
      asOfDate: toIsoDate(batch.data_as_of_date)
    }
  };
}
