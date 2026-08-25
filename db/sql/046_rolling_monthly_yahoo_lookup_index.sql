CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_stock_daily_regime_yahoo_symbol_date
  ON strategy_eval.stock_daily_regime (yahoo_symbol, trade_date);
