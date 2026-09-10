export type MonthlyStrategyComparisonInput = {
  id: string;
  symbol: string;
  period: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number | null;
  endReturn: number | null;
  maxProfit: number | null;
  maxDrawdown: number | null;
  status: string;
};

export type MonthlyStrategyMembership = "BOTH" | "CLOSE_ONLY" | "OPEN_ONLY";

export type MonthlyStrategyComparisonRow = {
  key: string;
  symbol: string;
  period: string;
  membership: MonthlyStrategyMembership;
  close: MonthlyStrategyComparisonInput | null;
  open: MonthlyStrategyComparisonInput | null;
  endReturnDifference: number | null;
};

const rowKey = (row: MonthlyStrategyComparisonInput) => `${row.period}\u0000${row.symbol}`;

export function buildMonthlyStrategyComparison(
  closeRows: MonthlyStrategyComparisonInput[],
  openRows: MonthlyStrategyComparisonInput[],
): MonthlyStrategyComparisonRow[] {
  const closeByKey = new Map(closeRows.map((row) => [rowKey(row), row]));
  const openByKey = new Map(openRows.map((row) => [rowKey(row), row]));
  const keys = new Set([...closeByKey.keys(), ...openByKey.keys()]);

  return [...keys]
    .map((key) => {
      const close = closeByKey.get(key) ?? null;
      const open = openByKey.get(key) ?? null;
      const [period, symbol] = key.split("\u0000");
      return {
        key,
        symbol,
        period,
        membership: close && open ? "BOTH" : close ? "CLOSE_ONLY" : "OPEN_ONLY",
        close,
        open,
        endReturnDifference:
          close?.endReturn != null && open?.endReturn != null
            ? open.endReturn - close.endReturn
            : null,
      } satisfies MonthlyStrategyComparisonRow;
    })
    .sort((left, right) => right.period.localeCompare(left.period) || left.symbol.localeCompare(right.symbol));
}

export function summarizeMonthlyStrategyComparison(rows: MonthlyStrategyComparisonRow[]) {
  const both = rows.filter((row) => row.membership === "BOTH").length;
  const closeOnly = rows.filter((row) => row.membership === "CLOSE_ONLY").length;
  const openOnly = rows.filter((row) => row.membership === "OPEN_ONLY").length;
  return {
    both,
    closeOnly,
    openOnly,
    total: rows.length,
    uniqueSymbols: new Set(rows.map((row) => row.symbol)).size,
  };
}
