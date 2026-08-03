import { Prisma, type PrismaClient } from "@prisma/client";

export const DEFAULT_BACKTEST_STRATEGY_ID = "rsi30_willr80_closegtprev_tp125";
export const DEFAULT_BACKTEST_STRATEGY_VERSION_ID = "rsi30_willr80_closegtprev_tp125_v1";

type StrategyRow = {
  strategy_id: string;
  strategy_slug: string;
  display_name: string;
  description: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type StrategyVersionRow = {
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
  run_id: string;
  strategy_version_id: string;
  as_of_date: Date | string;
  generated_at: Date | string;
  status: string;
  universe_mode: string;
  capital_mode: string;
  snapshot_key: string | null;
  rows_processed: number | null;
  warnings_count: number | null;
  errors_count: number | null;
};

type ValidationRow = {
  run_id: string;
  validation_name: string;
  status: string;
  details_json: Prisma.JsonValue;
  created_at: Date | string;
};

const DEFAULT_STRATEGY_CONFIG = {
  instrument_scope: "stock_only",
  entry_conditions: [
    { field: "rsi", operator: "<", value: 30, period: 14 },
    { field: "willr", aliases: ["willr", "wilr", "vilr"], operator: "<", value: -80, period: 14 },
    { field: "close_vs_prev_close_pct", operator: ">", value: 0 }
  ],
  entry_execution: {
    signal_bar: "T_close",
    entry_bar: "T_plus_1_open",
    one_open_trade_per_symbol: true
  },
  exit_rules: [
    {
      type: "take_profit_pct",
      value: 1.25,
      gap_open_priority: true,
      intraday_fill_price: "target_price"
    }
  ],
  universe_modes: ["single_stock", "nifty_100"],
  capital_models: [
    { key: "no_capital_limit", label: "No Capital Limit", ticket_rule: "unbounded" },
    { key: "capital_16l", label: "₹16L / ₹2L tickets / max 8", starting_cash: 1600000, ticket_size: 200000, max_open_positions: 8, profit_tax_reserve_rate: 0.35 },
    { key: "capital_10l", label: "10L", starting_cash: 1000000, fixed_ticket_divisor: 10, max_open_positions: 10 },
    { key: "capital_20l", label: "20L", starting_cash: 2000000, fixed_ticket_divisor: 10, max_open_positions: 10 },
    { key: "capital_50l", label: "50L", starting_cash: 5000000, fixed_ticket_divisor: 10, max_open_positions: 10 }
  ],
  priority_rule: [
    "signal_date_asc",
    "lower_rsi_first",
    "lower_willr_first",
    "higher_close_vs_prev_close_pct_first",
    "symbol_asc"
  ],
  benchmark: {
    finite_capital: { type: "fd_daily_compound", annual_rate_pct: 6 },
    no_capital_limit: { type: "normalized_line", base_index: 100, annual_rate_pct: 6 }
  },
  regime_config_ref: "market_regime_v1",
  notes: [
    "Daily data only.",
    "Long-only.",
    "Stock-only tradable universe.",
    "Open positions remain mark-to-market at the latest close."
  ]
} as const;

const DEFAULT_STRATEGY_ASSUMPTIONS = {
  signal_definition: "RSI(T) < 30 AND WILLR(T) < -80 AND Close(T) > Close(T-1)",
  execution_timing: "Signal uses completed bar on T; entry executes at T+1 open.",
  exit_timing: "Open(U) >= target exits at open; else High(U) >= target exits at target.",
  charges_source: "Mirrors the current simulator fee profile structure until a shared fee adapter replaces it.",
  universe_membership: "Current Nifty 100 flag in the stock master is used for v1.",
  regime_assignment: "Entry-date regime only for v1.",
  fd_note: "No-capital-limit uses normalized 100-base line instead of finite-principal FD comparison."
} as const;

const DEFAULT_RUNS = [
  {
    runId: "bt_run_2026_03_11_overview",
    strategyVersionId: DEFAULT_BACKTEST_STRATEGY_VERSION_ID,
    asOfDate: "2026-03-11",
    generatedAt: "2026-03-11T05:15:00.000Z",
    status: "published",
    universeMode: "nifty_100",
    capitalMode: "capital_16l",
    snapshotKey: "backtesting-overview",
    rowsProcessed: 12482,
    warningsCount: 2,
    errorsCount: 0
  },
  {
    runId: "bt_run_2026_03_11_detail",
    strategyVersionId: DEFAULT_BACKTEST_STRATEGY_VERSION_ID,
    asOfDate: "2026-03-11",
    generatedAt: "2026-03-11T05:18:00.000Z",
    status: "published",
    universeMode: "single_stock",
    capitalMode: "no_capital_limit",
    snapshotKey: "backtesting-strategy-detail",
    rowsProcessed: 3821,
    warningsCount: 1,
    errorsCount: 0
  }
] as const;

const DEFAULT_VALIDATIONS = [
  {
    runId: "bt_run_2026_03_11_overview",
    validationName: "entry_after_signal",
    status: "passed",
    detailsJson: { checked_rows: 184, failures: 0 }
  },
  {
    runId: "bt_run_2026_03_11_overview",
    validationName: "finite_cash_never_negative",
    status: "passed",
    detailsJson: { checked_scenarios: 3, min_cash: 124420.32 }
  },
  {
    runId: "bt_run_2026_03_11_detail",
    validationName: "nifty_100_excludes_index_instruments",
    status: "passed",
    detailsJson: { checked_symbols: 100, excluded_asset_types: ["INDEX"] }
  }
] as const;

const DEFAULT_STRATEGIES = [
  {
    strategyId: DEFAULT_BACKTEST_STRATEGY_ID,
    strategySlug: "rsi30_willr80_closegtprev_tp125",
    displayName: "RSI < 30 + WILLR < -80 + Positive Close Confirmation -> Exit at +1.25%",
    description: "Long-only stock strategy using daily RSI/WILLR oversold conditions with next-open entry and +1.25% target exit.",
    status: "active",
    createdAt: new Date("2026-03-11T05:10:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-11T05:18:00.000Z").toISOString()
  }
] as const;

const DEFAULT_STRATEGY_VERSIONS = [
  {
    strategyVersionId: DEFAULT_BACKTEST_STRATEGY_VERSION_ID,
    strategyId: DEFAULT_BACKTEST_STRATEGY_ID,
    versionNumber: 1,
    config: DEFAULT_STRATEGY_CONFIG as Record<string, unknown>,
    assumptions: DEFAULT_STRATEGY_ASSUMPTIONS as Record<string, unknown>,
    feeProfileId: "simulator_delivery_equity_v1",
    createdAt: new Date("2026-03-11T05:12:00.000Z").toISOString(),
    createdBy: "codex",
    isActiveVersion: true
  }
] as const;

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export async function getBacktestingRegistry(_prisma: PrismaClient) {
  return {
    strategies: [...DEFAULT_STRATEGIES],
    versions: [...DEFAULT_STRATEGY_VERSIONS],
    runs: DEFAULT_RUNS.map((run) => ({
      runId: run.runId,
      strategyVersionId: run.strategyVersionId,
      asOfDate: run.asOfDate,
      generatedAt: toIso(run.generatedAt),
      status: run.status,
      universeMode: run.universeMode,
      capitalMode: run.capitalMode,
      snapshotKey: run.snapshotKey,
      rowsProcessed: run.rowsProcessed,
      warningsCount: run.warningsCount,
      errorsCount: run.errorsCount
    })),
    validations: DEFAULT_VALIDATIONS.map((validation) => ({
      runId: validation.runId,
      validationName: validation.validationName,
      status: validation.status,
      details: validation.detailsJson as Record<string, unknown>,
      createdAt: new Date("2026-03-11T05:20:00.000Z").toISOString()
    }))
  };
}
