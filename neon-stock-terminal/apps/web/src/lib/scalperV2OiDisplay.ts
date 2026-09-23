import type { ScalperV2ProfileRow } from "./scalperV2OiProfile";
import type { ScalperV2OiTimePoint } from "./scalperV2OiTime";

export type ScalperV2OiDisplayMode = "contracts" | "underlying_units";

type SourceRow = Record<string, unknown>;

const finite = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value))
  ? null
  : Number(value);

/**
 * OI multiplication is display-only and is allowed only for a cohort that is
 * explicitly contract-denominated and has one exact positive lot size.
 * Provider-native/unverified values must not be multiplied a second time.
 */
export function scalperV2OiLotContext(rows: SourceRow[]) {
  const observed = rows.filter((row) => finite(row.open_interest ?? row.currentOi) != null);
  const units = [...new Set(observed.map((row) => String(row.oi_unit ?? "").trim().toLowerCase()).filter(Boolean))];
  const lotSizes = [...new Set(observed.map((row) => finite(row.lotsize ?? row.lotSize)).filter((value): value is number => value != null && value > 0))];
  const contractDenominated = observed.length > 0 && units.length === 1 && units[0] === "contracts";
  const commonLotSize = lotSizes.length === 1 ? lotSizes[0] : null;
  const available = contractDenominated && commonLotSize != null;
  return {
    available,
    lotSize: available ? commonLotSize : null,
    sourceUnit: units.length === 1 ? units[0] : null,
    reason: available
      ? null
      : observed.length === 0
        ? "OI observations unavailable"
        : !contractDenominated
          ? "OI source is not verified as contracts"
          : "One common F&O lot size is unavailable",
  };
}

export function scalperV2OiMultiplier(mode: ScalperV2OiDisplayMode, lotSize: number | null) {
  return mode === "underlying_units" && lotSize != null && Number.isFinite(lotSize) && lotSize > 0 ? lotSize : 1;
}

export function scaleScalperV2Oi(value: number | null, multiplier: number) {
  return value == null ? null : value * multiplier;
}

export function scaleScalperV2ProfileRows(rows: ScalperV2ProfileRow[], multiplier: number): ScalperV2ProfileRow[] {
  if (multiplier === 1) return rows;
  return rows.map((row) => ({
    ...row,
    currentOi: scaleScalperV2Oi(row.currentOi, multiplier),
    baselineOi: scaleScalperV2Oi(row.baselineOi, multiplier),
    changeOi: scaleScalperV2Oi(row.changeOi, multiplier),
    unit: "underlying_units",
  }));
}

export function scaleScalperV2OiTimePoints<T extends ScalperV2OiTimePoint>(points: T[], multiplier: number): T[] {
  if (multiplier === 1) return points;
  return points.map((point) => ({
    ...point,
    ceOi: scaleScalperV2Oi(point.ceOi, multiplier),
    peOi: scaleScalperV2Oi(point.peOi, multiplier),
    ceChangeOi: scaleScalperV2Oi(point.ceChangeOi, multiplier),
    peChangeOi: scaleScalperV2Oi(point.peChangeOi, multiplier),
    oiDifference: scaleScalperV2Oi(point.oiDifference, multiplier),
    changeOiDifference: scaleScalperV2Oi(point.changeOiDifference, multiplier),
  }));
}
