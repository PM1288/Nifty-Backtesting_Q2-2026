import { useMemo } from "react";
import { useScalperProgression } from "../../lib/hooks";
import type { Quote, ScalperProgressionRow } from "../../lib/types";
import { buildProgressionMatrixRows, type ProgressionMatrixRow } from "../today/scalperProgressionMatrix";

export type MwhdRanking = Pick<ProgressionMatrixRow, "rank" | "starterState" | "bothStartersFailed" | "allGreen" | "best">;

export function mwhdRankingsFromRows(rows: ScalperProgressionRow[]): Map<string, MwhdRanking> {
  const stocks = rows.map((row) => ({
    symbol: row.symbol,
    name: row.companyName ?? row.symbol,
    last: row.currentValue ?? 0,
    dayOpen: row.todayOpen ?? 0,
  })) as Quote[];
  return new Map(buildProgressionMatrixRows(stocks, rows).map((row) => [row.stock.symbol.toUpperCase(), row]));
}

export function useMwhdRankings(enabled = true) {
  const query = useScalperProgression(enabled);
  const rankings = useMemo(() => mwhdRankingsFromRows(query.data?.rows ?? []), [query.data?.rows]);
  return { rankings, isLoading: query.isLoading, isError: Boolean(query.error), generatedAt: query.data?.generatedAt ?? null };
}
