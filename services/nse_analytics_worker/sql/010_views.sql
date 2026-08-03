CREATE OR REPLACE VIEW nse_app.vw_latest_market_summary AS
SELECT *
FROM nse_app.market_summary_daily
WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.market_summary_daily);

CREATE OR REPLACE VIEW nse_app.vw_latest_signal_performance AS
SELECT *
FROM nse_app.signal_performance_summary
WHERE as_of_date = (SELECT MAX(as_of_date) FROM nse_app.signal_performance_summary);

CREATE OR REPLACE VIEW nse_app.vw_latest_watchlist AS
WITH latest_date AS (
    SELECT MAX(trade_date) AS d
    FROM nse_app.security_daily_features
),
ranked AS (
    SELECT
        s.trade_date,
        s.symbol,
        s.series,
        MAX(s.signal_strength) AS max_signal_strength,
        STRING_AGG(s.signal_name || ' [' || s.signal_direction || ']', ', ' ORDER BY s.signal_strength DESC NULLS LAST, s.signal_name) AS signals
    FROM nse_app.stock_analysis_signals_daily s
    JOIN latest_date ld ON s.trade_date = ld.d
    GROUP BY 1,2,3
)
SELECT
    r.trade_date,
    r.symbol,
    r.series,
    f.security_name,
    f.close_price,
    f.daily_return,
    f.volume_rel_20,
    f.delivery_rel_20,
    f.composite_trend_score,
    f.composite_anomaly_score,
    f.composite_risk_score,
    r.max_signal_strength,
    r.signals
FROM ranked r
LEFT JOIN nse_app.security_daily_features f
  ON f.trade_date = r.trade_date
 AND f.symbol = r.symbol
 AND f.series = r.series
ORDER BY r.max_signal_strength DESC NULLS LAST, f.turnover_lacs DESC NULLS LAST;

CREATE OR REPLACE VIEW nse_app.vw_signal_counts_daily AS
SELECT
    trade_date,
    analysis_type,
    COUNT(*) AS signal_count
FROM nse_app.stock_analysis_signals_daily
GROUP BY 1,2;
