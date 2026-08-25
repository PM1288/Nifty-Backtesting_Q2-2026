export type PaperCapitalTrade = Record<string, unknown>;

export const PAPER_CAPITAL_STARTING_CASH = 1_000_000;
export const PAPER_CAPITAL_ALLOCATIONS = [100_000, 200_000, 500_000, 1_000_000] as const;
export type PaperCapitalExitPolicy = "FIRST_GOVERNED" | "SWING_ONLY";

type TargetRow = Record<string, unknown>;

export interface PaperCapitalPosition {
  tradeGroupId: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryAt: string;
  exitAt: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  deployed: number;
  pnl: number;
  returnPct: number;
  status: "CLOSED_TARGET" | "OPEN_MARKED" | "OPEN_UNMARKED";
  exitReason: "INTRADAY_1_PCT" | "SWING_3_PCT" | "CURRENT_MARK" | "NO_CURRENT_MARK";
}

export interface PaperCapitalScenario {
  id: "ALLOC_1L" | "ALLOC_2L" | "ALLOC_5L" | "ALLOC_10L";
  exitPolicy: PaperCapitalExitPolicy;
  allocationPerTrade: number;
  maximumConcurrentSlots: number;
  startingCash: number;
  endingEquity: number;
  endingCash: number;
  deployedOpenCapital: number;
  realisedGrossPnl: number;
  openMarkedGrossPnl: number;
  totalGrossPnl: number;
  totalReturnPct: number;
  maxEventDrawdown: number;
  maxEventDrawdownPct: number;
  peakEventEquity: number;
  troughEventEquity: number;
  bestTradePnl: number | null;
  worstTradePnl: number | null;
  tradesConsidered: number;
  tradesTaken: number;
  tradesSkipped: number;
  closedTargetTrades: number;
  openTrades: number;
  unmarkedOpenTrades: number;
  winningTrades: number;
  losingTrades: number;
  maximumConcurrentUsed: number;
  firstEntryAt: string | null;
  lastEvaluatedAt: string;
  positions: PaperCapitalPosition[];
  equityEvents: Array<{ at: string; equity: number; event: string }>;
}

export interface PaperCapitalStrategyComparison {
  entryStrategy: string;
  sourceTradeCount: number;
  firstEntryAt: string | null;
  scenarios: PaperCapitalScenario[];
}

const finite = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const timestamp = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

function governedExit(trade: PaperCapitalTrade, entryPrice: number, direction: number, asOfMs: number, exitPolicy: PaperCapitalExitPolicy) {
  const targets = Array.isArray(trade.targets) ? trade.targets as TargetRow[] : [];
  const matches = targets.flatMap((target) => {
    const lifecycle = String(target.lifecycle ?? "").toUpperCase();
    const threshold = finite(target.target_pct);
    const isGoverned = exitPolicy === "SWING_ONLY"
      ? lifecycle === "SWING" && threshold != null && Math.abs(threshold - .03) < 1e-9
      : lifecycle === "INTRADAY"
        ? threshold != null && Math.abs(threshold - .01) < 1e-9
        : lifecycle === "SWING" && threshold != null && Math.abs(threshold - .03) < 1e-9;
    const hitMs = timestamp(target.first_hit_at);
    if (!isGoverned || hitMs == null || hitMs > asOfMs) return [];
    const storedPrice = finite(target.target_price);
    const exitPrice = storedPrice != null && storedPrice > 0
      ? storedPrice
      : entryPrice * (1 + direction * (threshold ?? 0));
    return [{
      at: hitMs,
      atIso: new Date(hitMs).toISOString(),
      price: exitPrice,
      reason: (lifecycle === "INTRADAY" ? "INTRADAY_1_PCT" : "SWING_3_PCT") as PaperCapitalPosition["exitReason"]
    }];
  }).sort((left, right) => left.at - right.at);
  return matches[0] ?? null;
}

function drawdown(events: Array<{ equity: number }>) {
  let peak = PAPER_CAPITAL_STARTING_CASH;
  let trough = PAPER_CAPITAL_STARTING_CASH;
  let maximum = 0;
  let maximumPct = 0;
  for (const event of events) {
    peak = Math.max(peak, event.equity);
    trough = Math.min(trough, event.equity);
    const current = Math.max(0, peak - event.equity);
    const currentPct = peak > 0 ? current / peak * 100 : 0;
    if (current > maximum) maximum = current;
    if (currentPct > maximumPct) maximumPct = currentPct;
  }
  return { maximum, maximumPct, peak, trough };
}

export function simulatePaperCapitalAllocation(
  trades: PaperCapitalTrade[],
  allocationPerTrade: number,
  asOf: Date = new Date(),
  exitPolicy: PaperCapitalExitPolicy = "FIRST_GOVERNED",
): PaperCapitalScenario {
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(asOfMs)) throw new Error("A valid simulation as-of timestamp is required");
  if (!PAPER_CAPITAL_ALLOCATIONS.includes(allocationPerTrade as typeof PAPER_CAPITAL_ALLOCATIONS[number])) {
    throw new Error("Unsupported paper capital allocation");
  }
  const id = ({ 100000: "ALLOC_1L", 200000: "ALLOC_2L", 500000: "ALLOC_5L", 1000000: "ALLOC_10L" } as const)[allocationPerTrade as 100000 | 200000 | 500000 | 1000000];
  const maximumConcurrentSlots = Math.floor(PAPER_CAPITAL_STARTING_CASH / allocationPerTrade);
  const candidates = trades.flatMap((trade) => {
    const entryAt = timestamp(trade.opened_at);
    const entryPrice = finite(trade.average_entry_price);
    if (entryAt == null || entryAt > asOfMs || entryPrice == null || entryPrice <= 0) return [];
    return [{ trade, entryAt, entryPrice }];
  }).sort((left, right) => left.entryAt - right.entryAt || String(left.trade.trade_group_id ?? "").localeCompare(String(right.trade.trade_group_id ?? "")));

  type ActivePosition = PaperCapitalPosition & { exitMs: number | null; markAvailable: boolean };
  let cash = PAPER_CAPITAL_STARTING_CASH;
  let realisedGrossPnl = 0;
  let maximumConcurrentUsed = 0;
  let tradesSkipped = 0;
  const active: ActivePosition[] = [];
  const positions: ActivePosition[] = [];
  const equityEvents: Array<{ at: string; equity: number; event: string }> = [{ at: candidates[0] ? new Date(candidates[0].entryAt).toISOString() : asOf.toISOString(), equity: PAPER_CAPITAL_STARTING_CASH, event: "START" }];

  const releaseDue = (cutoffMs: number) => {
    const due = active.filter((position) => position.exitMs != null && position.exitMs <= cutoffMs).sort((left, right) => Number(left.exitMs) - Number(right.exitMs));
    for (const position of due) {
      cash += position.deployed + position.pnl;
      realisedGrossPnl += position.pnl;
      const index = active.indexOf(position);
      if (index >= 0) active.splice(index, 1);
      equityEvents.push({ at: position.exitAt, equity: cash + active.reduce((sum, item) => sum + item.deployed, 0), event: `${position.symbol} ${position.exitReason}` });
    }
  };

  for (const candidate of candidates) {
    releaseDue(candidate.entryAt);
    if (active.length >= maximumConcurrentSlots || cash < candidate.entryPrice) {
      tradesSkipped += 1;
      continue;
    }
    const budget = Math.min(allocationPerTrade, cash);
    const quantity = Math.floor(budget / candidate.entryPrice);
    if (quantity < 1) {
      tradesSkipped += 1;
      continue;
    }
    const deployed = quantity * candidate.entryPrice;
    const side = String(candidate.trade.side).toUpperCase() === "SELL" ? "SELL" : "BUY";
    const direction = side === "SELL" ? -1 : 1;
    const targetExit = governedExit(candidate.trade, candidate.entryPrice, direction, asOfMs, exitPolicy);
    const carryMark = finite(candidate.trade.hypothetical_carry_mark ?? candidate.trade.last_mark);
    const exitPrice = targetExit?.price ?? carryMark ?? candidate.entryPrice;
    const pnl = direction * (exitPrice - candidate.entryPrice) * quantity;
    const markAvailable = targetExit != null || carryMark != null;
    const position: ActivePosition = {
      tradeGroupId: String(candidate.trade.trade_group_id ?? `${candidate.trade.symbol}-${candidate.entryAt}`),
      symbol: String(candidate.trade.symbol ?? "UNKNOWN"),
      side,
      entryAt: new Date(candidate.entryAt).toISOString(),
      exitAt: targetExit?.atIso ?? asOf.toISOString(),
      entryPrice: candidate.entryPrice,
      exitPrice,
      quantity,
      deployed,
      pnl: markAvailable ? pnl : 0,
      returnPct: candidate.entryPrice > 0 && markAvailable ? direction * (exitPrice / candidate.entryPrice - 1) * 100 : 0,
      status: targetExit ? "CLOSED_TARGET" : carryMark != null ? "OPEN_MARKED" : "OPEN_UNMARKED",
      exitReason: targetExit?.reason ?? (carryMark != null ? "CURRENT_MARK" : "NO_CURRENT_MARK"),
      exitMs: targetExit?.at ?? null,
      markAvailable,
    };
    cash -= deployed;
    active.push(position);
    positions.push(position);
    maximumConcurrentUsed = Math.max(maximumConcurrentUsed, active.length);
  }
  releaseDue(asOfMs);

  const openMarkedGrossPnl = active.reduce((sum, position) => sum + (position.markAvailable ? position.pnl : 0), 0);
  const deployedOpenCapital = active.reduce((sum, position) => sum + position.deployed, 0);
  const endingEquity = cash + deployedOpenCapital + openMarkedGrossPnl;
  equityEvents.push({ at: asOf.toISOString(), equity: endingEquity, event: "AS_OF_MARK" });
  const dd = drawdown(equityEvents);
  const measuredPnl = positions.filter((position) => position.status !== "OPEN_UNMARKED").map((position) => position.pnl);
  const closedTargetTrades = positions.filter((position) => position.status === "CLOSED_TARGET").length;
  const openTrades = positions.length - closedTargetTrades;
  return {
    id,
    exitPolicy,
    allocationPerTrade,
    maximumConcurrentSlots,
    startingCash: PAPER_CAPITAL_STARTING_CASH,
    endingEquity,
    endingCash: cash,
    deployedOpenCapital,
    realisedGrossPnl,
    openMarkedGrossPnl,
    totalGrossPnl: endingEquity - PAPER_CAPITAL_STARTING_CASH,
    totalReturnPct: (endingEquity / PAPER_CAPITAL_STARTING_CASH - 1) * 100,
    maxEventDrawdown: dd.maximum,
    maxEventDrawdownPct: dd.maximumPct,
    peakEventEquity: dd.peak,
    troughEventEquity: dd.trough,
    bestTradePnl: measuredPnl.length ? Math.max(...measuredPnl) : null,
    worstTradePnl: measuredPnl.length ? Math.min(...measuredPnl) : null,
    tradesConsidered: candidates.length,
    tradesTaken: positions.length,
    tradesSkipped,
    closedTargetTrades,
    openTrades,
    unmarkedOpenTrades: positions.filter((position) => position.status === "OPEN_UNMARKED").length,
    winningTrades: measuredPnl.filter((value) => value > 0).length,
    losingTrades: measuredPnl.filter((value) => value < 0).length,
    maximumConcurrentUsed,
    firstEntryAt: positions[0]?.entryAt ?? null,
    lastEvaluatedAt: asOf.toISOString(),
    positions: positions.map(({ exitMs: _exitMs, markAvailable: _markAvailable, ...position }) => position),
    equityEvents,
  };
}

export function paperCapitalScenarios(trades: PaperCapitalTrade[], asOf: Date = new Date(), exitPolicy: PaperCapitalExitPolicy = "FIRST_GOVERNED") {
  return PAPER_CAPITAL_ALLOCATIONS.map((allocation) => simulatePaperCapitalAllocation(trades, allocation, asOf, exitPolicy));
}

const strategyOrder = ["RSI_WILLR", "PRICE_MOMENTUM_1D_1H_15M", "QUALITY_SUM_THRESHOLD", "UNSPECIFIED"];

export function paperCapitalStrategyComparisons(trades: PaperCapitalTrade[], asOf: Date = new Date(), exitPolicy: PaperCapitalExitPolicy = "FIRST_GOVERNED"): PaperCapitalStrategyComparison[] {
  const grouped = new Map<string, PaperCapitalTrade[]>();
  for (const trade of trades) {
    const raw = String(trade.entry_strategy ?? "").trim().toUpperCase();
    const entryStrategy = raw || "UNSPECIFIED";
    const rows = grouped.get(entryStrategy) ?? [];
    rows.push(trade);
    grouped.set(entryStrategy, rows);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftRank = strategyOrder.indexOf(left);
      const rightRank = strategyOrder.indexOf(right);
      return (leftRank < 0 ? strategyOrder.length : leftRank) - (rightRank < 0 ? strategyOrder.length : rightRank) || left.localeCompare(right);
    })
    .map(([entryStrategy, rows]) => {
      const firstEntryMs = rows.map((row) => timestamp(row.opened_at)).filter((value): value is number => value != null).sort((left, right) => left - right)[0];
      return {
        entryStrategy,
        sourceTradeCount: rows.length,
        firstEntryAt: firstEntryMs == null ? null : new Date(firstEntryMs).toISOString(),
        scenarios: paperCapitalScenarios(rows, asOf, exitPolicy),
      };
    });
}
