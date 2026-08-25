export type PaperAccountingClass =
  | "BOOKED"
  | "OPEN_ACTUAL"
  | "OBSERVED"
  | "HYPOTHETICAL"
  | "SIMULATED"
  | "DATA_QUALITY";

export type PaperMetricUnit =
  | "INR"
  | "PERCENT"
  | "COUNT"
  | "SHARES"
  | "SESSIONS"
  | "DATETIME"
  | "RATIO"
  | "TEXT";

export interface PaperMetricDefinition {
  id: string;
  label: string;
  shortLabel?: string;
  description: string;
  plainLanguageMeaning: string;
  formula?: string;
  sourceFields: string[];
  unit: PaperMetricUnit;
  precision?: number;
  accountingClass: PaperAccountingClass;
  timeBasis?: string;
  capitalBasis?: string;
  costBasis: "GROSS" | "NET" | "MIXED" | "NOT_APPLICABLE";
  eligibilityRule?: string;
  denominatorDefinition?: string;
  caveats?: string[];
  dataSource: string;
  policyVersion?: string;
  relatedMetricIds?: string[];
}

const metric = (definition: PaperMetricDefinition) => definition;

export const PAPER_METRIC_DEFINITIONS = {
  bookedRealisedNet: metric({ id: "booked_realised_net", label: "Booked realised net", description: "Net execution profit or loss posted for governed exits.", plainLanguageMeaning: "Money already booked by closed paper fills after the modelled costs and tax provision.", formula: "SUM(position.realised_pnl)", sourceFields: ["realised_net_pnl", "summary.realised_pnl"], unit: "INR", precision: 2, accountingClass: "BOOKED", timeBasis: "Governed execution close", capitalBasis: "Captured execution quantity", costBasis: "NET", dataSource: "paper_trading.positions", policyVersion: "POSITION_AWARE_V2" }),
  realisedGross: metric({ id: "realised_gross", label: "Realised gross", description: "Booked execution result before costs and tax provision.", plainLanguageMeaning: "Closed-fill profit or loss before deductions.", formula: "SUM(pnl_ledger.amount WHERE entry_kind = REALISED_GROSS)", sourceFields: ["realised_gross_pnl"], unit: "INR", precision: 2, accountingClass: "BOOKED", timeBasis: "Governed execution close", capitalBasis: "Captured execution quantity", costBasis: "GROSS", dataSource: "paper_trading.pnl_ledger" }),
  openUnrealisedGross: metric({ id: "open_unrealised_gross", label: "Open unrealised gross", description: "Current gross mark-to-market for execution quantity that remains open.", plainLanguageMeaning: "What still-open paper positions would gain or lose at the latest accepted mark, before exit costs.", formula: "SUM(position.unrealised_pnl)", sourceFields: ["open_unrealised_gross_pnl", "summary.unrealised_pnl"], unit: "INR", precision: 2, accountingClass: "OPEN_ACTUAL", timeBasis: "Latest accepted market mark", capitalBasis: "Remaining execution quantity", costBasis: "GROSS", eligibilityRule: "remaining_quantity > 0 and a valid mark exists", dataSource: "paper_trading.positions" }),
  actualPnl: metric({ id: "actual_pnl", label: "Execution economics", description: "Compatibility view of realised net plus open unrealised gross.", plainLanguageMeaning: "A mixed-basis bridge for a trade; its booked and open lanes must still be inspected separately.", formula: "realised_net_pnl + open_unrealised_gross_pnl", sourceFields: ["actual_pnl"], unit: "INR", precision: 2, accountingClass: "OPEN_ACTUAL", timeBasis: "Booked exits plus latest open mark", capitalBasis: "Captured execution quantity", costBasis: "MIXED", caveats: ["Do not present this mixed-basis bridge as a single booked total."], dataSource: "paper workspace projection", relatedMetricIds: ["booked_realised_net", "open_unrealised_gross"] }),
  d0EodPnl: metric({ id: "d0_eod_pnl", label: "D0 15:30 hypothetical P/L", shortLabel: "D0 15:30", description: "Counterfactual entry-session result at the final canonical one-minute mark.", plainLanguageMeaning: "What the captured quantity would have made or lost at the entry session close, independent of the governed execution exit.", formula: "direction × (D0 15:30 close − entry price) × opened quantity", sourceFields: ["intraday_eod_mark", "average_entry_price", "opened_quantity", "intraday_eod_pnl"], unit: "INR", precision: 2, accountingClass: "HYPOTHETICAL", timeBasis: "D0 final canonical 1-minute bar at 15:30 IST", capitalBasis: "Captured execution quantity", costBasis: "GROSS", eligibilityRule: "entry-session EOD mark is complete", dataSource: "public.bars_1m", policyVersion: "POSITION_AWARE_V2" }),
  intradayMaxProfit: metric({ id: "intraday_max_profit", label: "D0 maximum observed reward", description: "Largest direction-normalised favourable move during the entry session.", plainLanguageMeaning: "The best observed D0 path value, not necessarily an executable exit.", formula: "max(0, direction-normalised session extreme − entry) × quantity", sourceFields: ["intraday_session_high", "intraday_session_low", "intraday_max_profit"], unit: "INR", precision: 2, accountingClass: "OBSERVED", timeBasis: "D0 entry session", capitalBasis: "Captured execution quantity", costBasis: "GROSS", caveats: ["Candle extremes do not prove fillability at the extreme."], dataSource: "public.bars_1m" }),
  mfe5d: metric({ id: "mfe_5d", label: "Five-session MFE", description: "Maximum favourable excursion within the first five trading sessions.", plainLanguageMeaning: "Best direction-normalised move observed from entry through D+5.", formula: "direction-normalised maximum high/low return from entry", sourceFields: ["mfe_5d_pct", "fixed_investment_mfe_5d_pnl"], unit: "PERCENT", precision: 2, accountingClass: "OBSERVED", timeBasis: "Entry through five exchange sessions; freezes at maturity", capitalBasis: "Entry price return; optional ₹2 lakh scale", costBasis: "GROSS", eligibilityRule: "observation bars exist", dataSource: "paper_trading.horizon_outcomes" }),
  mae5d: metric({ id: "mae_5d", label: "Five-session MAE", description: "Maximum adverse excursion within the first five trading sessions.", plainLanguageMeaning: "Deepest direction-normalised loss observed from entry through D+5.", formula: "direction-normalised minimum high/low return from entry", sourceFields: ["mae_5d_pct", "fixed_investment_mae_5d_pnl"], unit: "PERCENT", precision: 2, accountingClass: "OBSERVED", timeBasis: "Entry through five exchange sessions; freezes at maturity", capitalBasis: "Entry price return; optional ₹2 lakh scale", costBasis: "GROSS", eligibilityRule: "observation bars exist", dataSource: "paper_trading.horizon_outcomes" }),
  mfe30d: metric({ id: "mfe_30d", label: "Thirty-session MFE", description: "Maximum favourable excursion in the inclusive D0–D30 path.", plainLanguageMeaning: "Best observed move while the thirty-session evidence window remains active.", formula: "direction-normalised maximum return over the inclusive D0–D30 window", sourceFields: ["mfe_30d_pct", "fixed_investment_mfe_30d_pnl"], unit: "PERCENT", precision: 2, accountingClass: "OBSERVED", timeBasis: "Inclusive D0–D30 exchange sessions", capitalBasis: "Entry price return; optional ₹2 lakh scale", costBasis: "GROSS", dataSource: "paper_trading.observation_trackers / horizon_outcomes" }),
  mae30d: metric({ id: "mae_30d", label: "Thirty-session MAE", description: "Maximum adverse excursion in the inclusive D0–D30 path.", plainLanguageMeaning: "Deepest observed adverse move while the thirty-session evidence window remains active.", formula: "direction-normalised minimum return over the inclusive D0–D30 window", sourceFields: ["mae_30d_pct", "fixed_investment_mae_30d_pnl"], unit: "PERCENT", precision: 2, accountingClass: "OBSERVED", timeBasis: "Inclusive D0–D30 exchange sessions", capitalBasis: "Entry price return; optional ₹2 lakh scale", costBasis: "GROSS", dataSource: "paper_trading.observation_trackers / horizon_outcomes" }),
  targetState: metric({ id: "target_state", label: "Target outcome", description: "Eligibility and first-hit state for a versioned target definition.", plainLanguageMeaning: "Whether the target was hit inside its allowed window, failed when that window closed, or is still open.", formula: "target track status and first_hit_at", sourceFields: ["targets.lifecycle", "targets.target_pct", "targets.status", "targets.first_hit_at"], unit: "TEXT", accountingClass: "OBSERVED", timeBasis: "Versioned intraday or swing eligibility window", capitalBasis: "Not applicable", costBasis: "NOT_APPLICABLE", denominatorDefinition: "Only activated target tracks are eligible", dataSource: "paper_trading.target_tracks / target_hits" }),
  neverClosedCarry: metric({ id: "never_closed_carry", label: "Never-closed carry", description: "Counterfactual P/L if the original quantity had never been closed.", plainLanguageMeaning: "A what-if path marked from entry to the latest accepted quote; it is not booked execution.", formula: "direction × (latest carry mark − entry price) × opened quantity", sourceFields: ["hypothetical_carry_mark", "hypothetical_carry_pnl"], unit: "INR", precision: 2, accountingClass: "HYPOTHETICAL", timeBasis: "Entry to latest accepted carry mark", capitalBasis: "Original captured quantity", costBasis: "GROSS", eligibilityRule: "valid entry and carry mark", caveats: ["Ignores governed exits and hypothetical exit costs."], dataSource: "public.instrument_state with position-mark fallback" }),
  stopSimulation: metric({ id: "stop_simulation", label: "₹6,000 stop simulation", description: "Counterfactual exit at the first one-minute breach of a ₹6,000 trade loss boundary.", plainLanguageMeaning: "What the path would show under the configured stop, separate from actual execution.", formula: "first gap-aware 1m breach price; otherwise 30D result/current carry", sourceFields: ["stop_loss_price", "stop_loss_hit_at", "stop_loss_exit_price", "stop_loss_scenario_pnl"], unit: "INR", precision: 2, accountingClass: "HYPOTHETICAL", timeBasis: "First breach through D+30", capitalBasis: "Captured execution quantity", costBasis: "GROSS", caveats: ["Hypothetical exit costs are excluded."], dataSource: "public.bars_1m / paper projection", policyVersion: "POSITION_AWARE_V2" }),
  fixed2lActual: metric({ id: "fixed_2l_actual", label: "Fixed ₹2 lakh scaled actual", description: "Actual trade economics scaled to whole shares purchasable with ₹2 lakh.", plainLanguageMeaning: "A comparison basis, not the captured execution quantity.", formula: "actual P/L per captured unit × floor(₹200,000 / entry price)", sourceFields: ["fixed_investment_quantity", "fixed_investment_actual_pnl"], unit: "INR", precision: 2, accountingClass: "SIMULATED", timeBasis: "Same events as actual execution", capitalBasis: "Fixed ₹2 lakh; whole cash-equity shares", costBasis: "MIXED", dataSource: "paper workspace projection" }),
  fixed10lSimulation: metric({ id: "fixed_10l_simulation", label: "Fixed ₹10 lakh capital recycling", description: "Chronological capital-pool simulation using one entry strategy and configured allocation slots.", plainLanguageMeaning: "A portfolio model that recycles released capital; it is not booked paper-account equity.", formula: "chronological first-eligible allocation and governed simulated exit", sourceFields: ["fixedCapitalPortfolioStrategyComparisons", "fixedCapitalSwingOnlyStrategyComparisons"], unit: "INR", precision: 2, accountingClass: "SIMULATED", timeBasis: "From first eligible trade through as-of", capitalBasis: "Fixed ₹10 lakh portfolio", costBasis: "GROSS", caveats: ["Each entry strategy is simulated in an isolated ledger."], dataSource: "paperCapitalSimulation.ts" }),
  captureEfficiency: metric({ id: "capture_efficiency", label: "Capture efficiency", description: "Actual direction-normalised return divided by observed favourable excursion.", plainLanguageMeaning: "How much of the observed favourable path became actual economics; it does not prove the path maximum was executable.", formula: "actual_return_pct / MFE_pct × 100", sourceFields: ["actual_return_pct", "mfe_5d_pct", "capture_efficiency_pct"], unit: "PERCENT", precision: 2, accountingClass: "OBSERVED", timeBasis: "Selected evidence horizon", capitalBasis: "Return ratio", costBasis: "MIXED", eligibilityRule: "MFE > 0", caveats: ["MFE is path evidence, not necessarily an executable quote."], dataSource: "paper workspace projection" }),
  qualityScore: metric({ id: "quality_score", label: "Trade quality score", description: "Versioned process and outcome evidence score with hard-risk overrides.", plainLanguageMeaning: "A structured evidence grade, not a recommendation.", formula: "weighted criterion ratings; hard-risk gates override the numeric result", sourceFields: ["trade_quality", "quality_score", "quality_label"], unit: "PERCENT", precision: 2, accountingClass: "DATA_QUALITY", timeBasis: "Entry evidence plus currently matured outcome evidence", capitalBasis: "Not applicable", costBasis: "NOT_APPLICABLE", denominatorDefinition: "Only estimable criteria contribute; coverage is shown separately", dataSource: "tradeQuality.ts / trade_quality_reviews", policyVersion: "CASH_EQUITY_TRADE_QUALITY_V1" }),
  dataFreshness: metric({ id: "data_freshness", label: "Data freshness", description: "Age and health of the canonical ledger and dependent market evidence.", plainLanguageMeaning: "Whether the evidence is current enough to trust and which source is delayed or incomplete.", sourceFields: ["asOf", "last_mark_at", "incidents"], unit: "DATETIME", accountingClass: "DATA_QUALITY", timeBasis: "Latest successful source update", capitalBasis: "Not applicable", costBasis: "NOT_APPLICABLE", dataSource: "workspace response and paper_trading.data_quality_incidents" }),
} satisfies Record<string, PaperMetricDefinition>;

export type PaperMetricId = (typeof PAPER_METRIC_DEFINITIONS)[keyof typeof PAPER_METRIC_DEFINITIONS]["id"];

export function paperMetricById(id: string): PaperMetricDefinition | undefined {
  return Object.values(PAPER_METRIC_DEFINITIONS).find((definition) => definition.id === id);
}

export const PAPER_WORKBENCH_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "trade-evidence", label: "Trade Evidence" },
  { id: "path-through-time", label: "Path Through Time" },
  { id: "reward-pain", label: "Reward & Pain" },
  { id: "factor-analysis", label: "Factor Analysis" },
  { id: "capital-recycling", label: "Capital Recycling" },
  { id: "scenario-analysis", label: "Scenario Analysis" },
  { id: "methodology-audit", label: "Methodology & Audit" },
] as const;

export type PaperWorkbenchSection = (typeof PAPER_WORKBENCH_SECTIONS)[number]["id"];

export interface PaperWorkbenchContext {
  section: PaperWorkbenchSection;
  period: "7D" | "30D" | "90D" | "ALL";
  strategy: string;
  status: string;
  direction: "ALL" | "BUY" | "SELL";
  horizon: "Intraday" | "5D" | "30D";
  accounting: PaperAccountingClass | "ALL";
  capital: "FNO_QTY" | "FIXED_2L" | "FIXED_10L" | "ALL";
  basis: "GROSS" | "NET" | "ALL";
}

export const DEFAULT_PAPER_CONTEXT: PaperWorkbenchContext = {
  section: "overview",
  period: "ALL",
  strategy: "ALL",
  status: "ALL",
  direction: "ALL",
  horizon: "5D",
  accounting: "ALL",
  capital: "ALL",
  basis: "ALL",
};

export function parsePaperWorkbenchContext(params: URLSearchParams): PaperWorkbenchContext {
  const section = params.get("section");
  const validSection = PAPER_WORKBENCH_SECTIONS.some((item) => item.id === section);
  const pick = <T extends string>(name: string, values: readonly T[], fallback: T): T => {
    const value = params.get(name) as T | null;
    return value != null && values.includes(value) ? value : fallback;
  };
  return {
    section: validSection ? section as PaperWorkbenchSection : DEFAULT_PAPER_CONTEXT.section,
    period: pick("period", ["7D", "30D", "90D", "ALL"], DEFAULT_PAPER_CONTEXT.period),
    strategy: params.get("strategy") || DEFAULT_PAPER_CONTEXT.strategy,
    status: params.get("status") || DEFAULT_PAPER_CONTEXT.status,
    direction: pick("direction", ["ALL", "BUY", "SELL"], DEFAULT_PAPER_CONTEXT.direction),
    horizon: pick("horizon", ["Intraday", "5D", "30D"], DEFAULT_PAPER_CONTEXT.horizon),
    accounting: pick("accounting", ["ALL", "BOOKED", "OPEN_ACTUAL", "OBSERVED", "HYPOTHETICAL", "SIMULATED", "DATA_QUALITY"], DEFAULT_PAPER_CONTEXT.accounting),
    capital: pick("capital", ["ALL", "FNO_QTY", "FIXED_2L", "FIXED_10L"], DEFAULT_PAPER_CONTEXT.capital),
    basis: pick("basis", ["ALL", "GROSS", "NET"], DEFAULT_PAPER_CONTEXT.basis),
  };
}

export function serializePaperWorkbenchContext(context: PaperWorkbenchContext, existing = new URLSearchParams()): URLSearchParams {
  const result = new URLSearchParams(existing);
  const entries = Object.entries(context) as Array<[keyof PaperWorkbenchContext, string]>;
  for (const [key, value] of entries) {
    if (value === DEFAULT_PAPER_CONTEXT[key]) result.delete(key);
    else result.set(key, value);
  }
  return result;
}

export function paperValueState(value: unknown): "AVAILABLE_ZERO" | "AVAILABLE" | "MISSING" {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "MISSING";
  return Number(value) === 0 ? "AVAILABLE_ZERO" : "AVAILABLE";
}

export function paperPeriodStart(period: PaperWorkbenchContext["period"], now = new Date()): number | null {
  if (period === "ALL") return null;
  const days = Number(period.replace("D", ""));
  return now.getTime() - days * 86_400_000;
}

