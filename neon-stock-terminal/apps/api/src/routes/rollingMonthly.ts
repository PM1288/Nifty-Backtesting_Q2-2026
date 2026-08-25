import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL = /^[A-Z0-9&-]{1,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YEAR = /^20\d{2}$/;
const MONTH = /^(0[1-9]|1[0-2])$/;
const ABSOLUTE_MONTH_VERSION = "absolute_monthly_closure_bullish_long_v1";
const ABSOLUTE_FIRST_SESSION_VERSION = "absolute_monthly_first_session_gap_fill_long_v1";
const RESEARCH_NOTIONAL = 100_000;
const FIRST_SESSION_NOTIONAL = 10_000;

function clean(value: unknown, maximum = 32) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function csv(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const absoluteColumns = [
  "evaluation_month", "symbol", "company_name", "sector", "signal_date", "entry_date",
  "entry_price", "evaluation_end_date", "evaluation_status", "observed_post_entry_sessions",
  "month_two_open", "month_two_close", "month_one_open", "month_one_close",
  "monthly_ema9", "monthly_close_above_ema9", "monthly_candle_above_ema9_pct",
  "current_week_open", "current_week_close_asof", "previous_week_open", "previous_week_close",
  "previous_day_open", "previous_day_close", "signal_day_open", "signal_day_close",
  "path_end_price", "end_return_pct", "max_profit_price", "max_profit_pct", "max_profit_date",
  "max_drawdown_price", "max_drawdown_pct", "max_drawdown_date", "profit_per_share",
  "max_profit_per_share", "max_drawdown_per_share", "conditions", "source_provenance", "data_quality",
] as const;

const absoluteFirstSessionColumns = [
  "evaluation_month", "symbol", "company_name", "sector", "gap_threshold_pct", "first_session_date",
  "previous_session_date", "previous_close", "first_session_open", "opening_gap_pct", "entry_mode",
  "entry_status", "entry_date", "entry_price", "evaluation_end_date", "evaluation_status",
  "month_two_open", "month_two_close", "month_one_open", "month_one_close",
  "monthly_ema9", "monthly_close_above_ema9", "monthly_candle_above_ema9_pct",
  "anchor_day_open", "anchor_vs_previous_week_open_pct", "completed_week_open",
  "completed_week_close", "prior_week_open", "prior_week_close", "path_end_price", "end_return_pct",
  "profit_per_share", "max_profit_price", "max_profit_pct", "max_profit_per_share", "max_profit_date",
  "max_drawdown_price", "max_drawdown_pct", "max_drawdown_per_share", "max_drawdown_date",
  "quantity_10000", "invested_10000", "end_pnl_10000", "max_profit_10000", "max_drawdown_10000",
  "conditions", "source_provenance", "data_quality",
] as const;

function spreadsheetXml(sheets: Array<{ name: string; rows: Array<Record<string, unknown>>; columns: readonly string[] }>) {
  const worksheets = sheets.map((sheet) => {
    const header = `<Row>${sheet.columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xml(column)}</Data></Cell>`).join("")}</Row>`;
    const rows = sheet.rows.map((row) => `<Row>${sheet.columns.map((column) => {
      const raw = row[column];
      const numeric = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)));
      const value = typeof raw === "object" && raw !== null ? JSON.stringify(raw) : raw;
      return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${xml(value)}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${xml(sheet.name.slice(0, 31))}"><Table>${header}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style></Styles>${worksheets}</Workbook>`;
}

export function registerRollingMonthly(app: Express, prisma: PrismaClient) {
  app.get("/v1/rolling-monthly/absolute-months", async (req, res) => {
    const year = clean(req.query.year, 4);
    const month = clean(req.query.month, 2);
    if (year && !YEAR.test(year)) return void res.status(400).json({ error: "year must be YYYY" });
    if (month && !MONTH.test(month)) return void res.status(400).json({ error: "month must be MM" });
    const [runs, candidates, evaluations, monthlySummary, yearlySummary] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.absolute_month_run WHERE strategy_version=$1
         ORDER BY evaluation_month DESC`, ABSOLUTE_MONTH_VERSION),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.absolute_month_candidate
         WHERE strategy_version=$1
           AND ($2='' OR extract(year FROM evaluation_month)::int=$2::int)
           AND ($3='' OR extract(month FROM evaluation_month)::int=$3::int)
         ORDER BY evaluation_month DESC,signal_date,symbol`, ABSOLUTE_MONTH_VERSION, year, month),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT e.*,p.market_cap_bucket,p.is_nifty_50,p.is_nifty_100,p.is_nifty_200,
          p.is_nifty_largemidcap_250,p.is_nifty_500,p.is_nse_fno
         FROM rolling_monthly.evaluation_ledger e
         LEFT JOIN public.instrument_profiles p USING(symbol)
         WHERE e.variant='ABSOLUTE_MONTH'
           AND ($1='' OR extract(year FROM e.evaluation_month)::int=$1::int)
           AND ($2='' OR extract(month FROM e.evaluation_month)::int=$2::int)
         ORDER BY e.evaluation_month DESC,e.symbol`, year, month),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT evaluation_month,count(*)::int AS opportunities,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int AS eligible_opportunities,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int AS winners,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct<0)::int AS losers,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct=0)::int AS flat,
          avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_end_return_pct,
          sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS sum_end_return_pct,
          avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_max_profit_pct,
          max(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS highest_max_profit_pct,
          avg(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_max_drawdown_pct,
          min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS worst_max_drawdown_pct,
          sum(GREATEST(end_return_pct,0)) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_gross_profit,
          sum(LEAST(end_return_pct,0)) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_gross_loss,
          sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_net_pnl
         FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=$1
         GROUP BY evaluation_month ORDER BY evaluation_month DESC`, ABSOLUTE_MONTH_VERSION, RESEARCH_NOTIONAL),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT extract(year FROM evaluation_month)::int AS "year",count(*)::int AS opportunities,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int AS eligible_opportunities,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int AS winners,
          count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct<0)::int AS losers,
          avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_end_return_pct,
          sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS sum_end_return_pct,
          avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_max_profit_pct,
          max(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS highest_max_profit_pct,
          avg(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS average_max_drawdown_pct,
          min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') AS worst_max_drawdown_pct,
          sum(GREATEST(end_return_pct,0)) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_gross_profit,
          sum(LEAST(end_return_pct,0)) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_gross_loss,
          sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 AS hypothetical_net_pnl
         FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=$1
         GROUP BY extract(year FROM evaluation_month) ORDER BY year DESC`, ABSOLUTE_MONTH_VERSION, RESEARCH_NOTIONAL),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      strategyFamily: "ROLLING_MONTHLY", variant: "ABSOLUTE_MONTHLY_CLOSURE", strategyVersion: ABSOLUTE_MONTH_VERSION,
      independentFromOiis: true, paperTradingConnected: false, researchNotionalPerOpportunity: RESEARCH_NOTIONAL,
      methodology: runs[0]?.methodology ?? null, runs, monthlySummary, yearlySummary, candidates, evaluations,
      warnings: [
        "Research entry is the signal-session close; same-session high and low are excluded from MFE/MAE.",
        "Current F&O membership is applied retrospectively because point-in-time historical membership is unavailable.",
        "Returns are gross before costs and taxes; hypothetical rupees use equal ₹100,000 research notional per opportunity.",
        "INCOMPLETE candidate paths remain visible but are excluded from aggregate performance and hypothetical P&L.",
      ],
    });
  });

  app.get("/v1/rolling-monthly/absolute-months/export", async (req, res) => {
    const year = clean(req.query.year, 4);
    const month = clean(req.query.month, 2);
    const format = clean(req.query.format, 8).toLowerCase() || "csv";
    if (year && !YEAR.test(year)) return void res.status(400).json({ error: "year must be YYYY" });
    if (month && !MONTH.test(month)) return void res.status(400).json({ error: "month must be MM" });
    if (!['csv', 'xls'].includes(format)) return void res.status(400).json({ error: "format must be csv or xls" });
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM rolling_monthly.absolute_month_candidate
       WHERE strategy_version=$1 AND ($2='' OR extract(year FROM evaluation_month)::int=$2::int)
         AND ($3='' OR extract(month FROM evaluation_month)::int=$3::int)
       ORDER BY evaluation_month DESC,signal_date,symbol`, ABSOLUTE_MONTH_VERSION, year, month);
    const monthly = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT evaluation_month,count(*)::int opportunities,
        count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int eligible_opportunities,
        avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_end_return_pct,
        avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_profit_pct,
        min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') worst_max_drawdown_pct,
        sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 hypothetical_net_pnl
       FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=$1
       GROUP BY evaluation_month ORDER BY evaluation_month`, ABSOLUTE_MONTH_VERSION, RESEARCH_NOTIONAL);
    const yearly = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT extract(year FROM evaluation_month)::int AS "year",count(*)::int opportunities,
        count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int eligible_opportunities,
        avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_end_return_pct,
        avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_profit_pct,
        min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') worst_max_drawdown_pct,
        sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*$2/100 hypothetical_net_pnl
       FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=$1
       GROUP BY extract(year FROM evaluation_month) ORDER BY year`, ABSOLUTE_MONTH_VERSION, RESEARCH_NOTIONAL);
    const stamp = [year || "all", month || "all"].join("-");
    if (format === "csv") {
      const body = [absoluteColumns.join(","), ...rows.map((row) => absoluteColumns.map((column) => csv(row[column])).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="absolute-monthly-${stamp}.csv"`);
      return void res.send(`\uFEFF${body}`);
    }
    const monthlyColumns = ["evaluation_month", "opportunities", "eligible_opportunities", "average_end_return_pct", "average_max_profit_pct", "worst_max_drawdown_pct", "hypothetical_net_pnl"];
    const yearlyColumns = ["year", "opportunities", "eligible_opportunities", "average_end_return_pct", "average_max_profit_pct", "worst_max_drawdown_pct", "hypothetical_net_pnl"];
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="absolute-monthly-${stamp}.xls"`);
    res.send(spreadsheetXml([
      { name: "Opportunities", rows, columns: absoluteColumns },
      { name: "Monthly Summary", rows: monthly, columns: monthlyColumns },
      { name: "Yearly Summary", rows: yearly, columns: yearlyColumns },
    ]));
  });

  app.get("/v1/rolling-monthly/absolute-month-candidates/:candidateId/chart", async (req, res) => {
    const candidateId = clean(req.params.candidateId, 36);
    if (!UUID.test(candidateId)) return void res.status(400).json({ error: "Invalid candidateId" });
    const candidate = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM rolling_monthly.absolute_month_candidate WHERE candidate_id=$1::uuid`, candidateId);
    if (!candidate.length) return void res.status(404).json({ error: "Absolute Monthly candidate not found" });
    const row = candidate[0];
    const bars = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `WITH yahoo AS (
         SELECT trade_date,open_price AS open,high_price AS high,low_price AS low,close_price AS close,
           volume::double precision AS volume,'YAHOO_FINANCE_SPLIT_ADJUSTED_OHLC'::text source,0 priority
         FROM strategy_eval.stock_daily_regime
         WHERE yahoo_symbol=ANY(ARRAY[$1 || '.NS',CASE WHEN $1='LTM' THEN 'LTIM.NS' ELSE $1 || '.NS' END])
           AND trade_date BETWEEN ($2::date-interval '4 months')::date AND $3::date
       ), official AS (
         SELECT trade_date,open_price AS open,high_price AS high,low_price AS low,close_price AS close,
           total_traded_qty::double precision AS volume,'NSE_EOD_BHAVCOPY'::text source,1 priority
         FROM nse.fact_eod_prices WHERE series='EQ'
           AND CASE WHEN symbol='LTIM' THEN 'LTM' ELSE symbol END=$1
           AND trade_date BETWEEN ($2::date-interval '4 months')::date AND $3::date
       ), rest AS (
         SELECT b.trade_date,b.open,b.high,b.low,b.close,b.volume::double precision AS volume,'SMARTAPI_REST_DAILY'::text source,2 priority
         FROM public.bars_1d b JOIN public.instruments i ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
         WHERE b.exchange='NSE' AND CASE WHEN i.name='LTIM' THEN 'LTM' ELSE i.name END=$1
           AND b.trade_date BETWEEN ($2::date-interval '4 months')::date AND $3::date
       ), combined AS (SELECT * FROM yahoo UNION ALL SELECT * FROM official UNION ALL SELECT * FROM rest)
       SELECT DISTINCT ON (trade_date) trade_date,open,high,low,close,volume,source
       FROM combined ORDER BY trade_date,priority`, row.symbol, row.signal_date, row.evaluation_end_date);
    res.json({ candidate: row, timeframe: "1D", source: "Yahoo split-adjusted OHLC with NSE EOD and SmartAPI REST latest-session fallback", bars });
  });

  app.get("/v1/rolling-monthly/absolute-first-session", async (req, res) => {
    const year = clean(req.query.year, 4);
    const month = clean(req.query.month, 2);
    const threshold = clean(req.query.threshold, 4) || "0.50";
    if (year && !YEAR.test(year)) return void res.status(400).json({ error: "year must be YYYY" });
    if (month && !MONTH.test(month)) return void res.status(400).json({ error: "month must be MM" });
    if (!['0.50', '0.5', '1.00', '1.0', '1'].includes(threshold)) return void res.status(400).json({ error: "threshold must be 0.50 or 1.00" });
    const summarySelect = `count(*)::int scenarios,
      count(*) FILTER (WHERE entry_status='ENTERED')::int entered,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE')::int path_evaluable,
      count(*) FILTER (WHERE entry_status='NOT_ENTERED_GAP_UNFILLED')::int unfilled,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int winners,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND end_return_pct<0)::int losers,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_profit_pct>=1)::int profit_target_1_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_profit_pct>=2)::int profit_target_2_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_profit_pct>=3)::int profit_target_3_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_profit_pct>=5)::int profit_target_5_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_profit_pct>=10)::int profit_target_10_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_drawdown_pct<=-1)::int drawdown_1_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_drawdown_pct<=-2)::int drawdown_2_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_drawdown_pct<=-3)::int drawdown_3_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_drawdown_pct<=-5)::int drawdown_5_count,
      count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND max_drawdown_pct<=-10)::int drawdown_10_count,
      avg(end_return_pct) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') average_end_return_pct,
      sum(profit_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_end_pnl,
      sum(max_profit_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_max_profit,
      sum(max_drawdown_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_max_drawdown,
      sum(invested_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') invested_10000,
      sum(end_pnl_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') end_pnl_10000,
      sum(max_profit_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') max_profit_10000,
      sum(max_drawdown_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') max_drawdown_10000`;
    const [runs, candidates, monthlySummary, yearlySummary, totals] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.absolute_first_session_run WHERE strategy_version=$1 ORDER BY evaluation_month DESC`,
        ABSOLUTE_FIRST_SESSION_VERSION),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.absolute_first_session_candidate WHERE strategy_version=$1
         AND ($2='' OR extract(year FROM evaluation_month)::int=$2::int)
         AND ($3='' OR extract(month FROM evaluation_month)::int=$3::int)
         AND gap_threshold_pct=$4::numeric ORDER BY evaluation_month DESC,first_session_date,symbol`,
        ABSOLUTE_FIRST_SESSION_VERSION, year, month, threshold),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT evaluation_month,${summarySelect} FROM rolling_monthly.absolute_first_session_candidate
         WHERE strategy_version=$1 AND gap_threshold_pct=$2::numeric
         GROUP BY evaluation_month ORDER BY evaluation_month DESC`, ABSOLUTE_FIRST_SESSION_VERSION, threshold),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT extract(year FROM evaluation_month)::int AS "year",${summarySelect}
         FROM rolling_monthly.absolute_first_session_candidate
         WHERE strategy_version=$1 AND gap_threshold_pct=$2::numeric
         GROUP BY extract(year FROM evaluation_month) ORDER BY "year" DESC`, ABSOLUTE_FIRST_SESSION_VERSION, threshold),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT ${summarySelect} FROM rolling_monthly.absolute_first_session_candidate
         WHERE strategy_version=$1 AND gap_threshold_pct=$2::numeric
         AND ($3='' OR extract(year FROM evaluation_month)::int=$3::int)
         AND ($4='' OR extract(month FROM evaluation_month)::int=$4::int)`,
        ABSOLUTE_FIRST_SESSION_VERSION, threshold, year, month),
    ]);
    res.json({
      generatedAt: new Date().toISOString(), strategyVersion: ABSOLUTE_FIRST_SESSION_VERSION,
      gapThresholdPct: Number(threshold), researchNotionalPerOpportunity: FIRST_SESSION_NOTIONAL,
      performanceThresholdsPct: [1, 2, 3, 5, 10],
      runs, candidates, monthlySummary, yearlySummary, totals: totals[0] ?? {},
      warnings: [
        "This is an isolated research variant; it does not replace the existing Absolute Monthly analysis.",
        "Eligibility uses completed monthly and weekly candles available before the first session opens.",
        "A significant gap-up waits for a same-month fill to the prior close; an unfilled gap is not counted as a trade.",
        "Historical membership uses the current recognized stock F&O universe and therefore has survivorship bias.",
        "Gross scenarios exclude brokerage, taxes, slippage and liquidity limits.",
      ],
    });
  });

  app.get("/v1/rolling-monthly/absolute-first-session/export", async (req, res) => {
    const year = clean(req.query.year, 4);
    const month = clean(req.query.month, 2);
    const threshold = clean(req.query.threshold, 4) || "0.50";
    const format = clean(req.query.format, 8).toLowerCase() || "csv";
    if (year && !YEAR.test(year)) return void res.status(400).json({ error: "year must be YYYY" });
    if (month && !MONTH.test(month)) return void res.status(400).json({ error: "month must be MM" });
    if (!['0.50', '0.5', '1.00', '1.0', '1'].includes(threshold)) return void res.status(400).json({ error: "threshold must be 0.50 or 1.00" });
    if (!['csv', 'xls'].includes(format)) return void res.status(400).json({ error: "format must be csv or xls" });
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM rolling_monthly.absolute_first_session_candidate WHERE strategy_version=$1
       AND ($2='' OR extract(year FROM evaluation_month)::int=$2::int)
       AND ($3='' OR extract(month FROM evaluation_month)::int=$3::int)
       AND gap_threshold_pct=$4::numeric ORDER BY evaluation_month DESC,symbol`,
      ABSOLUTE_FIRST_SESSION_VERSION, year, month, threshold);
    const stamp = [year || "all", month || "all", `gap-${threshold}`].join("-");
    if (format === "csv") {
      const body = [absoluteFirstSessionColumns.join(","), ...rows.map((row) => absoluteFirstSessionColumns.map((column) => csv(row[column])).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="absolute-first-session-${stamp}.csv"`);
      return void res.send(`\uFEFF${body}`);
    }
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="absolute-first-session-${stamp}.xls"`);
    res.send(spreadsheetXml([{ name: "First Session Scenarios", rows, columns: absoluteFirstSessionColumns }]));
  });

  app.get("/v1/rolling-monthly/absolute-first-session/:candidateId/chart", async (req, res) => {
    const candidateId = clean(req.params.candidateId, 36);
    if (!UUID.test(candidateId)) return void res.status(400).json({ error: "Invalid candidateId" });
    const candidate = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM rolling_monthly.absolute_first_session_candidate WHERE candidate_id=$1::uuid`, candidateId);
    if (!candidate.length) return void res.status(404).json({ error: "Absolute first-session scenario not found" });
    const row = candidate[0];
    const bars = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `WITH yahoo AS (
         SELECT trade_date,open_price AS open,high_price AS high,low_price AS low,close_price AS close,
           volume::double precision AS volume,'YAHOO_FINANCE_SPLIT_ADJUSTED_OHLC'::text source,0 priority
         FROM strategy_eval.stock_daily_regime
         WHERE yahoo_symbol=ANY(ARRAY[$1 || '.NS',CASE WHEN $1='LTM' THEN 'LTIM.NS' ELSE $1 || '.NS' END])
           AND trade_date BETWEEN ($2::date-interval '4 months')::date AND $3::date
       ), official AS (
         SELECT trade_date,open_price AS open,high_price AS high,low_price AS low,close_price AS close,
           total_traded_qty::double precision AS volume,'NSE_EOD_BHAVCOPY'::text source,1 priority
         FROM nse.fact_eod_prices WHERE series='EQ' AND CASE WHEN symbol='LTIM' THEN 'LTM' ELSE symbol END=$1
           AND trade_date BETWEEN ($2::date-interval '4 months')::date AND $3::date
       ), combined AS (SELECT * FROM yahoo UNION ALL SELECT * FROM official)
       SELECT DISTINCT ON (trade_date) trade_date,open,high,low,close,volume,source
       FROM combined ORDER BY trade_date,priority`, row.symbol, row.first_session_date, row.evaluation_end_date);
    res.json({ candidate: row, timeframe: "1D", source: "Yahoo split-adjusted OHLC with NSE EOD fallback", bars });
  });

  app.get("/v1/rolling-monthly/expiry-candidates/:candidateId/chart", async (req, res) => {
    const candidateId = clean(req.params.candidateId, 36);
    if (!UUID.test(candidateId)) {
      res.status(400).json({ error: "Invalid candidateId" });
      return;
    }
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `WITH candidate_context AS (
         SELECT c.candidate_id,c.symbol,c.side,c.quality_band,c.quality_score,
           c.entry_eligible,c.entry_rejection_reason,c.component_snapshot,
           COALESCE(er.scheduled_expiry_date,c.signal_date) AS signal_expiry_date,
           c.signal_date,COALESCE(er.entry_date,c.entry_date) AS entry_date,c.entry_price,
           COALESCE(next_er.scheduled_expiry_date,
             (next_month_end - (((extract(dow FROM next_month_end)::int - 2 + 7) % 7) * interval '1 day'))::date
           ) AS next_expiry_date,
           ci.symbol_token
         FROM rolling_monthly.candidate c
         LEFT JOIN rolling_monthly.expiry_run er ON er.run_id=c.run_id
         LEFT JOIN rolling_monthly.expiry_run next_er
           ON next_er.expiry_month=(date_trunc('month',COALESCE(er.expiry_month,c.signal_date))+interval '1 month')::date
         CROSS JOIN LATERAL (
           SELECT date_trunc('month',COALESCE(er.expiry_month,c.signal_date))+interval '2 months'-interval '1 day' AS next_month_end
         ) nm
         LEFT JOIN LATERAL (
           SELECT symbol_token FROM public.instruments i
           WHERE i.exchange='NSE' AND i.expiry IS NULL AND i.name=c.symbol
           ORDER BY CASE WHEN i.tradingsymbol=(i.name || '-EQ') THEN 0 ELSE 1 END,i.updated_at DESC
           LIMIT 1
         ) ci ON true
         WHERE c.candidate_id=$1::uuid
       ), daily AS (
         SELECT cc.*,d.trade_date,d.open,d.high,d.low,d.close,d.volume,
           date_trunc('week',d.trade_date)::date AS week_start
         FROM candidate_context cc
         LEFT JOIN public.bars_1d d ON d.exchange='NSE' AND d.symbol_token=cc.symbol_token
           AND d.trade_date >= cc.signal_expiry_date - interval '12 months'
           AND d.trade_date <= LEAST(COALESCE(cc.next_expiry_date,current_date),current_date)
       ), weekly AS (
         SELECT candidate_id,symbol,side,quality_band,quality_score,entry_eligible,
           entry_rejection_reason,component_snapshot,signal_expiry_date,signal_date,entry_date,entry_price,next_expiry_date,
           week_start,min(trade_date) AS first_session,max(trade_date) AS last_session,
           (array_agg(open ORDER BY trade_date))[1] AS open,max(high) AS high,min(low) AS low,
           (array_agg(close ORDER BY trade_date DESC))[1] AS close,sum(volume) AS volume
         FROM daily WHERE trade_date IS NOT NULL
         GROUP BY candidate_id,symbol,side,quality_band,quality_score,entry_eligible,
           entry_rejection_reason,component_snapshot,signal_expiry_date,signal_date,entry_date,entry_price,next_expiry_date,week_start
       )
       SELECT * FROM weekly ORDER BY week_start`,
      candidateId,
    );
    if (!rows.length) {
      res.status(404).json({ error: "Candidate or weekly bars not found" });
      return;
    }
    const first = rows[0];
    const last = rows[rows.length - 1];
    const events = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT DISTINCT ON (c.signal_date,c.entry_date,c.side)
          c.candidate_id,c.signal_date,c.entry_date,c.entry_price,c.signal_close,c.side,
          c.quality_band,c.quality_score,c.entry_eligible,c.entry_rejection_reason,
          c.deployment_action,c.maturity_state
         FROM rolling_monthly.candidate c
        WHERE c.symbol=$1
          AND c.signal_date >= $2::date
          AND c.signal_date <= $3::date
        ORDER BY c.signal_date,c.entry_date,c.side,c.entry_eligible DESC,c.updated_at DESC`,
      first.symbol,
      first.first_session,
      last.last_session,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      candidate: {
        candidateId: first.candidate_id,
        symbol: first.symbol,
        side: first.side,
        qualityBand: first.quality_band,
        qualityScore: first.quality_score,
        entryEligible: first.entry_eligible,
        entryRejectionReason: first.entry_rejection_reason,
        componentSnapshot: first.component_snapshot,
        signalExpiryDate: first.signal_expiry_date,
        signalDate: first.signal_date,
        entryDate: first.entry_date,
        entryPrice: first.entry_price,
        nextExpiryDate: first.next_expiry_date,
      },
      timeframe: "1W",
      source: "public.bars_1d aggregated by NSE trading week",
      bars: rows.map((row) => ({
        weekStart: row.week_start, firstSession: row.first_session,lastSession: row.last_session,
        open: row.open,high: row.high,low: row.low,close: row.close,volume: row.volume,
      })),
      qualificationEvents: events.map((event) => ({
        candidateId: event.candidate_id,
        signalDate: event.signal_date,
        entryDate: event.entry_date,
        signalClose: event.signal_close,
        entryPrice: event.entry_price,
        side: event.side,
        qualityBand: event.quality_band,
        qualityScore: event.quality_score,
        entryEligible: event.entry_eligible,
        entryRejectionReason: event.entry_rejection_reason,
        deploymentAction: event.deployment_action,
        maturityState: event.maturity_state,
        selected: String(event.candidate_id) === candidateId || (
          String(event.signal_date).slice(0, 10) === String(first.signal_date).slice(0, 10)
          && String(event.entry_date).slice(0, 10) === String(first.entry_date).slice(0, 10)
          && String(event.side) === String(first.side)
        ),
      })),
    });
  });

  app.get("/v1/rolling-monthly/dashboard", async (req, res) => {
    const requestedDate = clean(req.query.signalDate, 10);
    if (requestedDate && !DATE.test(requestedDate)) {
      res.status(400).json({ error: "signalDate must be YYYY-MM-DD" });
      return;
    }
    const runs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM rolling_monthly.run
       WHERE status='COMPLETED' AND ($1::date IS NULL OR signal_date=$1::date)
       ORDER BY signal_date DESC,completed_at DESC LIMIT 20`,
      requestedDate || null,
    );
    const latestRun = runs[0] ?? null;
    const runId = latestRun?.run_id ?? null;
    const [
      candidates,
      strategies,
      reference,
      heartbeat,
      availableDates,
      bandHistory,
      conditionEvidence,
      correlations,
      monthlyHistory,
      expiryRuns,
    ] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT candidate_id,run_id,base_strategy_id,derived_strategy_id,quality_factor_id,
          quality_factor_version,symbol,sector,side,signal_date,entry_date,signal_close,
          entry_price,primary_target_price,stop_price,universe_size,same_side_occurrence_count,
          quality_band,quality_score,mandatory_gate_pass,confirmation_count,entry_eligible,
          entry_rejection_reason,deployment_action,rank,scanner_evidence,component_snapshot,
          quality_reasons,data_quality,created_at
         FROM rolling_monthly.candidate WHERE run_id=$1::uuid
         ORDER BY CASE quality_band WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
           side,rank,symbol`,
        runId,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT strategy_id,version,side,base_strategy_id,scanner_segment,status,
          configuration_hash,configuration,created_at
         FROM rolling_monthly.strategy_version ORDER BY side`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.reference_metric
         WHERE factor_version='2.0.0-research' ORDER BY side,quality_band,metric_key`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.service_heartbeat WHERE service_name='rolling-monthly-runner'`,
      ),
      prisma.$queryRawUnsafe<Array<{ signal_date: Date }>>(
        `SELECT signal_date FROM rolling_monthly.run WHERE status='COMPLETED'
         ORDER BY signal_date DESC LIMIT 30`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.backtest_band_summary
         WHERE factor_version='2.0.0-research'
         ORDER BY side,scope,CASE quality_band WHEN 'BASELINE' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.backtest_condition_evidence
         WHERE factor_version='2.0.0-research'
         ORDER BY side,scope,abs(uplift_pp) DESC,condition_name`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.backtest_indicator_correlation
         WHERE factor_version='2.0.0-research'
         ORDER BY side,abs(spearman_clean_3) DESC,indicator_name`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM rolling_monthly.backtest_monthly_summary
         WHERE factor_version='2.0.0-research'
         ORDER BY signal_month DESC,side,quality_band`,
      ),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT er.*,r.quality_status,r.universe_size,r.nifty50_coverage,
          r.long_scanner_count,r.short_scanner_count,r.high_count,r.medium_count,r.low_count
         FROM rolling_monthly.expiry_run er
         LEFT JOIN rolling_monthly.run r ON r.run_id=er.run_id
         ORDER BY er.expiry_month DESC LIMIT 36`,
      ),
    ]);
    const expiryCandidates = await prisma.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
        `WITH expiry_base AS (
           SELECT er.*,
             (date_trunc('month',er.expiry_month) + interval '2 months' - interval '1 day') AS next_month_end
           FROM rolling_monthly.expiry_run er
         ), expiry_sequence AS (
           SELECT eb.*,
             COALESCE(
               lead(eb.scheduled_expiry_date) OVER (ORDER BY eb.expiry_month),
               (eb.next_month_end -
                 (((extract(dow FROM eb.next_month_end)::int - 2 + 7) % 7) * interval '1 day'))::date
             ) AS next_scheduled_expiry_date
           FROM expiry_base eb
         ), selected_expiry AS (
           SELECT * FROM expiry_sequence ORDER BY expiry_month DESC LIMIT 36
         ), canonical_instrument AS (
           SELECT DISTINCT ON (name) name,symbol_token
           FROM public.instruments
           WHERE exchange='NSE' AND expiry IS NULL AND name IS NOT NULL
           ORDER BY name,
             CASE WHEN tradingsymbol=(name || '-EQ') THEN 0 WHEN instrumenttype='' THEN 1 ELSE 2 END,
             updated_at DESC
         ), base AS (
           SELECT er.expiry_month,er.scheduled_expiry_date,
             er.next_scheduled_expiry_date,
             er.signal_date AS expiry_signal_date,
             er.entry_date AS expiry_entry_date,c.*,
             ci.symbol_token
           FROM selected_expiry er
           JOIN rolling_monthly.candidate c ON c.run_id=er.run_id
           LEFT JOIN canonical_instrument ci ON ci.name=c.symbol
         )
         SELECT b.expiry_month,b.scheduled_expiry_date,b.next_scheduled_expiry_date,
           b.expiry_signal_date,b.expiry_entry_date,
           b.candidate_id,b.symbol,b.sector,b.side,b.quality_band,b.quality_score,
           b.entry_eligible,b.entry_rejection_reason,b.rank,b.entry_price,b.primary_target_price,
           b.stop_price,b.confirmation_count,b.mandatory_gate_pass,b.scanner_evidence,
           b.component_snapshot,b.quality_reasons,b.data_quality,
           obs.observed_sessions,obs.current_price,obs.current_price_date,
           obs.current_return_pct,obs.mfe_to_date_pct,obs.mae_to_date_pct,
           obs.max_profit_pct,obs.max_profit_date,
           obs.max_drawdown_pct,obs.max_drawdown_date,
           obs.window_start_date,obs.window_end_date,
           CASE
             WHEN b.symbol_token IS NULL OR obs.observed_sessions=0 THEN 'NO_DATA'
             WHEN b.next_scheduled_expiry_date IS NULL OR
               b.next_scheduled_expiry_date > current_date THEN 'DEVELOPING'
             WHEN obs.window_end_date=b.next_scheduled_expiry_date THEN 'MATURED'
             ELSE 'INCOMPLETE'
           END AS expiry_evaluation_status,
           obs.current_return_pct AS expiry_return_pct,
           obs.d5_target_date,obs.d5_adverse_date,
           CASE
             WHEN obs.d5_sessions < 5 THEN 'PENDING'
             WHEN obs.d5_target_date IS NOT NULL AND
               (obs.d5_adverse_date IS NULL OR obs.d5_target_date < obs.d5_adverse_date) THEN 'SUCCESS'
             ELSE 'FAILED'
           END AS d5_outcome,
           obs.d5_sessions,
           CASE WHEN obs.d5_sessions < 5 THEN 'DEVELOPING'
             WHEN obs.d5_target_date IS NOT NULL AND obs.d5_adverse_date=obs.d5_target_date
               THEN 'ADVERSE_FIRST_SAME_DAILY_BAR'
             WHEN obs.d5_target_date IS NOT NULL AND
               (obs.d5_adverse_date IS NULL OR obs.d5_target_date < obs.d5_adverse_date)
               THEN 'TARGET_FIRST'
             WHEN obs.d5_adverse_date IS NOT NULL THEN 'ADVERSE_FIRST'
             ELSE 'NO_TARGET' END AS chronology
         FROM base b
         LEFT JOIN LATERAL (
           WITH path AS (
             SELECT d.trade_date,d.open,d.high,d.low,d.close,
               row_number() OVER (ORDER BY d.trade_date) AS session_number
             FROM public.bars_1d d
             WHERE d.exchange='NSE' AND d.symbol_token=b.symbol_token
               AND d.trade_date >= b.expiry_entry_date
               AND d.trade_date <= LEAST(
                 COALESCE(b.next_scheduled_expiry_date,current_date),
                 current_date
               )
           )
           SELECT count(*)::int AS observed_sessions,
             min(trade_date) AS window_start_date,
             max(trade_date) AS window_end_date,
             (array_agg(close ORDER BY trade_date DESC))[1] AS current_price,
             max(trade_date) AS current_price_date,
             CASE WHEN b.side='LONG'
               THEN 100*((array_agg(close ORDER BY trade_date DESC))[1]/NULLIF(b.entry_price,0)-1)
               ELSE 100*(1-(array_agg(close ORDER BY trade_date DESC))[1]/NULLIF(b.entry_price,0)) END AS current_return_pct,
             CASE WHEN b.side='LONG' THEN 100*(max(high)/NULLIF(b.entry_price,0)-1)
               ELSE 100*(1-min(low)/NULLIF(b.entry_price,0)) END AS mfe_to_date_pct,
             CASE WHEN b.side='LONG' THEN 100*(1-min(low)/NULLIF(b.entry_price,0))
               ELSE 100*(max(high)/NULLIF(b.entry_price,0)-1) END AS mae_to_date_pct,
             CASE WHEN b.side='LONG' THEN 100*(max(high)/NULLIF(b.entry_price,0)-1)
               ELSE 100*(1-min(low)/NULLIF(b.entry_price,0)) END AS max_profit_pct,
             CASE WHEN b.side='LONG'
               THEN (array_agg(trade_date ORDER BY high DESC,trade_date))[1]
               ELSE (array_agg(trade_date ORDER BY low ASC,trade_date))[1]
             END AS max_profit_date,
             CASE WHEN b.side='LONG' THEN 100*(min(low)/NULLIF(b.entry_price,0)-1)
               ELSE 100*(1-max(high)/NULLIF(b.entry_price,0)) END AS max_drawdown_pct,
             CASE WHEN b.side='LONG'
               THEN (array_agg(trade_date ORDER BY low ASC,trade_date))[1]
               ELSE (array_agg(trade_date ORDER BY high DESC,trade_date))[1]
             END AS max_drawdown_date,
             count(*) FILTER (WHERE session_number<=5)::int AS d5_sessions,
             min(trade_date) FILTER (WHERE session_number<=5 AND
               CASE WHEN b.side='LONG' THEN high>=b.entry_price*1.03 ELSE low<=b.entry_price*0.97 END) AS d5_target_date,
             min(trade_date) FILTER (WHERE session_number<=5 AND
               CASE WHEN b.side='LONG' THEN low<=b.entry_price*0.98 ELSE high>=b.entry_price*1.02 END) AS d5_adverse_date
           FROM path
         ) obs ON true
         ORDER BY b.expiry_month DESC,
           CASE b.quality_band WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
           b.side,b.rank,b.symbol`,
      );
    const evidenceRelease = await prisma.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `SELECT factor_version,status,source_label,source_sha256,evaluated_through,
        maturity_policy,audit_metrics,blocking_reasons,audited_at,approved_at
       FROM rolling_monthly.evidence_release
       WHERE factor_version='2.0.0-research'`,
    );
    const actionable = candidates.filter(
      (row) =>
        ["HIGH", "MEDIUM"].includes(String(row.quality_band)) &&
        row.entry_eligible === true,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      strategyFamily: "ROLLING_MONTHLY",
      independentFromOiis: true,
      paperTradingConnected: false,
      factorId: "rolling_monthly_technical_quality_factor_v2",
      factorVersion: latestRun?.factor_version ?? "2.1.0-research",
      latestRun,
      availableDates,
      candidates,
      qualifyingCandidates: actionable,
      strategies,
      referenceMetrics: reference,
      backtestHistory: {
        sourceLabel:
          "Supplied five-year Rolling Monthly V2 research evaluation",
        sourceAsOf: "2026-08-07",
        periodStart: "2021-10-01",
        periodEnd: "2026-07-31",
        successDefinition:
          "Clean +3% reached by D+5 before a 2% adverse event under the daily-OHLC stop-first model.",
        bandSummary: bandHistory,
        conditionEvidence,
        correlations,
        monthlySummary: monthlyHistory,
        governance: evidenceRelease[0] ?? null,
      },
      expiryHistory: {
        anchor: "LAST_TUESDAY_MONTHLY_EXPIRY",
        entryRule:
          "Next valid exchange-session open after the expiry signal close.",
        cohortWindowRule:
          "Direction-normalized cash-equity performance from next-session entry through the following monthly expiry close. The latest unfinished cohort is measured only through the latest available daily bar.",
        cohortAverageRule:
          "Unweighted arithmetic mean across all six-condition base-scanner matches in the cohort; quality eligibility remains a separate field.",
        outcomeRule:
          "SUCCESS means +3% reached within five trading sessions before a 2% adverse event; a same daily bar is adverse-first.",
        months: expiryRuns,
        candidates: expiryCandidates,
      },
      serviceHeartbeat: heartbeat[0] ?? null,
      warnings: [
        "Research strategy only; no Paper Trading or broker-order connection.",
        "Current F&O membership is applied retrospectively.",
        "SHORT research uses the cash-equity underlying as a futures-price proxy.",
        "Daily OHLC cannot resolve intraday target/stop order; fixture uses stop-first.",
      ],
    });
  });

  app.get("/v1/rolling-monthly/candidates/:symbol", async (req, res) => {
    const symbol = clean(req.params.symbol).toUpperCase();
    if (!SYMBOL.test(symbol)) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }
    const history = await prisma.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `SELECT c.*,r.quality_status,r.data_as_of,r.source_max_date
       FROM rolling_monthly.candidate c JOIN rolling_monthly.run r USING(run_id)
       WHERE c.symbol=$1 ORDER BY c.signal_date DESC LIMIT 100`,
      symbol,
    );
    res.json({ symbol, history });
  });
}
