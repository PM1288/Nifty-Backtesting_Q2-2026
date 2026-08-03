-- Additional compatibility views for historical strategy simulation.

CREATE OR REPLACE VIEW integration.v_stock_daily_history AS
WITH latest_names AS (
  SELECT DISTINCT ON (symbol, series)
    symbol,
    series,
    security_name
  FROM nse.fact_bhavcopy_udiff
  WHERE security_name IS NOT NULL
  ORDER BY symbol, series, trade_date DESC
)
SELECT
  p.trade_date,
  p.symbol,
  p.series,
  COALESCE(n.security_name, p.symbol) AS security_name,
  p.prev_close::numeric(18,6) AS prev_close,
  p.open_price::numeric(18,6) AS open,
  p.high_price::numeric(18,6) AS high,
  p.low_price::numeric(18,6) AS low,
  p.close_price::numeric(18,6) AS close,
  p.total_traded_qty::bigint AS volume,
  p.turnover_lacs::numeric(18,6) AS turnover_lacs,
  p.deliverable_qty::bigint AS deliverable_qty,
  p.deliverable_pct::numeric(18,6) AS deliverable_pct
FROM nse.fact_eod_prices p
LEFT JOIN latest_names n
  ON n.symbol = p.symbol
 AND n.series = p.series;
