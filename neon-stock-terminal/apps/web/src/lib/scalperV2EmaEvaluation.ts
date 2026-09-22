import { istDay } from "./tradingAnalyticsChartView";
import {
  scalperV2EmaAlignmentSignals,
  type ScalperV2EmaPane,
  type ScalperV2EmaAlignmentSignal,
} from "./scalperV2EmaAlignment";

type Row = Record<string, unknown>;
type Side = "UNDERLYING" | "CE" | "PE";

export type ScalperV2EmaHorizonEvidence = {
  bars: 1 | 3 | 6;
  comparable: number;
  positiveFollowThrough: number;
  averageUnderlyingPct: number | null;
  averageSelectedOptionPct: number | null;
};

export type ScalperV2EmaEvaluation = {
  intervalMinutes: number;
  sessions: number;
  signals: number;
  calls: number;
  puts: number;
  firstSession: string | null;
  lastSession: string | null;
  correlations: {
    underlyingVsCe: { value: number | null; samples: number };
    underlyingVsPe: { value: number | null; samples: number };
  };
  horizons: ScalperV2EmaHorizonEvidence[];
};

const number = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const symbol = (pane: ScalperV2EmaPane) => String(pane.identity.tradingsymbol ?? pane.identity.tradingSymbol ?? "").toUpperCase();
const side = (pane: ScalperV2EmaPane): Side => symbol(pane).endsWith("CE") ? "CE" : symbol(pane).endsWith("PE") ? "PE" : "UNDERLYING";
const closed = (pane: ScalperV2EmaPane | undefined) => (pane?.bars ?? [])
  .filter((row) => row.closed === true && number(row.close) != null && Number.isFinite(Date.parse(String(row.end))))
  .sort((left, right) => Date.parse(String(left.end)) - Date.parse(String(right.end)));

function pearson(pairs: Array<[number, number]>) {
  if (pairs.length < 3) return { value: null, samples: pairs.length };
  const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y);
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const xx = xs.reduce((sum, value) => sum + (value - mx) ** 2, 0);
  const yy = ys.reduce((sum, value) => sum + (value - my) ** 2, 0);
  return { value: xx > 0 && yy > 0 ? numerator / Math.sqrt(xx * yy) : null, samples: pairs.length };
}

function returnsByTime(pane: ScalperV2EmaPane | undefined) {
  const rows = closed(pane), result = new Map<string, number>();
  for (let index = 1; index < rows.length; index += 1) {
    if (istDay(rows[index].end) !== istDay(rows[index - 1].end)) continue;
    const previous = number(rows[index - 1].close), current = number(rows[index].close);
    if (previous == null || current == null || previous === 0) continue;
    result.set(String(rows[index].end), 100 * (current / previous - 1));
  }
  return result;
}

function signalOutcome(panes: ScalperV2EmaPane[], signal: ScalperV2EmaAlignmentSignal, bars: number) {
  const expected = bars * signal.intervalMinutes * 60_000;
  const get = (wanted: Side) => {
    const rows = closed(panes.find((pane) => side(pane) === wanted));
    const entry = rows.find((row) => String(row.end) === signal.setupTime);
    const future = rows.find((row) => Date.parse(String(row.end)) - Date.parse(signal.setupTime) === expected);
    const from = number(entry?.close), to = number(future?.close);
    return from == null || to == null || from === 0 || istDay(entry?.end) !== istDay(future?.end) ? null : 100 * (to / from - 1);
  };
  const underlying = get("UNDERLYING"), ce = get("CE"), pe = get("PE");
  if (underlying == null || ce == null || pe == null) return null;
  const direction = signal.direction === "CALL" ? 1 : -1;
  return {
    underlying: direction * underlying,
    selectedOption: signal.direction === "CALL" ? ce : pe,
  };
}

/**
 * Descriptive retained-data evaluation. It does not reconstruct fills, costs,
 * exits or P&L, and it never substitutes adjacent timestamps.
 */
export function scalperV2EmaEvaluation(panes: ScalperV2EmaPane[], intervalMinutes: number): ScalperV2EmaEvaluation {
  const sessionSets = panes.map((pane) => {
    const counts = new Map<string, number>();
    closed(pane).forEach((row) => {
      const day = istDay(row.end);
      if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
    });
    return new Set([...counts].filter(([, count]) => count >= 6).map(([day]) => day));
  });
  const sessions = sessionSets.length === 3
    ? [...sessionSets[0]].filter((day) => sessionSets.slice(1).every((values) => values.has(day))).sort()
    : [];
  const signals = sessions.flatMap((session) => scalperV2EmaAlignmentSignals(
    panes.map((pane) => ({ ...pane, bars: pane.bars.filter((row) => istDay(row.end) === session) })),
    intervalMinutes,
  ));
  const bySide = (wanted: Side) => panes.find((pane) => side(pane) === wanted);
  const underlyingReturns = returnsByTime(bySide("UNDERLYING"));
  const correlationFor = (wanted: Side) => {
    const optionReturns = returnsByTime(bySide(wanted));
    return pearson([...underlyingReturns].flatMap(([time, value]): Array<[number, number]> => optionReturns.has(time) ? [[value, optionReturns.get(time)!]] : []));
  };
  const horizons = ([1, 3, 6] as const).map((bars) => {
    const outcomes = signals.flatMap((signal) => {
      const sessionPanes = panes.map((pane) => ({ ...pane, bars: pane.bars.filter((row) => istDay(row.end) === istDay(signal.setupTime)) }));
      const outcome = signalOutcome(sessionPanes, signal, bars);
      return outcome == null ? [] : [outcome];
    });
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
      bars,
      comparable: outcomes.length,
      positiveFollowThrough: outcomes.filter((outcome) => outcome.underlying > 0 && outcome.selectedOption > 0).length,
      averageUnderlyingPct: average(outcomes.map((outcome) => outcome.underlying)),
      averageSelectedOptionPct: average(outcomes.map((outcome) => outcome.selectedOption)),
    };
  });
  return {
    intervalMinutes,
    sessions: sessions.length,
    signals: signals.length,
    calls: signals.filter((signal) => signal.direction === "CALL").length,
    puts: signals.filter((signal) => signal.direction === "PUT").length,
    firstSession: sessions[0] ?? null,
    lastSession: sessions.at(-1) ?? null,
    correlations: { underlyingVsCe: correlationFor("CE"), underlyingVsPe: correlationFor("PE") },
    horizons,
  };
}
