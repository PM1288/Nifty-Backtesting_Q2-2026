CREATE OR REPLACE VIEW nse.vw_security_current AS
SELECT x.*
FROM (
    SELECT s.*,
           ROW_NUMBER() OVER (PARTITION BY s.fininstrm_id ORDER BY s.snapshot_date DESC) AS rn
    FROM nse.dim_security_master_snapshot s
) x
WHERE x.rn = 1;

CREATE OR REPLACE VIEW nse.vw_eod_enriched AS
SELECT
    p.trade_date,
    COALESCE(p.fininstrm_id, u.fininstrm_id) AS fininstrm_id,
    COALESCE(p.isin, u.isin, sc.isin) AS isin,
    p.symbol,
    p.series,
    COALESCE(sc.security_name, u.security_name) AS security_name,
    p.prev_close,
    p.open_price,
    p.high_price,
    p.low_price,
    p.last_price,
    p.close_price,
    p.avg_price,
    p.total_traded_qty,
    p.turnover_lacs,
    p.no_of_trades,
    p.deliverable_qty,
    p.deliverable_pct,
    u.total_traded_value,
    u.total_trades,
    v.current_day_daily_volatility,
    v.annualised_volatility,
    hl.adjusted_52_week_high,
    hl.adjusted_52_week_low,
    si.non_default_flag_count AS surveillance_non_default_flag_count
FROM nse.fact_eod_prices p
LEFT JOIN nse.fact_bhavcopy_udiff u
  ON u.trade_date = p.trade_date
 AND u.symbol = p.symbol
 AND COALESCE(u.series, '') = COALESCE(p.series, '')
LEFT JOIN nse.vw_security_current sc
  ON sc.symbol = p.symbol
 AND COALESCE(sc.series, '') = COALESCE(p.series, '')
LEFT JOIN nse.fact_daily_volatility v
  ON v.trade_date = p.trade_date
 AND v.symbol = p.symbol
LEFT JOIN nse.fact_52_week_high_low hl
  ON hl.report_date = p.trade_date
 AND hl.symbol = p.symbol
 AND COALESCE(hl.series, '') = COALESCE(p.series, '')
LEFT JOIN nse.fact_surveillance_indicators si
  ON si.report_date = p.trade_date
 AND si.symbol = p.symbol
 AND COALESCE(si.series, '') = COALESCE(p.series, '')
 AND si.source_version = 'REG1';

CREATE OR REPLACE VIEW nse.vw_stock_features_daily AS
SELECT
    e.*,
    CASE WHEN e.prev_close IS NOT NULL AND e.prev_close <> 0
         THEN (e.close_price - e.prev_close) / e.prev_close END AS daily_return,
    CASE WHEN e.prev_close IS NOT NULL AND e.prev_close <> 0
         THEN (e.open_price - e.prev_close) / e.prev_close END AS gap_return,
    CASE WHEN e.open_price IS NOT NULL AND e.open_price <> 0
         THEN (e.close_price - e.open_price) / e.open_price END AS intraday_return,
    CASE WHEN e.low_price IS NOT NULL AND e.high_price IS NOT NULL AND e.low_price <> 0
         THEN (e.high_price - e.low_price) / e.low_price END AS day_range_pct,
    CASE WHEN e.high_price IS NOT NULL AND e.low_price IS NOT NULL AND e.high_price <> e.low_price
         THEN (e.close_price - e.low_price) / NULLIF(e.high_price - e.low_price, 0) END AS close_location_value,
    CASE WHEN e.adjusted_52_week_high IS NOT NULL AND e.adjusted_52_week_high <> 0
         THEN (e.adjusted_52_week_high - e.close_price) / e.adjusted_52_week_high END AS distance_to_52w_high,
    CASE WHEN e.adjusted_52_week_low IS NOT NULL AND e.adjusted_52_week_low <> 0
         THEN (e.close_price - e.adjusted_52_week_low) / e.adjusted_52_week_low END AS distance_from_52w_low
FROM nse.vw_eod_enriched e;
