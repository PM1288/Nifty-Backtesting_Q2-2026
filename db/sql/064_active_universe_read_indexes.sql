-- Execute with psql, outside a transaction. These partial indexes serve the live
-- NSE/F&O universe without walking historical/inactive instrument entries.
-- CONCURRENTLY keeps broker writes available. No market data is rewritten.
SET lock_timeout = '60s';
SET statement_timeout = '180s';
-- Interrupted concurrent builds can leave invalid indexes. Rebuild only these
-- migration-owned invalid indexes; IF NOT EXISTS alone would silently skip them.
SELECT format('DROP INDEX CONCURRENTLY %I.%I;', n.nspname, c.relname)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT i.indisvalid
  AND c.relname IN ('instrument_universe_live_equity_idx', 'instrument_universe_live_derivative_idx')
\gexec
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
