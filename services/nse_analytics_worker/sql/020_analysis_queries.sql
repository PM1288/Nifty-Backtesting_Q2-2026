-- Starter analytical queries for direct SQL use

-- 1) Latest breakout candidates
SELECT *
FROM nse_app.stock_analysis_signals_daily
WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)
  AND analysis_type = 'momentum_breakout'
ORDER BY signal_strength DESC NULLS LAST, fwd_return_5d DESC NULLS LAST;

-- 2) Latest accumulation / distribution names
SELECT *
FROM nse_app.stock_analysis_signals_daily
WHERE trade_date = (SELECT MAX(trade_date) FROM nse_app.stock_analysis_signals_daily)
  AND analysis_type = 'delivery_conviction'
ORDER BY signal_strength DESC NULLS LAST;

-- 3) Market regime history
SELECT
    trade_date,
    market_regime,
    advancers,
    decliners,
    breakout_count,
    anomaly_count,
    risk_count
FROM nse_app.market_summary_daily
ORDER BY trade_date DESC;

-- 4) Historical signal leaderboard
SELECT *
FROM nse_app.vw_latest_signal_performance
ORDER BY sample_size DESC, avg_fwd_return_5d DESC NULLS LAST;

-- 5) Signals most often followed by positive 5-day returns
SELECT
    analysis_type,
    signal_name,
    signal_direction,
    sample_size,
    hit_rate_5d,
    avg_fwd_return_5d,
    median_fwd_return_5d
FROM nse_app.vw_latest_signal_performance
WHERE sample_size >= 20
ORDER BY hit_rate_5d DESC NULLS LAST, avg_fwd_return_5d DESC NULLS LAST;
