export const MIN_ACCEPTED_CLOSED_TRADES = 20;
export const MIN_STOCK_FIT_TRADES = 10;

export interface BacktestAcceptanceInput {
  totalReturnPct: number | null | undefined;
  totalClosedTrades: number | null | undefined;
}

export function passesBacktestAcceptance(input: BacktestAcceptanceInput): boolean {
  return (
    Number.isFinite(input.totalReturnPct) &&
    Number.isFinite(input.totalClosedTrades) &&
    (input.totalReturnPct as number) > 0 &&
    (input.totalClosedTrades as number) >= MIN_ACCEPTED_CLOSED_TRADES
  );
}

export function hasQualifiedStockFitSample(acceptedTrades: number | null | undefined): boolean {
  return Number.isFinite(acceptedTrades) && (acceptedTrades as number) >= MIN_STOCK_FIT_TRADES;
}
