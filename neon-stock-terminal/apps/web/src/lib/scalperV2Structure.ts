import type { OiLeader } from "./scalperV2";
import type { ScalperV2ProfileRow } from "./scalperV2OiProfile";

type SourceRow = Record<string, unknown>;
const finite = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const side = (row: SourceRow) => String(row.option_type ?? row.side ?? "").toUpperCase();

export type ScalperV2StructureLeg = {
  price: number | null;
  priceChangePct: number | null;
  oi: number | null;
  changeOi: number | null;
  changeOiPct: number | null;
  rank: number | null;
};
export type ScalperV2StructureRow = { strike: number; ce: ScalperV2StructureLeg; pe: ScalperV2StructureLeg };

export function scalperV2StructureRows(rows: SourceRow[], profile: ScalperV2ProfileRow[], leaders: OiLeader[]): ScalperV2StructureRow[] {
  const strikes = [...new Set(rows.map((row) => finite(row.strike)).filter((value): value is number => value != null))].sort((a, b) => b - a);
  const leg = (strike: number, wanted: "CE" | "PE"): ScalperV2StructureLeg => {
    const row = rows.find((candidate) => side(candidate) === wanted && finite(candidate.strike) === strike);
    const prof = profile.find((candidate) => candidate.side === wanted && candidate.strike === strike);
    const price = finite(row?.last_price ?? row?.lastPrice ?? row?.close);
    const open = finite(row?.open_price ?? row?.open ?? row?.session_open);
    const changeOi = prof?.changeOi ?? null;
    return {
      price,
      priceChangePct: price != null && open != null && open > 0 ? 100 * (price / open - 1) : finite(row?.change_percent ?? row?.priceChangePct),
      oi: prof?.currentOi ?? finite(row?.open_interest ?? row?.currentOi),
      changeOi,
      changeOiPct: changeOi != null && prof?.baselineOi != null && prof.baselineOi > 0 ? 100 * changeOi / prof.baselineOi : null,
      rank: leaders.find((leader) => leader.side === wanted && leader.strike === strike)?.rank ?? null,
    };
  };
  return strikes.map((strike) => ({ strike, ce: leg(strike, "CE"), pe: leg(strike, "PE") }));
}

export function scalperV2OiTotals(rows: ScalperV2ProfileRow[]) {
  const total = (wanted: "CE" | "PE", field: "currentOi" | "changeOi") => {
    const values = rows.filter((row) => row.side === wanted).map((row) => row[field]);
    return values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  };
  const ceOi = total("CE", "currentOi"), peOi = total("PE", "currentOi"), ceDelta = total("CE", "changeOi"), peDelta = total("PE", "changeOi");
  return {
    ceOi, peOi, ceDelta, peDelta,
    pcr: ceOi != null && ceOi > 0 && peOi != null ? peOi / ceOi : null,
    oiImbalance: ceOi != null && peOi != null && ceOi + peOi > 0 ? (peOi - ceOi) / (peOi + ceOi) : null,
    deltaImbalance: ceDelta != null && peDelta != null && Math.abs(ceDelta) + Math.abs(peDelta) > 0 ? (peDelta - ceDelta) / (Math.abs(peDelta) + Math.abs(ceDelta)) : null,
  };
}
