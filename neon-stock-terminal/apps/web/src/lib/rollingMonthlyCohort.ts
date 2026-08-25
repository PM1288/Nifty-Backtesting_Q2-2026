export type RollingMonthlyCohortSummary = {
  scannerMatches: number;
  qualityEligible: number;
  matured: number;
  developing: number;
  winners: number;
  losers: number;
  averageReturnPct: number | null;
  averageProfitPct: number | null;
  averageLossPct: number | null;
  averageMaxProfitPct: number | null;
  averageMaxDrawdownPct: number | null;
};

function finiteValues(rows: Array<Record<string, any>>, key: string) {
  return rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function summarizeRollingMonthlyCohort(
  rows: Array<Record<string, any>>,
): RollingMonthlyCohortSummary {
  const returns = finiteValues(rows, "expiry_return_pct");
  const profits = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  return {
    scannerMatches: rows.length,
    qualityEligible: rows.filter((row) => row.entry_eligible === true).length,
    matured: rows.filter((row) => row.expiry_evaluation_status === "MATURED")
      .length,
    developing: rows.filter(
      (row) => row.expiry_evaluation_status === "DEVELOPING",
    ).length,
    winners: profits.length,
    losers: losses.length,
    averageReturnPct: average(returns),
    averageProfitPct: average(profits),
    averageLossPct: average(losses),
    averageMaxProfitPct: average(finiteValues(rows, "max_profit_pct")),
    averageMaxDrawdownPct: average(
      finiteValues(rows, "max_drawdown_pct"),
    ),
  };
}
