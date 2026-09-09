import { istDay } from "./tradingAnalyticsChartView";

type Row = Record<string, unknown>;
type Pane = { identity: Row; bars: Row[] };
export const SCALPER_ENTRY_RULE = "FNO_UNDERLYING_OPTION_CONTEXT_BODY80_NEXT_OPEN_V6";
export type ScalperSignal = {
  id: string;
  direction: "CALL" | "PUT";
  setupTime: string;
  setupClose: number;
  ema: number;
  bodyFraction: number;
  underlyingBodyFraction: number;
  optionBodyFraction: number;
  nextTime: string | null;
  underlyingOpen: number | null;
  optionPremium: number | null;
  optionSymbol: string;
  state: "WAIT_NEXT_OPEN" | "NEXT_BAR_MISSING" | "NEXT_OPEN_FAILED" | "RETROSPECTIVE_ENTRY_REFERENCE";
};

const number = (value: unknown) => {
  const parsed = value == null || value === "" ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const optionSide = (pane: Pane) => {
  const symbol = String(pane.identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : null;
};
const valid = (bar: Row) => [bar.open, bar.close, bar.ema9].every((value) => number(value) != null);
const isRed = (bar: Row) => number(bar.close)! < number(bar.open)!;
const isGreen = (bar: Row) => number(bar.close)! > number(bar.open)!;
const belowEma = (bar: Row) => valid(bar) && number(bar.close)! < number(bar.ema9)!;
const aboveEma = (bar: Row) => valid(bar) && number(bar.close)! > number(bar.ema9)!;
const consecutive = (bars: Row[], intervalMinutes: number) => bars.length === 3 && bars.every((bar, index) => index === 0 || (
  Date.parse(String(bar.end)) - Date.parse(String(bars[index - 1].end)) === intervalMinutes * 60_000 &&
  istDay(bar.end) === istDay(bars[index - 1].end)
));
const aboveBodyFraction = (bar: Row) => {
  const open = number(bar.open)!, close = number(bar.close)!, ema = number(bar.ema9)!;
  const body = close - open;
  return body > 0 && open < ema && ema < close ? (close - ema) / body : null;
};
const belowBodyFraction = (bar: Row) => {
  const open = number(bar.open)!, close = number(bar.close)!, ema = number(bar.ema9)!;
  const body = open - close;
  return body > 0 && close < ema && ema < open ? (ema - close) / body : null;
};
const bullishOptionConfirmation = (bars: Row[]) => {
  if (bars.length !== 3 || bars.some((bar) => !valid(bar))) return null;
  const setup = bars[2];
  // Precursor option colours/EMA positions are recorded context, not gates.
  if (!isGreen(setup)) return null;
  const fraction = aboveBodyFraction(setup);
  return fraction != null && fraction >= 0.80 ? fraction : null;
};

/** Closed-bar paired EMA9 reconstruction. Missing exact bars are never substituted. */
export function scalperPairedBody80Signals(panes: Pane[], intervalMinutes: number): ScalperSignal[] {
  const underlying = panes.find((pane) => optionSide(pane) == null);
  if (!underlying || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return [];
  const bars = [...underlying.bars].filter((bar) => bar.closed === true).sort((a, b) => String(a.end).localeCompare(String(b.end)));
  const options = new Map(panes.filter((pane) => optionSide(pane) != null).map((pane) => [optionSide(pane)!, pane]));
  const result: ScalperSignal[] = [];
  for (let index = 2; index < bars.length; index += 1) {
    const group = bars.slice(index - 2, index + 1);
    if (!consecutive(group, intervalMinutes) || group.some((bar) => !valid(bar))) continue;
    const [first, second, setup] = group;
    const callFraction = isRed(first) && isRed(second) && belowEma(first) && belowEma(second) && isGreen(setup) ? aboveBodyFraction(setup) : null;
    const putFraction = isGreen(first) && isGreen(second) && aboveEma(first) && aboveEma(second) && isRed(setup) ? belowBodyFraction(setup) : null;
    const direction = callFraction != null && callFraction >= 0.80 ? "CALL" : putFraction != null && putFraction >= 0.80 ? "PUT" : null;
    if (!direction) continue;
    const optionPane = options.get(direction === "CALL" ? "CE" : "PE");
    if (!optionPane) continue;
    const byTime = new Map(optionPane.bars.filter((bar) => bar.closed === true).map((bar) => [String(bar.end), bar]));
    const optionGroup = group.map((bar) => byTime.get(String(bar.end))).filter((bar): bar is Row => Boolean(bar));
    if (!consecutive(optionGroup, intervalMinutes)) continue;
    const optionFraction = bullishOptionConfirmation(optionGroup);
    if (optionFraction == null) continue;

    const setupTime = String(setup.end);
    const expectedMs = Date.parse(setupTime) + intervalMinutes * 60_000;
    const next = bars.find((bar) => Date.parse(String(bar.end)) === expectedMs && istDay(bar.end) === istDay(setup.end));
    const underlyingOpen = number(next?.open);
    const passes = underlyingOpen != null && (direction === "CALL" ? underlyingOpen > number(setup.ema9)! : underlyingOpen < number(setup.ema9)!);
    const optionBar = next ? byTime.get(String(next.end)) : null;
    const optionPremium = number(optionBar?.open);
    result.push({
      id: `${SCALPER_ENTRY_RULE}-${intervalMinutes}m-${direction}-${optionPane.identity.symbol_token ?? optionPane.identity.tradingsymbol}-${setupTime}`,
      direction, setupTime, setupClose: number(setup.close)!, ema: number(setup.ema9)!,
      bodyFraction: Math.min(direction === "CALL" ? callFraction! : putFraction!, optionFraction),
      underlyingBodyFraction: direction === "CALL" ? callFraction! : putFraction!, optionBodyFraction: optionFraction,
      nextTime: next ? String(next.end) : null, underlyingOpen, optionPremium,
      optionSymbol: String(optionPane.identity.tradingsymbol ?? ""),
      state: !next ? index === bars.length - 1 ? "WAIT_NEXT_OPEN" : "NEXT_BAR_MISSING" : !passes || optionPremium == null ? "NEXT_OPEN_FAILED" : "RETROSPECTIVE_ENTRY_REFERENCE",
    });
  }
  return result;
}
