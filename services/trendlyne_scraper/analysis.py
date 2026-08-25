"""Rebuild reproducible 5D/30D evidence for the latest six months of reports."""
from __future__ import annotations

from postgres import get_connection
from utils import LOGGER


REFRESH_SQL = r"""
WITH valid_reports AS (
  SELECT
    r.report_id,
    r.report_date::date AS report_date,
    upper(trim(r.nse_symbol)) AS symbol,
    coalesce(nullif(trim(r.stock_name),''), upper(trim(r.nse_symbol))) AS stock_name,
    coalesce(nullif(trim(r.research_house),''), nullif(trim(r.broker_name),''), 'Unknown') AS research_house,
    initcap(trim(r.recommendation)) AS recommendation,
    CASE
      WHEN upper(trim(r.recommendation)) IN ('BUY','ACCUMULATE') THEN 'LONG'
      WHEN upper(trim(r.recommendation))='SELL' THEN 'SHORT'
      ELSE 'NONE'
    END AS direction,
    nullif(r.price_at_recommendation,0)::numeric AS recommended_price,
    nullif(r.target_price,0)::numeric AS target_price,
    r.report_url
  FROM research.trendlyne_reports r
  WHERE r.report_date ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    AND r.report_date::date >= current_date - interval '6 months'
    AND upper(trim(coalesce(r.recommendation,''))) IN ('BUY','ACCUMULATE','SELL','HOLD','NEUTRAL')
    AND nullif(trim(r.nse_symbol),'') IS NOT NULL
), required_symbols AS (
  SELECT DISTINCT symbol FROM valid_reports
), source_prices AS (
  SELECT
    CASE WHEN upper(i.name)='LTIM' THEN 'LTM' ELSE upper(i.name) END AS symbol,
    b.trade_date,b.open::numeric,b.high::numeric,b.low::numeric,b.close::numeric,
    'SMARTAPI_BARS_1D'::text AS source,1 AS priority
  FROM public.bars_1d b
  JOIN public.instruments i ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
  JOIN required_symbols s ON s.symbol=CASE WHEN upper(i.name)='LTIM' THEN 'LTM' ELSE upper(i.name) END
  WHERE b.exchange='NSE' AND b.trade_date >= current_date - interval '7 months'
    AND b.open>0 AND b.high>0 AND b.low>0 AND b.close>0
  UNION ALL
  SELECT
    CASE WHEN upper(f.symbol)='LTIM' THEN 'LTM' ELSE upper(f.symbol) END,
    f.trade_date,f.open_price::numeric,f.high_price::numeric,f.low_price::numeric,f.close_price::numeric,
    'NSE_EOD_BHAVCOPY'::text,2
  FROM nse.fact_eod_prices f
  JOIN required_symbols s ON s.symbol=CASE WHEN upper(f.symbol)='LTIM' THEN 'LTM' ELSE upper(f.symbol) END
  WHERE f.series='EQ' AND f.trade_date >= current_date - interval '7 months'
    AND f.open_price>0 AND f.high_price>0 AND f.low_price>0 AND f.close_price>0
), prices AS (
  SELECT DISTINCT ON (symbol,trade_date)
    symbol,trade_date,open,high,low,close,source
  FROM source_prices
  ORDER BY symbol,trade_date,priority
), report_entry AS (
  SELECT r.*,
    first_bar.trade_date AS entry_session_date,
    coalesce(r.recommended_price,first_bar.open) AS entry_price,
    CASE WHEN r.recommended_price IS NOT NULL THEN 'TRENDLYNE_RECOMMENDED_PRICE'
      WHEN first_bar.open IS NOT NULL THEN 'NEXT_SESSION_OPEN_FALLBACK' ELSE NULL END AS entry_price_source
  FROM valid_reports r
  LEFT JOIN LATERAL (
    SELECT p.trade_date,p.open FROM prices p
    WHERE p.symbol=r.symbol AND p.trade_date>r.report_date
    ORDER BY p.trade_date LIMIT 1
  ) first_bar ON true
), paths AS (
  SELECT e.*,
    p.trade_date,p.high,p.low,p.close,p.source,
    row_number() OVER (PARTITION BY e.report_id ORDER BY p.trade_date) AS session_number
  FROM report_entry e
  LEFT JOIN prices p ON p.symbol=e.symbol AND p.trade_date>e.report_date
), evaluated AS (
  SELECT
    p.report_id,min(p.report_date) AS report_date,min(p.symbol) AS symbol,
    min(p.stock_name) AS stock_name,min(p.research_house) AS research_house,
    min(p.recommendation) AS recommendation,min(p.direction) AS direction,
    min(p.recommended_price) AS recommended_price,min(p.target_price) AS target_price,
    min(p.entry_session_date) AS entry_session_date,min(p.entry_price) AS entry_price,
    min(p.entry_price_source) AS entry_price_source,
    max(p.trade_date) AS latest_session_date,
    (array_agg(p.close ORDER BY p.trade_date DESC) FILTER (WHERE p.trade_date IS NOT NULL))[1] AS latest_price,
    count(p.trade_date)::int AS observed_sessions,
    count(p.trade_date) FILTER (WHERE p.session_number<=5)::int AS d5_sessions,
    count(p.trade_date) FILTER (WHERE p.session_number<=30)::int AS d30_sessions,
    min(p.trade_date) FILTER (WHERE
      (p.direction='LONG' AND p.target_price>p.entry_price AND p.high>=p.target_price) OR
      (p.direction='SHORT' AND p.target_price<p.entry_price AND p.low<=p.target_price)
    ) AS target_hit_date,
    (min(p.session_number) FILTER (WHERE
      (p.direction='LONG' AND p.target_price>p.entry_price AND p.high>=p.target_price) OR
      (p.direction='SHORT' AND p.target_price<p.entry_price AND p.low<=p.target_price)
    ))::int AS target_hit_session,
    (array_agg(p.close ORDER BY p.trade_date DESC) FILTER (WHERE p.session_number<=5))[1] AS d5_end_price,
    (array_agg(p.close ORDER BY p.trade_date DESC) FILTER (WHERE p.session_number<=30))[1] AS d30_end_price,
    max(p.high) FILTER (WHERE p.session_number<=5) AS d5_high,
    min(p.low) FILTER (WHERE p.session_number<=5) AS d5_low,
    max(p.high) FILTER (WHERE p.session_number<=30) AS d30_high,
    min(p.low) FILTER (WHERE p.session_number<=30) AS d30_low,
    (array_agg(p.trade_date ORDER BY p.high DESC,p.trade_date) FILTER (WHERE p.session_number<=5))[1] AS d5_high_date,
    (array_agg(p.trade_date ORDER BY p.low,p.trade_date) FILTER (WHERE p.session_number<=5))[1] AS d5_low_date,
    (array_agg(p.trade_date ORDER BY p.high DESC,p.trade_date) FILTER (WHERE p.session_number<=30))[1] AS d30_high_date,
    (array_agg(p.trade_date ORDER BY p.low,p.trade_date) FILTER (WHERE p.session_number<=30))[1] AS d30_low_date,
    min(p.report_url) AS report_url
  FROM paths p
  GROUP BY p.report_id
)
INSERT INTO research.trendlyne_recommendation_evaluation (
  report_id,report_date,symbol,stock_name,research_house,recommendation,direction,
  recommended_price,target_price,target_return_pct,entry_session_date,entry_price,entry_price_source,
  latest_session_date,latest_price,observed_sessions,target_eligible,target_hit,target_hit_date,target_hit_session,
  d5_sessions,d5_status,d5_end_return_pct,d5_max_profit_pct,d5_max_drawdown_pct,d5_max_profit_date,d5_max_drawdown_date,
  d30_sessions,d30_status,d30_end_return_pct,d30_max_profit_pct,d30_max_drawdown_pct,d30_max_profit_date,d30_max_drawdown_date,
  current_return_pct,evaluation_status,data_quality_status,data_quality_reasons,report_url,refreshed_at
)
SELECT
  e.report_id,e.report_date,e.symbol,e.stock_name,e.research_house,e.recommendation,e.direction,
  e.recommended_price,e.target_price,
  CASE WHEN e.entry_price>0 AND e.target_price>0 THEN 100*(e.target_price/e.entry_price-1) END,
  e.entry_session_date,e.entry_price,e.entry_price_source,e.latest_session_date,e.latest_price,e.observed_sessions,
  coalesce((e.direction='LONG' AND e.target_price>e.entry_price) OR (e.direction='SHORT' AND e.target_price<e.entry_price),false),
  CASE WHEN (e.direction='LONG' AND e.target_price>e.entry_price) OR (e.direction='SHORT' AND e.target_price<e.entry_price)
    THEN e.target_hit_date IS NOT NULL END,
  e.target_hit_date,e.target_hit_session,e.d5_sessions,
  CASE WHEN e.direction='NONE' THEN 'NOT_APPLICABLE' WHEN e.entry_price IS NULL OR e.d5_sessions=0 THEN 'NO_DATA'
    WHEN e.d5_sessions<5 THEN 'DEVELOPING' ELSE 'MATURED' END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d5_end_price/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d5_end_price/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d5_high/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d5_low/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d5_low/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d5_high/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN e.d5_high_date WHEN e.direction='SHORT' THEN e.d5_low_date END,
  CASE WHEN e.direction='LONG' THEN e.d5_low_date WHEN e.direction='SHORT' THEN e.d5_high_date END,
  e.d30_sessions,
  CASE WHEN e.direction='NONE' THEN 'NOT_APPLICABLE' WHEN e.entry_price IS NULL OR e.d30_sessions=0 THEN 'NO_DATA'
    WHEN e.d30_sessions<30 THEN 'DEVELOPING' ELSE 'MATURED' END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d30_end_price/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d30_end_price/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d30_high/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d30_low/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN 100*(e.d30_low/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.d30_high/e.entry_price) END,
  CASE WHEN e.direction='LONG' THEN e.d30_high_date WHEN e.direction='SHORT' THEN e.d30_low_date END,
  CASE WHEN e.direction='LONG' THEN e.d30_low_date WHEN e.direction='SHORT' THEN e.d30_high_date END,
  CASE WHEN e.direction='LONG' THEN 100*(e.latest_price/e.entry_price-1) WHEN e.direction='SHORT' THEN 100*(1-e.latest_price/e.entry_price) END,
  CASE WHEN e.direction='NONE' THEN 'NON_DIRECTIONAL'
    WHEN e.entry_price IS NULL OR e.observed_sessions=0 THEN 'DATA_INCOMPLETE'
    WHEN e.target_hit_date IS NOT NULL THEN 'TARGET_HIT'
    WHEN e.d30_sessions>=30 THEN 'OPEN_TARGET_NOT_HIT_30D_COMPLETE'
    ELSE 'OPEN_DEVELOPING' END,
  CASE WHEN e.entry_price IS NULL OR e.observed_sessions=0 THEN 'INCOMPLETE'
    WHEN e.target_price IS NULL THEN 'PARTIAL'
    WHEN (e.direction='LONG' AND e.target_price<=e.entry_price) OR (e.direction='SHORT' AND e.target_price>=e.entry_price) THEN 'INVALID_TARGET_DIRECTION'
    ELSE 'VALID' END,
  jsonb_path_query_array(jsonb_build_array(
    CASE WHEN e.entry_price IS NULL THEN 'MISSING_RECOMMENDED_AND_MARKET_ENTRY_PRICE' END,
    CASE WHEN e.observed_sessions=0 THEN 'NO_MATCHING_NSE_DAILY_PRICE_PATH' END,
    CASE WHEN e.target_price IS NULL THEN 'TARGET_PRICE_UNAVAILABLE' END,
    CASE WHEN e.direction='LONG' AND e.target_price<=e.entry_price THEN 'LONG_TARGET_NOT_ABOVE_ENTRY' END,
    CASE WHEN e.direction='SHORT' AND e.target_price>=e.entry_price THEN 'SHORT_TARGET_NOT_BELOW_ENTRY' END,
    CASE WHEN e.direction='NONE' THEN 'HOLD_OR_NEUTRAL_NOT_INCLUDED_IN_DIRECTIONAL_TRACK_RECORD' END
  ), '$[*] ? (@ != null)'),
  e.report_url,now()
FROM evaluated e
"""


def refresh_recommendation_analysis() -> dict:
    """Atomically replace the six-month evaluation population."""
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("LOCK TABLE research.trendlyne_recommendation_evaluation IN EXCLUSIVE MODE")
            cur.execute("DELETE FROM research.trendlyne_recommendation_evaluation")
            cur.execute(REFRESH_SQL)
            inserted = int(cur.rowcount)
            cur.execute(
                """
                SELECT count(*) FILTER (WHERE direction IN ('LONG','SHORT')),
                       count(*) FILTER (WHERE target_hit IS TRUE),
                       count(*) FILTER (WHERE d5_status='MATURED'),
                       count(*) FILTER (WHERE d30_status='MATURED'),
                       count(*) FILTER (WHERE data_quality_status='VALID'),
                       max(refreshed_at)
                FROM research.trendlyne_recommendation_evaluation
                """
            )
            actionable, target_hits, d5_mature, d30_mature, valid, refreshed_at = cur.fetchone()
        result = {
            "evaluations": inserted,
            "actionable": int(actionable or 0),
            "target_hits": int(target_hits or 0),
            "d5_mature": int(d5_mature or 0),
            "d30_mature": int(d30_mature or 0),
            "valid": int(valid or 0),
            "refreshed_at": refreshed_at.isoformat() if refreshed_at else None,
        }
        LOGGER.info("Trendlyne recommendation analysis refreshed: %s", result)
        return result
    finally:
        conn.close()
