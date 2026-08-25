import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

export function registerTrendlyneSummary(app: Express, prisma: PrismaClient) {
  app.get("/v1/trendlyne-summary/dashboard", async (_req, res) => {
    const [summary, rows, houses, stocks, monthly, runs] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT count(*)::int AS reports,
          count(*) FILTER (WHERE direction IN ('LONG','SHORT'))::int AS actionable,
          count(*) FILTER (WHERE evaluation_status='OPEN_DEVELOPING')::int AS developing,
          count(*) FILTER (WHERE data_quality_status<>'VALID')::int AS data_issues,
          count(*) FILTER (WHERE target_eligible AND (target_hit OR d30_status='MATURED'))::int AS resolved_targets,
          count(*) FILTER (WHERE target_hit)::int AS target_hits,
          round(100.0*count(*) FILTER (WHERE target_hit)/nullif(count(*) FILTER (WHERE target_eligible AND (target_hit OR d30_status='MATURED')),0),2) AS target_hit_rate_pct,
          round(avg(d5_end_return_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_return_pct,
          round(avg(d30_end_return_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_return_pct,
          round(avg(d5_max_profit_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_max_profit_pct,
          round(avg(d5_max_drawdown_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_max_drawdown_pct,
          round(avg(d30_max_profit_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_max_profit_pct,
          round(avg(d30_max_drawdown_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_max_drawdown_pct,
          min(report_date) AS window_start,max(report_date) AS window_end,max(refreshed_at) AS refreshed_at
        FROM research.trendlyne_recommendation_evaluation`),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT e.*,p.company_name AS profile_company_name,p.sector AS profile_sector,
          p.market_cap_bucket,p.is_nifty_50,p.is_nifty_100,p.is_nifty_200,
          p.is_nifty_largemidcap_250,p.is_nifty_500,p.is_nse_fno
        FROM research.trendlyne_recommendation_evaluation e
        LEFT JOIN public.instrument_profiles p ON p.symbol=e.symbol
        ORDER BY e.report_date DESC,e.report_id DESC`),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT research_house,
          count(*) FILTER (WHERE direction IN ('LONG','SHORT'))::int AS actionable,
          count(*) FILTER (WHERE target_eligible AND (target_hit OR d30_status='MATURED'))::int AS resolved_targets,
          count(*) FILTER (WHERE target_hit)::int AS target_hits,
          round(100.0*count(*) FILTER (WHERE target_hit)/nullif(count(*) FILTER (WHERE target_eligible AND (target_hit OR d30_status='MATURED')),0),2) AS target_hit_rate_pct,
          round(avg(d5_end_return_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_return_pct,
          round(avg(d30_end_return_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_return_pct,
          round(avg(d30_max_profit_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_max_profit_pct,
          round(avg(d30_max_drawdown_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_max_drawdown_pct,
          count(*) FILTER (WHERE data_quality_status<>'VALID')::int AS data_issues
        FROM research.trendlyne_recommendation_evaluation
        GROUP BY research_house ORDER BY target_hit_rate_pct DESC NULLS LAST, resolved_targets DESC,research_house`),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT symbol,min(stock_name) AS stock_name,count(*)::int AS reports,
          count(*) FILTER (WHERE direction IN ('LONG','SHORT'))::int AS actionable,
          count(*) FILTER (WHERE target_hit)::int AS target_hits,
          round(avg(d5_end_return_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_return_pct,
          round(avg(d30_end_return_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_return_pct,
          round(max(d30_max_profit_pct),2) AS best_30d_max_profit_pct,
          round(min(d30_max_drawdown_pct),2) AS worst_30d_max_drawdown_pct,
          max(report_date) AS latest_report_date
        FROM research.trendlyne_recommendation_evaluation
        GROUP BY symbol ORDER BY reports DESC,symbol`),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT date_trunc('month',report_date)::date AS month,count(*)::int AS reports,
          count(*) FILTER (WHERE direction IN ('LONG','SHORT'))::int AS actionable,
          count(*) FILTER (WHERE target_hit)::int AS target_hits,
          round(avg(d5_end_return_pct) FILTER (WHERE d5_status='MATURED'),2) AS average_d5_return_pct,
          round(avg(d30_end_return_pct) FILTER (WHERE d30_status='MATURED'),2) AS average_d30_return_pct
        FROM research.trendlyne_recommendation_evaluation GROUP BY 1 ORDER BY 1`),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT run_id,trigger,status,started_at,completed_at,pages_scraped,reports_seen,
          reports_inserted,known_reports_skipped,errors,detail->'recommendation_analysis' AS recommendation_analysis
        FROM research.trendlyne_scraper_run ORDER BY started_at DESC LIMIT 10`),
    ]);
    res.json({
      strategyFamily: "TRENDLYNE_RESEARCH_SUMMARY",
      source: "Trendlyne public research-report listing",
      window: "TRAILING_SIX_MONTHS",
      methodology: {
        entry: "Trendlyne price at recommendation; next NSE session open only when that field is unavailable",
        pathStart: "First NSE trading session strictly after the report date because report publication time is unavailable",
        target: "Directional target hit uses daily high for LONG and daily low for SHORT",
        horizons: "First 5 and first 30 observed NSE trading sessions after the report date",
        ranking: "Target hit rate uses resolved targets only: target hit or 30-session maturity; minimum samples must remain visible",
      },
      summary: summary[0] ?? {}, rows, houseSummary: houses, stockSummary: stocks,
      monthlySummary: monthly, scraperRuns: runs,
      warnings: [
        "Trendlyne reports are third-party research evidence, not application-generated advice.",
        "HOLD and NEUTRAL reports remain visible but are excluded from directional track records.",
        "Directionally inconsistent or missing targets remain visible and are excluded from target-hit denominators.",
        "Daily OHLC cannot prove intraday ordering; target hits use the first qualifying daily bar.",
      ],
    });
  });
}
