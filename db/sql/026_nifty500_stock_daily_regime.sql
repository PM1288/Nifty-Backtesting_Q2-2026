CREATE SCHEMA IF NOT EXISTS strategy_eval;
CREATE TABLE IF NOT EXISTS strategy_eval.stock_daily_regime (
 trade_date DATE NOT NULL, stock_name TEXT NOT NULL, yahoo_symbol TEXT NOT NULL,
 open_price NUMERIC(20,6), high_price NUMERIC(20,6), low_price NUMERIC(20,6), close_price NUMERIC(20,6), adj_close NUMERIC(20,6), volume BIGINT,
 return_1d_pct NUMERIC(14,6), return_5d_pct NUMERIC(14,6), return_21d_pct NUMERIC(14,6), sma20 NUMERIC(20,6), sma50 NUMERIC(20,6), ema20 NUMERIC(20,6), atr14 NUMERIC(20,6), rsi14 NUMERIC(14,6), volatility20_pct NUMERIC(14,6), trend_score NUMERIC(14,6),
 primary_trend TEXT NOT NULL CHECK(primary_trend IN ('UP_TREND','DOWN_TREND','SIDEWAYS')), market_zone TEXT NOT NULL CHECK(market_zone IN ('RISING','FALLING','VOLATILE','SIDEWAYS')),
 data_source TEXT NOT NULL DEFAULT 'yfinance', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), row_hash TEXT NOT NULL,
 PRIMARY KEY(stock_name, trade_date)
);
CREATE INDEX IF NOT EXISTS ix_stock_daily_regime_date ON strategy_eval.stock_daily_regime(trade_date);
CREATE INDEX IF NOT EXISTS ix_stock_daily_regime_trend ON strategy_eval.stock_daily_regime(stock_name, primary_trend, trade_date);
