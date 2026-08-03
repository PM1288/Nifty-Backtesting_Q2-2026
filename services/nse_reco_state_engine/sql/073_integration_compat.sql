-- Compatibility views for the existing intraday stack.
-- Extend the shared integration contract in place so existing consumers keep
-- their original column order while reco gets the additional columns it needs.

CREATE OR REPLACE VIEW integration.v_universe_membership AS
WITH base AS (
  SELECT
    'NIFTY100'::text AS universe_name,
    c.symbol,
    c.weight::numeric(18,8) AS weight,
    c.sector AS sector_name,
    'collector_index_constituents'::text AS source_system
  FROM public.index_constituents c
  WHERE c.index_name = 'NIFTY100'
),
trade_dates AS (
  SELECT DISTINCT trade_date
  FROM integration.v_source_security_1m
)
SELECT
  b.universe_name,
  b.symbol,
  b.weight,
  b.sector_name,
  td.trade_date AS effective_from,
  NULL::date AS effective_to,
  b.source_system,
  td.trade_date,
  TRUE AS is_active
FROM trade_dates td
CROSS JOIN base b;

CREATE OR REPLACE VIEW integration.v_index_daily_history AS
WITH market_activity AS (
  SELECT
    trade_date,
    CASE
      WHEN upper(index_name) IN ('NIFTY 50', 'NIFTY50') THEN 'NIFTY 50'
      WHEN upper(index_name) IN ('NIFTY BANK', 'BANK NIFTY') THEN 'BANK NIFTY'
      WHEN upper(index_name) = 'INDIA VIX' THEN 'INDIA VIX'
      ELSE NULL
    END AS index_code,
    close_price::numeric(18,6) AS close_px,
    close_price::numeric(18,6) AS close,
    high_price::numeric(18,6) AS high,
    low_price::numeric(18,6) AS low
  FROM nse.fact_market_activity_index
  WHERE upper(index_name) IN ('NIFTY 50', 'NIFTY50', 'NIFTY BANK', 'BANK NIFTY', 'INDIA VIX')
),
minute_fallback AS (
  WITH index_map(index_code, symbol_token) AS (
    VALUES
      ('NIFTY 50'::text, '99926000'::text),
      ('BANK NIFTY'::text, '99926009'::text),
      ('INDIA VIX'::text, '99926017'::text)
  )
  SELECT
    (b.ts AT TIME ZONE 'Asia/Kolkata')::date AS trade_date,
    im.index_code,
    (ARRAY_AGG(b.close ORDER BY b.ts DESC))[1]::numeric(18,6) AS close_px,
    (ARRAY_AGG(b.close ORDER BY b.ts DESC))[1]::numeric(18,6) AS close,
    max(b.high)::numeric(18,6) AS high,
    min(b.low)::numeric(18,6) AS low
  FROM public.bars_1m b
  JOIN index_map im
    ON im.symbol_token = b.symbol_token
  WHERE b.exchange = 'NSE'
    AND extract(isodow from (b.ts AT TIME ZONE 'Asia/Kolkata')) BETWEEN 1 AND 5
    AND ((b.ts AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND time '15:30')
  GROUP BY (b.ts AT TIME ZONE 'Asia/Kolkata')::date, im.index_code
)
SELECT
  ma.trade_date,
  ma.index_code,
  ma.close_px,
  ma.close,
  ma.high,
  ma.low
FROM market_activity ma
WHERE ma.index_code IS NOT NULL
UNION ALL
SELECT
  mf.trade_date,
  mf.index_code,
  mf.close_px,
  mf.close,
  mf.high,
  mf.low
FROM minute_fallback mf
WHERE NOT EXISTS (
  SELECT 1
  FROM market_activity ma
  WHERE ma.index_code = mf.index_code
    AND ma.trade_date = mf.trade_date
);

CREATE OR REPLACE VIEW integration.v_security_minute_feature AS
SELECT
  s.trade_date,
  s.minute_ts AS ts,
  s.minute_no AS minute_of_day,
  s.symbol,
  s.sector_name,
  s.last_price AS close,
  COALESCE(r.vwap, s.day_vwap) AS vwap,
  COALESCE(r.volume, 0)::numeric AS volume,
  m.last_price AS index_close,
  COALESCE(s.beta_20d, s.beta_60d, 1.0) AS beta,
  s.residual_return_5m_pct AS residual_ret_5m_pct,
  s.residual_return_15m_pct AS residual_ret_15m_pct,
  s.residual_return_30m_pct AS residual_ret_30m_pct,
  s.residual_return_60m_pct AS residual_ret_60m_pct,
  s.time_above_vwap_pct,
  (s.vwap_dev_bps / 100.0)::numeric(18,6) AS vwap_deviation_pct,
  COALESCE(s.volume_curve_surprise, 0.0) AS volume_surprise_z,
  (s.range_efficiency_pct / 100.0)::numeric(18,6) AS range_efficiency,
  (s.close_location_quality_pct / 100.0)::numeric(18,6) AS close_location,
  s.vwap_cross_count,
  s.minute_return_pct AS ret_1m_pct,
  s.minute_volume_ratio AS volume_ratio
FROM nse_intraday.security_minute_feature s
LEFT JOIN nse_intraday.raw_security_1m r
  ON r.trade_date = s.trade_date
 AND r.symbol = s.symbol
 AND r.minute_ts = s.minute_ts
LEFT JOIN nse_intraday.market_minute_feature m
  ON m.trade_date = s.trade_date
 AND m.index_code = 'NIFTY 50'
 AND m.minute_ts = s.minute_ts;

CREATE OR REPLACE VIEW integration.v_market_minute_feature AS
WITH hist AS (
  SELECT
    trade_date,
    minute_ts,
    index_code,
    last_price,
    lag(last_price) OVER (PARTITION BY trade_date, index_code ORDER BY minute_ts) AS prev_last_price,
    abs(
      COALESCE(
        100.0 * (
          last_price / NULLIF(lag(last_price) OVER (PARTITION BY trade_date, index_code ORDER BY minute_ts), 0)
          - 1.0
        ),
        0.0
      )
    ) AS abs_ret_1m_pct,
    gap_pct,
    open_range_15_pct,
    breadth_up_pct,
    breadth_above_vwap_pct,
    dispersion_pct,
    minute_no
  FROM nse_intraday.market_minute_feature
),
with_pctiles AS (
  SELECT
    h.trade_date,
    h.minute_ts AS ts,
    h.minute_no AS minute_of_day,
    h.index_code,
    h.last_price AS index_close,
    COALESCE(
      100.0 * (h.last_price / NULLIF(h.prev_last_price, 0) - 1.0),
      0.0
    ) AS index_ret_1m_pct,
    h.breadth_up_pct,
    h.breadth_above_vwap_pct,
    COALESCE(
      100.0 * cume_dist() OVER (
        PARTITION BY h.index_code, h.minute_no
        ORDER BY h.dispersion_pct
      ),
      0.0
    ) AS dispersion_pctile,
    COALESCE(
      100.0 * cume_dist() OVER (
        PARTITION BY h.index_code, h.minute_no
        ORDER BY h.abs_ret_1m_pct
      ),
      0.0
    ) AS realized_vol_pctile,
    h.gap_pct AS opening_gap_pct,
    h.open_range_15_pct AS first15_range_expansion_pct,
    NULL::numeric AS correlation_mean
  FROM hist h
)
SELECT *
FROM with_pctiles;

CREATE OR REPLACE VIEW integration.v_events_daily AS
WITH unified AS (
  SELECT
    report_date AS trade_date,
    symbol,
    event_type AS tag
  FROM nse.fact_text_events
  WHERE report_date IS NOT NULL
    AND symbol IS NOT NULL
  UNION ALL
  SELECT
    COALESCE(ex_date, report_date) AS trade_date,
    symbol,
    purpose AS tag
  FROM nse.fact_corporate_actions
  WHERE COALESCE(ex_date, report_date) IS NOT NULL
    AND symbol IS NOT NULL
)
SELECT
  trade_date,
  symbol,
  count(*)::int AS event_count,
  string_agg(DISTINCT tag, ', ' ORDER BY tag) AS event_tags
FROM unified
GROUP BY trade_date, symbol;
