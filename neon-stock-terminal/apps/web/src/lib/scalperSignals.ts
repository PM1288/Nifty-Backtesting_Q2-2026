import { istDay } from "./tradingAnalyticsChartView";

type Row = Record<string, unknown>;
type Pane = { identity: Row; bars: Row[] };
export type ScalperSignal = {
  id: string;
  direction: "CALL" | "PUT";
  setupTime: string;
  setupClose: number;
  ema: number;
  bodyFraction: number;
  nextTime: string | null;
  underlyingOpen: number | null;
  optionPremium: number | null;
  optionSymbol: string | null;
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

/**
 * Research-only closed-bar reconstruction of NIFTY_EMA9_BODY70_NEXT_OPEN_V3.
 * It never substitutes a missing immediate bar and never emits an order.
 */
export function scalperBody70Signals(panes: Pane[], intervalMinutes: number): ScalperSignal[] {
  const underlying = panes.find((pane) => optionSide(pane) == null);
  if (!underlying || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return [];
  const bars = [...underlying.bars]
    .filter((bar) => bar.closed === true)
    .sort((a, b) => String(a.end).localeCompare(String(b.end)));
  const options = new Map(
    panes.filter((pane) => optionSide(pane) != null).map((pane) => [optionSide(pane)!, pane]),
  );
  const result: ScalperSignal[] = [];
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1], setup = bars[index];
    const previousClose = number(previous.close), previousLow = number(previous.low), previousEma = number(previous.ema9);
    const open = number(setup.open), close = number(setup.close), ema = number(setup.ema9);
    if ([previousClose, previousLow, previousEma, open, close, ema].some((value) => value == null)) continue;
    const body = Math.abs(close! - open!);
    if (body === 0) continue;
    const callFraction = (close! - Math.max(open!, ema!)) / body;
    const putFraction = (Math.min(open!, ema!) - close!) / body;
    const direction = previousClose! < previousEma! && open! < ema! && ema! < close! && callFraction >= 0.70
      ? "CALL"
      : previousLow! > previousEma! && close! < ema! && ema! < open! && putFraction >= 0.70
        ? "PUT"
        : null;
    if (!direction) continue;
    const setupTime = String(setup.end);
    const expectedMs = Date.parse(setupTime) + intervalMinutes * 60_000;
    const next = bars.find((bar) => Date.parse(String(bar.end)) === expectedMs && istDay(bar.end) === istDay(setup.end));
    const underlyingOpen = number(next?.open);
    const passes = underlyingOpen != null && (direction === "CALL" ? underlyingOpen > ema! : underlyingOpen < ema!);
    const optionPane = options.get(direction === "CALL" ? "CE" : "PE");
    const optionBar = next ? optionPane?.bars.find((bar) => String(bar.end) === String(next.end) && bar.closed === true) : null;
    result.push({
      id: `${direction}-${setupTime}`,
      direction,
      setupTime,
      setupClose: close!,
      ema: ema!,
      bodyFraction: direction === "CALL" ? callFraction : putFraction,
      nextTime: next ? String(next.end) : null,
      underlyingOpen,
      optionPremium: number(optionBar?.open),
      optionSymbol: optionPane ? String(optionPane.identity.tradingsymbol ?? "") : null,
      state: !next
        ? index === bars.length - 1 ? "WAIT_NEXT_OPEN" : "NEXT_BAR_MISSING"
        : passes ? "RETROSPECTIVE_ENTRY_REFERENCE" : "NEXT_OPEN_FAILED",
    });
  }
  return result;
}
