import type { ScalperV2OiTimePoint } from "./scalperV2OiTime";
import type { ScalperV2ReferenceLevel } from "./scalperV2ReferenceLevels";

type Row = Record<string, unknown>;
type Pane = { identity: Row; bars: Row[] };

export const SCALPER_DIRECTIONAL_OI_ENTRY_RULE = "SCALPER_V2_OI_DIRECTION_EMA_CROSS_V1";

export type ScalperV2DirectionalEntry = {
  id: string;
  rule: typeof SCALPER_DIRECTIONAL_OI_ENTRY_RULE;
  direction: "CALL" | "PUT";
  setupTime: string;
  state: "DIRECTIONAL_ENTRY_REFERENCE" | "OPTION_PRICE_UNAVAILABLE";
  optionSymbol: string;
  optionPremium: number | null;
  underlyingClose: number;
  ema: number;
  oiDifference: number;
  previousOiDifference: number;
  changeOiDifference: number;
  dayOpenChangeOiDifference: number;
  matchedReferences: string[];
};

const number = (value: unknown) => {
  const parsed = value == null || value === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const time = (value: unknown) => {
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const optionSide = (pane: Pane) => {
  const symbol = String(pane.identity.tradingsymbol ?? "").toUpperCase();
  return symbol.endsWith("CE") ? "CE" : symbol.endsWith("PE") ? "PE" : null;
};

const latestClosedAt = (rows: Row[], at: number) => [...rows]
  .filter((row) => row.closed === true && time(row.end) != null && time(row.end)! <= at)
  .sort((left, right) => time(left.end)! - time(right.end)!)
  .at(-1);

/**
 * Independent research entry-reference rule. It does not replace V7:
 * - CALL: cumulative PE OI - CE OI crosses above zero; cumulative PE ΔOI -
 *   CE ΔOI is above its first session observation and rising; underlying close
 *   crosses above EMA9; price is above at least one named reference.
 * - PUT: exact inverse.
 * Only completed price bars at or before the OI snapshot are eligible.
 */
export function scalperV2DirectionalOiEntries(
  panes: Pane[],
  oiPoints: ScalperV2OiTimePoint[],
  referenceLevels: ScalperV2ReferenceLevel[],
): ScalperV2DirectionalEntry[] {
  const underlying = panes.find((pane) => optionSide(pane) == null);
  if (!underlying) return [];
  const underlyingBars = underlying.bars
    .filter((row) => row.closed === true && time(row.end) != null)
    .sort((left, right) => time(left.end)! - time(right.end)!);
  const options = new Map(panes.filter((pane) => optionSide(pane) != null).map((pane) => [optionSide(pane)!, pane]));
  const points = oiPoints.filter((point) => time(point.capturedAt) != null).sort((left, right) => time(left.capturedAt)! - time(right.capturedAt)!);
  const dayOpenDelta = points.find((point) => point.changeOiDifference != null)?.changeOiDifference ?? null;
  if (dayOpenDelta == null) return [];
  const namedReferences = referenceLevels.filter((level) => ["today-open", "previous-day-close", "previous-day-high"].includes(level.id));
  const results: ScalperV2DirectionalEntry[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1], current = points[index];
    const previousDifference = previous.oiDifference, difference = current.oiDifference;
    const previousDelta = previous.changeOiDifference, delta = current.changeOiDifference;
    if ([previousDifference, difference, previousDelta, delta].some((value) => value == null || !Number.isFinite(value))) continue;
    const callPressure = previousDifference! <= 0 && difference! > 0 && delta! > dayOpenDelta && delta! > previousDelta!;
    const putPressure = previousDifference! >= 0 && difference! < 0 && delta! < dayOpenDelta && delta! < previousDelta!;
    const direction = callPressure ? "CALL" : putPressure ? "PUT" : null;
    if (!direction) continue;
    const capturedAt = time(current.capturedAt)!;
    const setup = latestClosedAt(underlyingBars, capturedAt);
    if (!setup) continue;
    const setupIndex = underlyingBars.indexOf(setup);
    const previousBar = underlyingBars.slice(0, setupIndex).at(-1);
    const close = number(setup.close), ema = number(setup.ema9), priorClose = number(previousBar?.close), priorEma = number(previousBar?.ema9);
    if ([close, ema, priorClose, priorEma].some((value) => value == null)) continue;
    const emaCross = direction === "CALL"
      ? priorClose! <= priorEma! && close! > ema!
      : priorClose! >= priorEma! && close! < ema!;
    if (!emaCross) continue;
    const matchedReferences = namedReferences
      .filter((level) => direction === "CALL" ? close! > level.value : close! < level.value)
      .map((level) => level.shortLabel);
    if (!matchedReferences.length) continue;
    const option = options.get(direction === "CALL" ? "CE" : "PE");
    if (!option) continue;
    const optionBar = latestClosedAt(option.bars, time(setup.end) ?? capturedAt);
    const optionPremium = optionBar && time(optionBar.end) === time(setup.end) ? number(optionBar.close) : null;
    const setupTime = String(setup.end);
    results.push({
      id: `${SCALPER_DIRECTIONAL_OI_ENTRY_RULE}-${direction}-${setupTime}`,
      rule: SCALPER_DIRECTIONAL_OI_ENTRY_RULE,
      direction,
      setupTime,
      state: optionPremium == null ? "OPTION_PRICE_UNAVAILABLE" : "DIRECTIONAL_ENTRY_REFERENCE",
      optionSymbol: String(option.identity.tradingsymbol ?? ""),
      optionPremium,
      underlyingClose: close!,
      ema: ema!,
      oiDifference: difference!,
      previousOiDifference: previousDifference!,
      changeOiDifference: delta!,
      dayOpenChangeOiDifference: dayOpenDelta,
      matchedReferences,
    });
  }
  return results;
}
