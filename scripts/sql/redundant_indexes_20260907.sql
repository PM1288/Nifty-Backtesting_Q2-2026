-- The two audited redundant ordinary indexes only. No PK/unique/FK is removed.
-- Run with psql -v ON_ERROR_STOP=1, not inside a transaction.
SET statement_timeout='30s';
SET lock_timeout='1s';
DO $$
DECLARE candidate text; keeper text; c pg_index%ROWTYPE; k pg_index%ROWTYPE;
BEGIN
 FOR candidate,keeper IN VALUES
  ('paper_trading.trade_events_aggregate_idx','paper_trading.trade_events_aggregate_id_sequence_key'),
  ('public.equilibrium_strike_snapshot_idx','public.equilibrium_strike_snapshot_pkey')
 LOOP
  IF to_regclass(candidate) IS NULL THEN CONTINUE; END IF;
  SELECT * INTO STRICT c FROM pg_index WHERE indexrelid=to_regclass(candidate);
  SELECT * INTO STRICT k FROM pg_index WHERE indexrelid=to_regclass(keeper);
  IF c.indisunique OR c.indisprimary OR c.indisreplident OR NOT c.indisvalid OR NOT k.indisvalid OR NOT k.indisunique
   OR EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=c.indexrelid)
   OR ROW(c.indrelid,c.indkey,c.indclass,c.indcollation,c.indoption,c.indnkeyatts,c.indnatts,
      pg_get_expr(c.indexprs,c.indrelid),pg_get_expr(c.indpred,c.indrelid)) IS DISTINCT FROM
      ROW(k.indrelid,k.indkey,k.indclass,k.indcollation,k.indoption,k.indnkeyatts,k.indnatts,
      pg_get_expr(k.indexprs,k.indrelid),pg_get_expr(k.indpred,k.indrelid))
  THEN RAISE EXCEPTION 'Index compatibility failed: %',candidate; END IF;
 END LOOP;
END $$;
DROP INDEX CONCURRENTLY IF EXISTS paper_trading.trade_events_aggregate_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.equilibrium_strike_snapshot_idx;

-- Recovery (only if needed):
-- CREATE INDEX CONCURRENTLY trade_events_aggregate_idx ON paper_trading.trade_events USING btree(aggregate_id,sequence);
-- CREATE INDEX CONCURRENTLY equilibrium_strike_snapshot_idx ON public.equilibrium_strike_snapshot USING btree(underlying,expiry,strike);
