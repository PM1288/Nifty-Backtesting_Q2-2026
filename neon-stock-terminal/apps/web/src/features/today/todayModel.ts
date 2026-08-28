import type { LiveQuote, OverviewResponse, Quote } from "../../lib/types";
import type { StockProfile, StockProfileFilters } from "../../lib/stockProfiles";

export type SummaryLens = "story" | "sector-matrix";
export type FullBoardSort = "stable" | "rank" | "move" | "alphabetical" | "volume" | "opportunity" | "anomaly";
export type QuickViewTarget = { type: "sector"; id: string } | { type: "stock"; symbol: string } | null;

export type TodayBreadth = { advancing: number; declining: number; neutral: number; total: number };

export type TodaySector = {
  id: string;
  name: string;
  stableIndex: number;
  rank: number;
  rankDelta: number | null;
  movePct: number | null;
  breadth: TodayBreadth;
  stocks: Quote[];
  strongestStock: Quote | null;
  weakestStock: Quote | null;
};

export type TodayModel = {
  asOf: string | null;
  market: OverviewResponse["market"];
  indices: OverviewResponse["indices"];
  breadth: TodayBreadth;
  sectors: TodaySector[];
  allStocks: Quote[];
  strongestMovers: Quote[];
  weakestMovers: Quote[];
  oiisStrongest: Quote[];
  oiisWeakest: Quote[];
  derivatives: OverviewResponse["derivatives"];
};

const LENSES = new Set<SummaryLens>(["story", "sector-matrix"]);
const SORTS = new Set<FullBoardSort>(["stable", "rank", "move", "alphabetical", "volume", "opportunity", "anomaly"]);

export function parseSummaryLens(value: string | null): SummaryLens {
  return value != null && LENSES.has(value as SummaryLens) ? value as SummaryLens : "story";
}

export function slugifySector(value: string): string {
  return value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseBoardSort(value: string | null): FullBoardSort {
  return value != null && SORTS.has(value as FullBoardSort) ? value as FullBoardSort : "stable";
}

export function parseQuickView(value: string | null): QuickViewTarget {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1).trim();
  if (!id) return null;
  if (type === "sector") return { type: "sector", id: slugifySector(id) };
  if (type === "stock" && /^[A-Z0-9&-]{1,30}$/i.test(id)) return { type: "stock", symbol: id.toUpperCase() };
  return null;
}

export function serializeQuickView(target: QuickViewTarget): string | null {
  if (!target) return null;
  return target.type === "sector" ? `sector:${target.id}` : `stock:${target.symbol}`;
}

export function movementState(value: number | null | undefined): "positive" | "negative" | "neutral" | "missing" {
  if (value == null || !Number.isFinite(value)) return "missing";
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

export function mergeOverviewQuote(quote: Quote, live: Record<string, LiveQuote>): Quote {
  const incoming = live[quote.symbol];
  if (!incoming) return quote;
  const previousClose = quote.last - quote.change;
  const canDerive = Number.isFinite(previousClose) && Math.abs(previousClose) > 1e-9;
  const change = canDerive ? incoming.price - previousClose : incoming.change;
  const changePct = canDerive ? (change / previousClose) * 100 : incoming.changePct;
  return {
    ...quote,
    last: incoming.price,
    change: Number.isFinite(change) ? change : quote.change,
    changePct: Number.isFinite(changePct) ? changePct : quote.changePct,
    timestamp: incoming.timestamp,
  };
}

export function breadthFor(stocks: Quote[]): TodayBreadth {
  let advancing = 0;
  let declining = 0;
  let neutral = 0;
  for (const stock of stocks) {
    if (!Number.isFinite(stock.changePct) || stock.changePct === 0) neutral += 1;
    else if (stock.changePct > 0) advancing += 1;
    else declining += 1;
  }
  return { advancing, declining, neutral, total: stocks.length };
}

function finiteAverage(values: number[]): number | null {
  const available = values.filter(Number.isFinite);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function stableSymbol(left: Quote, right: Quote) {
  return left.symbol.localeCompare(right.symbol);
}

export function buildTodayModel(payload: OverviewResponse, live: Record<string, LiveQuote>): TodayModel {
  const indexQuotes = {
    nifty50: mergeOverviewQuote(payload.indices.nifty50, live),
    bankNifty: mergeOverviewQuote(payload.indices.bankNifty, live),
    indiaVix: mergeOverviewQuote(payload.indices.indiaVix, live),
  };
  const raw = payload.sectors.map((group, stableIndex) => {
    const stocks = group.stocks.map((stock) => mergeOverviewQuote(stock, live)).sort(stableSymbol);
    return {
      id: slugifySector(group.sector),
      name: group.sector,
      stableIndex,
      movePct: finiteAverage(stocks.map((stock) => stock.changePct)),
      breadth: breadthFor(stocks),
      stocks,
      strongestStock: [...stocks].filter((stock) => Number.isFinite(stock.changePct)).sort((a, b) => b.changePct - a.changePct || stableSymbol(a, b))[0] ?? null,
      weakestStock: [...stocks].filter((stock) => Number.isFinite(stock.changePct)).sort((a, b) => a.changePct - b.changePct || stableSymbol(a, b))[0] ?? null,
    };
  });
  const rankById = new Map(
    [...raw].sort((a, b) => (b.movePct ?? -Infinity) - (a.movePct ?? -Infinity) || a.stableIndex - b.stableIndex)
      .map((sector, index) => [sector.id, index + 1]),
  );
  const sectors: TodaySector[] = raw.map((sector) => ({ ...sector, rank: rankById.get(sector.id) ?? sector.stableIndex + 1, rankDelta: null }));
  const allStocks = sectors.flatMap((sector) => sector.stocks).sort(stableSymbol);
  const byMove = [...allStocks].filter((stock) => Number.isFinite(stock.changePct)).sort((a, b) => b.changePct - a.changePct || stableSymbol(a, b));
  const byOiis = [...allStocks].filter((stock) => stock.oiisScore != null && Number.isFinite(stock.oiisScore));
  return {
    asOf: payload.asOf || null,
    market: payload.market,
    indices: indexQuotes,
    breadth: breadthFor(allStocks),
    sectors,
    allStocks,
    strongestMovers: byMove.slice(0, 5),
    weakestMovers: [...byMove].reverse().slice(0, 5),
    oiisStrongest: byOiis.filter((stock) => stock.oiisDirection !== "SHORT").sort((a, b) => (b.oiisScore ?? -Infinity) - (a.oiisScore ?? -Infinity) || stableSymbol(a, b)).slice(0, 5),
    oiisWeakest: byOiis.filter((stock) => stock.oiisDirection === "SHORT").sort((a, b) => (b.oiisScore ?? -Infinity) - (a.oiisScore ?? -Infinity) || stableSymbol(a, b)).slice(0, 5),
    derivatives: payload.derivatives,
  };
}

export function breadthRatio(breadth: TodayBreadth): number {
  return (breadth.advancing - breadth.declining) / Math.max(1, breadth.advancing + breadth.declining);
}

export function niftyMovementWording(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 0.75) return "NIFTY rises strongly";
  if (value >= 0.15) return "NIFTY trades higher";
  if (value > -0.15) return "NIFTY is broadly flat";
  if (value > -0.75) return "NIFTY trades lower";
  return "NIFTY falls sharply";
}

export function breadthWording(value: number): string {
  if (value >= 0.25) return "breadth is strong";
  if (value >= 0.08) return "breadth is positive";
  if (value > -0.08) return "breadth is mixed";
  if (value > -0.25) return "breadth is weak";
  return "breadth is very weak";
}

export function vixWording(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= -1) return "volatility is easing materially";
  if (value <= -0.25) return "volatility is easing";
  if (value < 0.25) return "volatility is steady";
  if (value < 1) return "volatility is rising";
  return "volatility is rising sharply";
}

export function buildMarketStory(model: TodayModel): string {
  const clauses: string[] = [];
  const nifty = niftyMovementWording(model.indices.nifty50.changePct);
  if (nifty) clauses.push(`${nifty}; ${breadthWording(breadthRatio(model.breadth))}`);
  const ranked = [...model.sectors].sort((a, b) => a.rank - b.rank);
  if (ranked.length) clauses.push(`${ranked[0].name} leads while ${ranked.at(-1)?.name ?? "the weakest sector"} lags`);
  const vix = vixWording(model.indices.indiaVix.changePct);
  if (vix) clauses.push(vix);
  return clauses.length ? `${clauses.join(". ")}.` : "Current market narrative is unavailable.";
}

export function stockMatchesProfile(stock: Quote, profile: StockProfile | undefined, filters: StockProfileFilters, search: string): boolean {
  const normalized = search.trim().toUpperCase();
  const searchMatch = !normalized || stock.symbol.toUpperCase().includes(normalized) || stock.name.toUpperCase().includes(normalized) || profile?.name.toUpperCase().includes(normalized);
  if (!searchMatch) return false;
  if (!profile) return filters.universe === "ALL" && filters.capBucket === "ALL" && filters.sector === "ALL";
  const universeMatch = filters.universe === "ALL" || (filters.universe === "FNO" && profile.fno) ||
    (filters.universe === "NIFTY50" && profile.nifty50) || (filters.universe === "NIFTY100" && profile.nifty100) ||
    (filters.universe === "NIFTY250" && profile.largeMidcap250) || (filters.universe === "NIFTY500" && profile.nifty500);
  return universeMatch && (filters.capBucket === "ALL" || profile.capBucket === filters.capBucket) &&
    (filters.sector === "ALL" || slugifySector(profile.sector) === slugifySector(filters.sector));
}

export function sortBoardStocks(stocks: Quote[], sort: FullBoardSort): Quote[] {
  const rows = [...stocks];
  if (sort === "alphabetical" || sort === "stable") return rows.sort(stableSymbol);
  if (sort === "move" || sort === "rank") return rows.sort((a, b) => b.changePct - a.changePct || stableSymbol(a, b));
  if (sort === "volume") return rows.sort((a, b) => Number(b.volume ?? -Infinity) - Number(a.volume ?? -Infinity) || stableSymbol(a, b));
  if (sort === "opportunity") return rows.sort((a, b) => (b.oiisScore ?? -Infinity) - (a.oiisScore ?? -Infinity) || stableSymbol(a, b));
  return rows.sort((a, b) => Number(Boolean(b.alert)) - Number(Boolean(a.alert)) || stableSymbol(a, b));
}
