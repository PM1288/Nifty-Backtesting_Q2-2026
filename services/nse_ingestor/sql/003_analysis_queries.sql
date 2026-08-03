-- 1) Daily market breadth from loaded cash-market universe
WITH base AS (
    SELECT
        trade_date,
        symbol,
        CASE WHEN prev_close IS NOT NULL AND prev_close <> 0
             THEN (close_price - prev_close) / prev_close END AS ret
    FROM nse.fact_eod_prices
)
SELECT
    trade_date,
    COUNT(*) AS stocks,
    AVG(ret) AS mean_return,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ret) AS median_return,
    AVG(CASE WHEN ret > 0 THEN 1 ELSE 0 END)::numeric AS pct_positive
FROM base
GROUP BY trade_date
ORDER BY trade_date DESC;

-- 2) Breakout watchlist: close within 2% of adjusted 52w high with positive delivery support
SELECT
    trade_date,
    symbol,
    series,
    close_price,
    adjusted_52_week_high,
    distance_to_52w_high,
    deliverable_pct,
    total_traded_qty,
    annualised_volatility
FROM nse.vw_stock_features_daily
WHERE distance_to_52w_high BETWEEN 0 AND 0.02
  AND deliverable_pct >= 40
ORDER BY trade_date DESC, distance_to_52w_high ASC, total_traded_qty DESC;

-- 3) Potential squeeze setup: short-selling + strong reversal close
SELECT
    p.trade_date,
    p.symbol,
    p.close_price,
    p.prev_close,
    p.total_traded_qty,
    p.deliverable_pct,
    s.quantity AS short_sell_qty,
    ((p.close_price - p.prev_close) / NULLIF(p.prev_close, 0)) AS daily_return
FROM nse.fact_eod_prices p
JOIN nse.fact_short_selling s
  ON s.trade_date = p.trade_date
 AND s.symbol = p.symbol
WHERE p.close_price > p.open_price
  AND p.close_price >= (p.low_price + 0.75 * NULLIF(p.high_price - p.low_price, 0))
ORDER BY p.trade_date DESC, short_sell_qty DESC;

-- 4) Deal follow-through seed table
SELECT
    d.trade_date,
    d.symbol,
    d.side,
    d.quantity_traded,
    d.trade_price,
    p.close_price,
    p.deliverable_pct
FROM nse.fact_bulk_deals d
LEFT JOIN nse.fact_eod_prices p
  ON p.trade_date = d.trade_date
 AND p.symbol = d.symbol
ORDER BY d.trade_date DESC, d.quantity_traded DESC;

-- 5) Surveillance stress list
SELECT
    report_date,
    symbol,
    series,
    non_default_flag_count,
    flags
FROM nse.fact_surveillance_indicators
WHERE COALESCE(non_default_flag_count, 0) > 0
ORDER BY report_date DESC, non_default_flag_count DESC, symbol;

-- 6) Margin crowding list
SELECT
    m.report_date,
    m.symbol,
    m.qty_financed,
    m.amt_financed_lakhs,
    p.close_price,
    p.deliverable_pct,
    v.applicable_margin_rate
FROM nse.fact_margin_trading_scrip m
LEFT JOIN nse.fact_eod_prices p
  ON p.trade_date = m.report_date
 AND p.symbol = m.symbol
LEFT JOIN nse.fact_var_margin v
  ON v.report_date = m.report_date
 AND v.symbol = m.symbol
 AND v.source_seq = 6
ORDER BY m.report_date DESC, m.amt_financed_lakhs DESC;

-- 7) Event calendar
SELECT
    report_date,
    event_type,
    symbol,
    headline
FROM nse.fact_text_events
ORDER BY report_date DESC, event_type, symbol NULLS LAST;
