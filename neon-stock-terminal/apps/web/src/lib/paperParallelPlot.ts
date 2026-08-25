export type PaperParallelTrade = Record<string, unknown>;

export type PaperParallelAxisId =
  | "O_FACTOR"
  | "X_FACTOR"
  | "RSI14"
  | "ATR14"
  | "WILLIAMS14"
  | "RELATIVE_VOLUME"
  | "ENTRY_PRICE"
  | "ENTRY_VS_REFERENCE"
  | "INTRADAY_MAX_PROFIT"
  | "SWING_TARGET_PROFIT"
  | "FIVE_DAY_MAX_PROFIT"
  | "THIRTY_DAY_MAX_PROFIT";

export interface PaperParallelAxis {
  id: PaperParallelAxisId;
  label: string;
  shortLabel: string;
  unit: "NUMBER" | "PERCENT" | "INR";
  field?: string;
  bounds?: readonly [number, number];
  value: (trade: PaperParallelTrade) => number | null;
}

export interface PaperParallelRow {
  trade: PaperParallelTrade;
  id: string;
  symbol: string;
  strategy: string;
  direction: string;
  values: Record<PaperParallelAxisId, number | null>;
  availableDimensions: number;
}

export const finitePaperValue = (value: unknown) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function fixedIntradayProfit(trade: PaperParallelTrade) {
  const result = finitePaperValue(trade.intraday_max_profit);
  const capturedQuantity = finitePaperValue(trade.opened_quantity);
  const fixedQuantity = finitePaperValue(trade.fixed_investment_quantity);
  if (result == null || capturedQuantity == null || capturedQuantity <= 0 || fixedQuantity == null || fixedQuantity <= 0) return null;
  return result / capturedQuantity * fixedQuantity;
}

function swingTargetProfit(trade: PaperParallelTrade) {
  const targets = Array.isArray(trade.targets) ? trade.targets as PaperParallelTrade[] : [];
  const eligible = targets.filter((target) => String(target.lifecycle ?? "").toUpperCase() === "SWING");
  if (!eligible.length) return null;
  const entry = finitePaperValue(trade.average_entry_price);
  const quantity = finitePaperValue(trade.fixed_investment_quantity);
  if (entry == null || entry <= 0 || quantity == null || quantity <= 0) return null;
  const direction = String(trade.side ?? "BUY").toUpperCase() === "SELL" ? -1 : 1;
  const hits = eligible.filter((target) => ["HIT", "CLOSED_AT_TARGET"].includes(String(target.status ?? "").toUpperCase()));
  if (!hits.length) return 0;
  return Math.max(...hits.map((target) => {
    const price = finitePaperValue(target.target_price);
    return price == null ? 0 : direction * (price - entry) * quantity;
  }));
}

function entryVsReference(trade: PaperParallelTrade) {
  const entry = finitePaperValue(trade.average_entry_price);
  const reference = finitePaperValue(trade.evidence_reference_price);
  if (entry == null || reference == null || reference <= 0) return null;
  const direction = String(trade.side ?? "BUY").toUpperCase() === "SELL" ? -1 : 1;
  return direction * (entry - reference) / reference * 100;
}

const fieldValue = (field: string) => (trade: PaperParallelTrade) => finitePaperValue(trade[field]);

export const paperParallelAxes: PaperParallelAxis[] = [
  { id: "O_FACTOR", label: "Opportunity factor", shortLabel: "O", unit: "NUMBER", field: "evidence_ofactor", bounds: [0, 100], value: fieldValue("evidence_ofactor") },
  { id: "X_FACTOR", label: "Execution factor", shortLabel: "X", unit: "NUMBER", field: "evidence_xfactor", bounds: [0, 100], value: fieldValue("evidence_xfactor") },
  { id: "RSI14", label: "Entry RSI14", shortLabel: "RSI", unit: "NUMBER", field: "evidence_rsi14", bounds: [0, 100], value: fieldValue("evidence_rsi14") },
  { id: "ATR14", label: "Entry ATR14", shortLabel: "ATR", unit: "NUMBER", field: "evidence_atr14", value: fieldValue("evidence_atr14") },
  { id: "WILLIAMS14", label: "Entry Williams %R", shortLabel: "W%R", unit: "NUMBER", field: "evidence_willr14", bounds: [-100, 0], value: fieldValue("evidence_willr14") },
  { id: "RELATIVE_VOLUME", label: "Volume / SMA20", shortLabel: "RVOL", unit: "NUMBER", field: "evidence_volume_ratio", value: fieldValue("evidence_volume_ratio") },
  { id: "ENTRY_PRICE", label: "Entry price", shortLabel: "Entry ₹", unit: "INR", field: "average_entry_price", value: fieldValue("average_entry_price") },
  { id: "ENTRY_VS_REFERENCE", label: "Entry vs OIIS reference", shortLabel: "Entry Δ", unit: "PERCENT", value: entryVsReference },
  { id: "INTRADAY_MAX_PROFIT", label: "D0 maximum profit · ₹2L", shortLabel: "D0 max", unit: "INR", value: fixedIntradayProfit },
  { id: "SWING_TARGET_PROFIT", label: "Highest swing target profit · ₹2L", shortLabel: "Swing", unit: "INR", value: swingTargetProfit },
  { id: "FIVE_DAY_MAX_PROFIT", label: "Five-session maximum profit · ₹2L", shortLabel: "5D max", unit: "INR", field: "fixed_investment_mfe_5d_pnl", value: fieldValue("fixed_investment_mfe_5d_pnl") },
  { id: "THIRTY_DAY_MAX_PROFIT", label: "Thirty-session maximum profit · ₹2L", shortLabel: "30D max", unit: "INR", field: "fixed_investment_mfe_30d_pnl", value: fieldValue("fixed_investment_mfe_30d_pnl") },
];

export function buildPaperParallelRows(trades: PaperParallelTrade[]) {
  return trades.map((trade) => {
    const values = Object.fromEntries(paperParallelAxes.map((axis) => [axis.id, axis.value(trade)])) as Record<PaperParallelAxisId, number | null>;
    return {
      trade,
      id: String(trade.trade_group_id ?? `${String(trade.symbol ?? "UNKNOWN")}-${String(trade.opened_at ?? "")}`),
      symbol: String(trade.symbol ?? "UNKNOWN"),
      strategy: String(trade.entry_strategy ?? trade.strategy_id ?? "UNSPECIFIED"),
      direction: String(trade.side ?? "UNKNOWN").toUpperCase(),
      values,
      availableDimensions: Object.values(values).filter((value) => value != null).length,
    } satisfies PaperParallelRow;
  });
}

function niceStep(raw: number, minimumStep: number) {
  if (!Number.isFinite(raw) || raw <= 0) return minimumStep;
  const power = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / power;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
  return Math.max(minimumStep, step);
}

/** Paper charts use at least one display unit between adjacent Y-axis ticks. */
export function minimumOneAxisScale(values: number[], bounds?: readonly [number, number], targetIntervals = 4) {
  const available = values.filter(Number.isFinite);
  let low = bounds?.[0] ?? Math.min(...available);
  let high = bounds?.[1] ?? Math.max(...available);
  if (!available.length && !bounds) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  const step = niceStep((high - low) / Math.max(1, targetIntervals), 1);
  if (!bounds) {
    low = Math.floor(low / step) * step;
    high = Math.ceil(high / step) * step;
  }
  if (high <= low) high = low + step;
  const ticks: number[] = [];
  for (let value = low, guard = 0; value <= high + step * .001 && guard < 101; value += step, guard += 1) ticks.push(Number(value.toFixed(8)));
  return { min: low, max: high, step, ticks };
}

