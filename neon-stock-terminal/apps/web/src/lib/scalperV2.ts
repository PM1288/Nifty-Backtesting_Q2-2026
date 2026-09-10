export type ScalperV2Leg = Record<string, unknown>;

const finite = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type OiLeader = {
  side: "CE" | "PE";
  rank: 1 | 2;
  strike: number;
  currentOi: number;
  changeOi: number | null;
  contractId: string;
  tiedOi: boolean;
};

/** Deterministic current-OI ranking. It never ranks by strike, delta-OI or spot distance. */
export function rankCurrentOi(legs: ScalperV2Leg[]): OiLeader[] {
  return (["CE", "PE"] as const).flatMap((side) => {
    const eligible = legs.flatMap((leg) => {
      const strike = finite(leg.strike);
      const currentOi = finite(leg.open_interest ?? leg.currentOi);
      const optionSide = String(leg.option_type ?? leg.side ?? "").toUpperCase();
      if (optionSide !== side || strike == null || currentOi == null || currentOi <= 0) return [];
      const layers = leg.oi_layers && typeof leg.oi_layers === "object"
        ? leg.oi_layers as Record<string, unknown>
        : null;
      return [{
        side,
        strike,
        currentOi,
        changeOi: finite(layers?.change ?? leg.changeOi),
        contractId: String(leg.symbol_token ?? leg.contractId ?? leg.instrument_identifier ?? ""),
      }];
    });
    const duplicateKeys = new Set<string>();
    const seen = new Set<string>();
    for (const row of eligible) {
      const key = `${side}:${row.strike}`;
      if (seen.has(key)) duplicateKeys.add(key);
      seen.add(key);
    }
    const unique = eligible
      .filter((row) => !duplicateKeys.has(`${side}:${row.strike}`))
      .sort((a, b) => b.currentOi - a.currentOi || a.strike - b.strike || a.contractId.localeCompare(b.contractId));
    return unique.slice(0, 2).map((row, index) => ({
      ...row,
      rank: (index + 1) as 1 | 2,
      tiedOi: unique.some((other, otherIndex) => otherIndex !== index && other.currentOi === row.currentOi),
    }));
  });
}

export type MaxPainPoint = { settlement: number; callPayout: number; putPayout: number; totalPayout: number };

/** Common-unit, selected observation-set estimate. It deliberately makes no INR claim. */
export function maxPainDistribution(legs: ScalperV2Leg[]) {
  const rows = legs.flatMap((leg) => {
    const strike = finite(leg.strike);
    const oi = finite(leg.open_interest ?? leg.currentOi);
    const side = String(leg.option_type ?? leg.side ?? "").toUpperCase();
    return strike != null && oi != null && oi >= 0 && (side === "CE" || side === "PE")
      ? [{ strike, oi, side: side as "CE" | "PE" }]
      : [];
  });
  const settlements = [...new Set(rows.map((row) => row.strike))].sort((a, b) => a - b);
  if (!settlements.length || rows.every((row) => row.oi === 0)) return { points: [] as MaxPainPoint[], candidates: [] as number[] };
  const points = settlements.map((settlement) => {
    const callPayout = rows.filter((row) => row.side === "CE")
      .reduce((sum, row) => sum + row.oi * Math.max(settlement - row.strike, 0), 0);
    const putPayout = rows.filter((row) => row.side === "PE")
      .reduce((sum, row) => sum + row.oi * Math.max(row.strike - settlement, 0), 0);
    return { settlement, callPayout, putPayout, totalPayout: callPayout + putPayout };
  });
  const minimum = Math.min(...points.map((point) => point.totalPayout));
  return { points, candidates: points.filter((point) => point.totalPayout === minimum).map((point) => point.settlement) };
}

export function oiPcr(legs: ScalperV2Leg[]) {
  const values = (side: "CE" | "PE") => legs.flatMap((leg) => {
    const value = String(leg.option_type ?? leg.side ?? "").toUpperCase() === side
      ? finite(leg.open_interest ?? leg.currentOi)
      : null;
    return value != null && value >= 0 ? [value] : [];
  });
  const ceValues = values("CE"), peValues = values("PE");
  if (!ceValues.length || !peValues.length) return null;
  const ce = ceValues.reduce((sum, value) => sum + value, 0);
  const pe = peValues.reduce((sum, value) => sum + value, 0);
  return ce > 0 ? pe / ce : null;
}
