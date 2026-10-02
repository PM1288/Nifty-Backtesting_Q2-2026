-- Execute with psql, outside a transaction. These partial indexes serve the live
-- NSE/F&O universe without walking historical/inactive instrument entries.
-- CONCURRENTLY keeps broker writes available. No market data is rewritten.
SET lock_timeout = '5s';
SET statement_timeout = '120s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS instrument_universe_live_equity_idx
  ON public.instrument_universe (exchange, active_from DESC, symbol_token)
  INCLUDE (underlying, tradingsymbol)
  WHERE active_to IS NULL AND exchange = 'NSE';
CREATE INDEX CONCURRENTLY IF NOT EXISTS instrument_universe_live_derivative_idx
  ON public.instrument_universe (exchange, expiry, instrumenttype)
  INCLUDE (underlying)
  WHERE active_to IS NULL AND exchange = 'NFO';
RESET lock_timeout;
RESET statement_timeout;
