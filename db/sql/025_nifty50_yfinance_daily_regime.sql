CREATE SCHEMA IF NOT EXISTS strategy_eval;

CREATE TABLE IF NOT EXISTS strategy_eval.nifty50_daily_regime (
    trade_date DATE PRIMARY KEY,
    symbol TEXT NOT NULL DEFAULT 'NIFTY 50',
    source_symbol TEXT NOT NULL DEFAULT '^NSEI',
    open_price NUMERIC(20,6), high_price NUMERIC(20,6), low_price NUMERIC(20,6),
    close_price NUMERIC(20,6), adj_close NUMERIC(20,6), volume BIGINT,
    return_1d_pct NUMERIC(14,6), return_5d_pct NUMERIC(14,6), return_21d_pct NUMERIC(14,6),
    sma20 NUMERIC(20,6), sma50 NUMERIC(20,6), ema20 NUMERIC(20,6), atr14 NUMERIC(20,6),
    rsi14 NUMERIC(14,6), volatility20_pct NUMERIC(14,6), trend_score NUMERIC(14,6),
    primary_trend TEXT NOT NULL CHECK (primary_trend IN ('UP_TREND','DOWN_TREND','SIDEWAYS')),
    market_zone TEXT NOT NULL CHECK (market_zone IN ('RISING','FALLING','VOLATILE','SIDEWAYS')),
    data_source TEXT NOT NULL DEFAULT 'yfinance', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_nifty50_regime_trend_date
    ON strategy_eval.nifty50_daily_regime (primary_trend, trade_date);
CREATE INDEX IF NOT EXISTS ix_nifty50_regime_zone_date
    ON strategy_eval.nifty50_daily_regime (market_zone, trade_date);
