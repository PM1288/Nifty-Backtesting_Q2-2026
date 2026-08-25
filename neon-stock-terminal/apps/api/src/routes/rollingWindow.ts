import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

const YEAR = /^20\d{2}$/;
const MONTH = /^(0[1-9]|1[0-2])$/;
const VERSION = "rolling_5_30_60_bullish_long_v1";

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function registerRollingWindow(app: Express, prisma: PrismaClient) {
  app.get("/v1/rolling-strategy/dashboard", async (req, res) => {
    const year = clean(req.query.year, 4);
    const month = clean(req.query.month, 2);
    const historyLimitText = clean(req.query.historyLimit, 4);
    if (year && !YEAR.test(year)) return void res.status(400).json({ error: "year must be YYYY" });
    if (month && !MONTH.test(month)) return void res.status(400).json({ error: "month must be MM" });
    if (historyLimitText && (!/^\d+$/.test(historyLimitText) || Number(historyLimitText) < 1 || Number(historyLimitText) > 5000)) {
      return void res.status(400).json({ error: "historyLimit must be between 1 and 5000" });
    }
    const historyLimit = historyLimitText ? Number(historyLimitText) : null;

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT c.*,
        p.company_name,p.sector,p.market_cap_bucket,p.is_nifty_50,p.is_nifty_100,
        p.is_nifty_200,p.is_nifty_largemidcap_250,p.is_nifty_500,p.is_nse_fno
      FROM rolling_monthly.rolling_window_candidate c
      JOIN public.instrument_profiles p USING(symbol)
      WHERE c.strategy_version=$1
        AND ($2='' OR extract(year FROM c.signal_date)::int=$2::int)
        AND ($3='' OR extract(month FROM c.signal_date)::int=$3::int)
      ORDER BY c.signal_date DESC,c.symbol
      LIMIT $4::int
    `, VERSION, year, month, historyLimit);
    const evaluations = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT e.*,p.company_name,p.sector,p.market_cap_bucket,p.is_nifty_50,p.is_nifty_100,
        p.is_nifty_200,p.is_nifty_largemidcap_250,p.is_nifty_500,p.is_nse_fno
      FROM rolling_monthly.rolling_window_evaluation e
      LEFT JOIN public.instrument_profiles p USING(symbol)
      WHERE e.strategy_version=$1
      ORDER BY e.signal_date DESC,e.selection_status,e.symbol
    `, VERSION);
    const refresh = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT source_end_date,universe_size,candidate_count,refreshed_at
      FROM rolling_monthly.rolling_window_refresh WHERE strategy_version=$1
    `, VERSION);

    const evaluable = rows.filter((row) => finite(row.end_return_pct) != null);
    const sum = (field: string) => evaluable.reduce((total, row) => total + (finite(row[field]) ?? 0), 0);
    const hit = (field: string) => evaluable.filter((row) => row[field] === true).length;
    const winnerCount = evaluable.filter((row) => (finite(row.end_return_pct) ?? 0) > 0).length;
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.json({
      strategyFamily: "ROLLING_5_30_60",
      independentFromMonthlyAnchors: true,
      independentFromOiis: true,
      universeRule: "NSE F&O union NIFTY LargeMidcap 250",
      refreshCadence: "Persisted by the strategy worker every 15 minutes; values advance with the latest ingested EOD session",
      refresh: refresh[0] ?? null,
      methodology: {
        signal: "First transition into a seven-condition LONG setup using trailing 60/30/10/5-session blocks",
        entry: "Next exchange-session open",
        exit: "30th subsequent exchange-session close, or latest available close while developing",
        duplicatePolicy: "Consecutive qualifying days are one signal; a new row requires the setup to leave and re-enter qualification",
        costs: "Gross research result before costs and taxes",
      },
      summary: {
        opportunities: rows.length,
        evaluable: evaluable.length,
        matured: rows.filter((row) => row.evaluation_status === "MATURED").length,
        developing: rows.filter((row) => row.evaluation_status === "DEVELOPING").length,
        winners: winnerCount,
        winRatePct: evaluable.length ? 100 * winnerCount / evaluable.length : null,
        pnl10000: sum("pnl_10000"),
        maxProfit10000: sum("max_profit_10000"),
        maxDrawdown10000: sum("max_drawdown_10000"),
        targets: [1, 3, 5].map((target) => ({
          targetPct: target,
          hitCount: hit(`hit_${target}_pct`),
          hitRatePct: evaluable.length ? 100 * hit(`hit_${target}_pct`) / evaluable.length : null,
        })),
        latestEvaluation: {
          total: evaluations.length,
          selected: evaluations.filter((row) => row.selection_status === "SELECTED").length,
          rejected: evaluations.filter((row) => row.selection_status === "REJECTED").length,
          incomplete: evaluations.filter((row) => row.selection_status === "INCOMPLETE").length,
          qualifiedContinuation: evaluations.filter((row) => row.selection_status === "QUALIFIED_CONTINUATION").length,
        },
      },
      rows,
      historyLimited: historyLimit != null,
      historyLimit,
      evaluations,
      warnings: [
        "Current index/F&O membership is applied retrospectively where point-in-time membership is unavailable.",
        "The latest 30-session paths remain DEVELOPING and are not presented as matured outcomes.",
        "Rolling evidence is data-through the latest successfully ingested daily session; the UI does not silently substitute a live mark.",
      ],
    });
  });
}
