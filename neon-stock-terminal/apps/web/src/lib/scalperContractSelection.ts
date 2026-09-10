export type ScalperLegSelection = {
  ceStrike: string;
  peStrike: string;
};

export type AvailableScalperContract = {
  expiry: string;
  strike: number;
  ce_contracts: number;
  pe_contracts: number;
};

export function scalperLegSelection(params: URLSearchParams, defaultStrike: number | null | undefined): ScalperLegSelection {
  const legacyStrike = params.get("strike") ?? "";
  const fallback = legacyStrike || String(defaultStrike ?? "");
  return {
    ceStrike: params.get("ceStrike") ?? fallback,
    peStrike: params.get("peStrike") ?? fallback,
  };
}

export function setScalperLegSelection(
  params: URLSearchParams,
  selection: ScalperLegSelection,
  pinned = true,
) {
  const next = new URLSearchParams(params);
  if (selection.ceStrike) next.set("ceStrike", selection.ceStrike);
  else next.delete("ceStrike");
  if (selection.peStrike) next.set("peStrike", selection.peStrike);
  else next.delete("peStrike");

  // Keep old same-strike links working without misrepresenting a strangle as a pair strike.
  if (selection.ceStrike && selection.ceStrike === selection.peStrike) next.set("strike", selection.ceStrike);
  else next.delete("strike");
  if (pinned && selection.ceStrike && selection.peStrike) next.set("pin", "true");
  else next.delete("pin");
  return next;
}

export function applyScalperLegsToChartQuery(
  query: URLSearchParams,
  expiry: string,
  selection: ScalperLegSelection,
) {
  if (!expiry || !selection.ceStrike || !selection.peStrike) return query;
  query.set("expiry", expiry);
  query.set("ceStrike", selection.ceStrike);
  query.set("peStrike", selection.peStrike);
  if (selection.ceStrike === selection.peStrike) query.set("strike", selection.ceStrike);
  return query;
}

export function availableScalperStrikes(
  rows: AvailableScalperContract[],
  expiry: string,
  side: "CE" | "PE",
) {
  const countKey = side === "CE" ? "ce_contracts" : "pe_contracts";
  return [...new Set(rows
    .filter((row) => row.expiry === expiry && Number(row[countKey]) > 0)
    .map((row) => Number(row.strike))
    .filter((strike) => Number.isFinite(strike) && strike > 0))]
    .sort((a, b) => a - b);
}

export function nearestScalperStrike(strikes: number[], spot: number | null) {
  return [...strikes].sort((a, b) => Math.abs(a - Number(spot ?? a)) - Math.abs(b - Number(spot ?? b)) || a - b)[0] ?? null;
}
