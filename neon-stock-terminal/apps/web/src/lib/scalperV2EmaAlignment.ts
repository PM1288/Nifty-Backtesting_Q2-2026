import { istDay } from "./tradingAnalyticsChartView";
import { scalperV2VolumeEma } from "./scalperV2Volume";

type Row = Record<string, unknown>;
export type ScalperV2EmaPane = { identity: Row; bars: Row[] };
type EmaSide = "ABOVE" | "BELOW";

export const SCALPER_V2_THREE_INSTRUMENT_EMA_RULE = "SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_VOLUME_V2";
export const SCALPER_V2_THREE_INSTRUMENT_EMA_STATE = "POTENTIAL_ENTRY_REFERENCE";
export const SCALPER_V2_OPTION_VOLUME_EMA_PERIOD = 20;
export const SCALPER_V2_OPTION_VOLUME_MIN_RATIO = 0.95;

export type ScalperV2EmaAlignmentLeg = {
  instrument: "UNDERLYING" | "CE" | "PE";
  symbol: string;
  targetSide: EmaSide;
  crossTime: string;
  sourceSideCloses: number;
  sourceLookback: 5;
  volume: number | null;
  volumeEma20: number | null;
  volumeToEmaRatio: number | null;
  volumeConfirmed: boolean | null;
};

export type ScalperV2EmaAlignmentSignal = {
  id: string;
  rule: typeof SCALPER_V2_THREE_INSTRUMENT_EMA_RULE;
  state: typeof SCALPER_V2_THREE_INSTRUMENT_EMA_STATE;
  direction: "CALL" | "PUT";
  setupTime: string;
  intervalMinutes: 5;
  legs: [ScalperV2EmaAlignmentLeg, ScalperV2EmaAlignmentLeg, ScalperV2EmaAlignmentLeg];
};

export type ScalperV2EmaAlignmentAvailability = {
  state: "READY" | "INACTIVE_TIMEFRAME" | "UNAVAILABLE";
  reasons: string[];
};

const numeric = (value: unknown) => {
  const parsed = value == null || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const paneSide = (pane: ScalperV2EmaPane): "CE" | "PE" | "UNDERLYING" => {
  const symbol = String(pane.identity.tradingsymbol ?? pane.identity.tradingSymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : "UNDERLYING";
};

const symbolOf = (pane: ScalperV2EmaPane) => String(pane.identity.tradingsymbol ?? pane.identity.tradingSymbol ?? pane.identity.symbol ?? "Unknown");

const validClosedTimes = (pane: ScalperV2EmaPane | undefined) => new Set((pane?.bars ?? []).flatMap((bar) => (
  bar.closed === true && numeric(bar.close) != null && numeric(bar.ema9) != null && Number.isFinite(Date.parse(String(bar.end)))
    ? [String(bar.end)] : []
)));

const sideAt = (bar: Row): EmaSide | null => {
  const close = numeric(bar.close), ema = numeric(bar.ema9);
  if (close == null || ema == null || close === ema) return null;
  return close > ema ? "ABOVE" : "BELOW";
};

const consecutive = (bars: Row[]) => bars.every((bar, index) => {
  if (index === 0) return true;
  const previous = bars[index - 1];
  return Date.parse(String(bar.end)) - Date.parse(String(previous.end)) === 5 * 60_000
    && istDay(bar.end) === istDay(previous.end);
});

function volumeEvidenceAt(pane: ScalperV2EmaPane, candidateTime: string) {
  const day = istDay(candidateTime);
  const rows = pane.bars
    .filter((bar) => bar.closed === true && istDay(bar.end) === day && Number.isFinite(Date.parse(String(bar.end))))
    .sort((left, right) => Date.parse(String(left.end)) - Date.parse(String(right.end)));
  const emaByTime = new Map(scalperV2VolumeEma(rows.map((bar) => ({
    time: Date.parse(String(bar.end)),
    value: numeric(bar.volume),
  })), SCALPER_V2_OPTION_VOLUME_EMA_PERIOD).map((point) => [point.time, point.value]));
  const row = rows.find((bar) => String(bar.end) === candidateTime);
  const volume = numeric(row?.volume);
  const volumeEma20 = emaByTime.get(Date.parse(candidateTime)) ?? null;
  const volumeToEmaRatio = volume != null && volumeEma20 != null && volumeEma20 > 0 ? volume / volumeEma20 : null;
  return { volume, volumeEma20, volumeToEmaRatio, volumeConfirmed: volumeToEmaRatio != null && volumeToEmaRatio >= SCALPER_V2_OPTION_VOLUME_MIN_RATIO };
}

function legEvidence(
  pane: ScalperV2EmaPane,
  candidateTime: string,
  instrument: ScalperV2EmaAlignmentLeg["instrument"],
  targetSide: EmaSide,
  requireVolumeConfirmation = false,
): ScalperV2EmaAlignmentLeg | null {
  const bars = pane.bars
    .filter((bar) => bar.closed === true && Number.isFinite(Date.parse(String(bar.end))))
    .sort((left, right) => Date.parse(String(left.end)) - Date.parse(String(right.end)));
  const candidateIndex = bars.findIndex((bar) => String(bar.end) === candidateTime);
  if (candidateIndex < 0 || sideAt(bars[candidateIndex]) !== targetSide) return null;

  for (const crossIndex of [candidateIndex, candidateIndex - 1]) {
    if (crossIndex < 1 || candidateIndex - crossIndex > 1) continue;
    const previousSide = sideAt(bars[crossIndex - 1]);
    const currentSide = sideAt(bars[crossIndex]);
    if (previousSide == null || currentSide !== targetSide || previousSide === targetSide) continue;
    const lookbackStart = crossIndex - 5;
    if (lookbackStart < 0) continue;
    const required = bars.slice(lookbackStart, candidateIndex + 1);
    if (!consecutive(required)) continue;
    const sourceSideCloses = bars.slice(lookbackStart, crossIndex).filter((bar) => sideAt(bar) === previousSide).length;
    if (sourceSideCloses < 2) continue;
    const volumeEvidence = requireVolumeConfirmation ? volumeEvidenceAt(pane, candidateTime) : null;
    if (requireVolumeConfirmation && !volumeEvidence?.volumeConfirmed) continue;
    return {
      instrument,
      symbol: symbolOf(pane),
      targetSide,
      crossTime: String(bars[crossIndex].end),
      sourceSideCloses,
      sourceLookback: 5,
      volume: volumeEvidence?.volume ?? null,
      volumeEma20: volumeEvidence?.volumeEma20 ?? null,
      volumeToEmaRatio: volumeEvidence?.volumeToEmaRatio ?? null,
      volumeConfirmed: volumeEvidence?.volumeConfirmed ?? null,
    };
  }
  return null;
}

/**
 * Finds closed-bar, exact-time EMA9 alignment references for the selected
 * underlying, CE and PE. This is evidence only: it does not create an order,
 * fill, target or exit.
 */
export function scalperV2EmaAlignmentSignals(panes: ScalperV2EmaPane[], intervalMinutes: number): ScalperV2EmaAlignmentSignal[] {
  if (intervalMinutes !== 5) return [];
  const underlying = panes.find((pane) => paneSide(pane) === "UNDERLYING");
  const call = panes.find((pane) => paneSide(pane) === "CE");
  const put = panes.find((pane) => paneSide(pane) === "PE");
  if (!underlying || !call || !put) return [];

  const commonTimes = [...new Set(underlying.bars.filter((bar) => bar.closed === true).map((bar) => String(bar.end)))]
    .filter((time) => call.bars.some((bar) => bar.closed === true && String(bar.end) === time))
    .filter((time) => put.bars.some((bar) => bar.closed === true && String(bar.end) === time))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const results: ScalperV2EmaAlignmentSignal[] = [];

  for (const setupTime of commonTimes) {
    const configurations = [
      { direction: "CALL" as const, underlying: "ABOVE" as const, call: "ABOVE" as const, put: "BELOW" as const },
      { direction: "PUT" as const, underlying: "BELOW" as const, call: "BELOW" as const, put: "ABOVE" as const },
    ];
    for (const configuration of configurations) {
      const legs = [
        legEvidence(underlying, setupTime, "UNDERLYING", configuration.underlying),
        legEvidence(call, setupTime, "CE", configuration.call, true),
        legEvidence(put, setupTime, "PE", configuration.put, true),
      ] as const;
      if (legs.some((leg) => leg == null)) continue;
      const typedLegs = legs as [ScalperV2EmaAlignmentLeg, ScalperV2EmaAlignmentLeg, ScalperV2EmaAlignmentLeg];
      // Emit one reference at the first fully aligned bar. The one-bar grace
      // period must not duplicate the same zone on the following candle.
      const previous = results.at(-1);
      if (previous?.direction === configuration.direction
        && Date.parse(setupTime) - Date.parse(previous.setupTime) === 5 * 60_000) continue;
      results.push({
        id: `${SCALPER_V2_THREE_INSTRUMENT_EMA_RULE}-5m-${configuration.direction}-${symbolOf(call)}-${symbolOf(put)}-${setupTime}`,
        rule: SCALPER_V2_THREE_INSTRUMENT_EMA_RULE,
        state: SCALPER_V2_THREE_INSTRUMENT_EMA_STATE,
        direction: configuration.direction,
        setupTime,
        intervalMinutes: 5,
        legs: typedLegs,
      });
    }
  }
  return results;
}

export function scalperV2EmaAlignmentAvailability(panes: ScalperV2EmaPane[], intervalMinutes: number): ScalperV2EmaAlignmentAvailability {
  if (intervalMinutes !== 5) return { state: "INACTIVE_TIMEFRAME", reasons: ["Select 5m to evaluate this reference"] };
  const entries = (["UNDERLYING", "CE", "PE"] as const).map((instrument) => ({
    instrument,
    pane: panes.find((candidate) => paneSide(candidate) === instrument),
  }));
  const reasons = entries.flatMap(({ instrument, pane }) => {
    const count = validClosedTimes(pane).size;
    const volumeCount = instrument === "UNDERLYING" ? 6 : (pane?.bars ?? []).filter((bar) => bar.closed === true && numeric(bar.volume) != null).length;
    return [
      ...(count >= 6 ? [] : [`${instrument} needs six completed 5m close/EMA observations; ${count} available`]),
      ...(instrument === "UNDERLYING" || volumeCount >= 6 ? [] : [`${instrument} needs completed 5m volume evidence; ${volumeCount} observations available`]),
    ];
  });
  if (reasons.length) return { state: "UNAVAILABLE", reasons };
  const sets = entries.map(({ pane }) => validClosedTimes(pane));
  const common = [...sets[0]].filter((time) => sets.slice(1).every((values) => values.has(time)));
  if (common.length < 6) return { state: "UNAVAILABLE", reasons: [`Exact shared 5m history is incomplete; ${common.length} aligned observations available`] };
  return { state: "READY", reasons: [] };
}

export function scalperV2EmaAlignmentSpeech(signal: ScalperV2EmaAlignmentSignal, underlyingSymbol: string) {
  return `${underlyingSymbol}. Tentative ${signal.direction === "CALL" ? "call" : "put"} reference. Underlying, call and put E M A alignment and option volume confirmation observed on completed five minute candles.`;
}

/**
 * Tentative-reference glyphs use a stable option identity contract: CE is an
 * upward triangle and PE is a downward triangle. Only the underlying glyph
 * follows the CALL/PUT setup direction.
 */
export function scalperV2EmaMarkerDirection(
  pane: "underlying" | "call" | "put",
  direction: ScalperV2EmaAlignmentSignal["direction"],
): "up" | "down" {
  if (pane === "call") return "up";
  if (pane === "put") return "down";
  return direction === "CALL" ? "up" : "down";
}
