\set ON_ERROR_STOP on
SET timezone = 'UTC';
SET lock_timeout = '5s';
SET statement_timeout = '5min';

-- The latest seventh-day boundary: missed runs before the next seventh must
-- still preserve the previous month. Only known market-data parents qualify.
CREATE TEMP VIEW monthly_cleanup_candidates AS
WITH boundary AS (
  SELECT (date_trunc('month', :'as_of'::timestamptz) -
    CASE WHEN extract(day FROM :'as_of'::timestamptz) < 7
      THEN interval '1 month' ELSE interval '0 month' END)::date AS cutoff
), partitions AS (
  SELECT c.oid, n.nspname, c.relname, pn.nspname || '.' || p.relname AS parent,
    to_date(substring(c.relname FROM '([0-9]{4}_[0-9]{2})$'), 'YYYY_MM') AS month_start,
    regexp_match(pg_get_expr(c.relpartbound,c.oid),
      '^FOR VALUES FROM \(''([^'']+)''\) TO \(''([^'']+)''\)$') AS bounds
  FROM pg_inherits i
  JOIN pg_class c ON c.oid=i.inhrelid
  JOIN pg_class p ON p.oid=i.inhparent
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_namespace pn ON pn.oid=p.relnamespace
  WHERE c.relispartition AND c.relkind='r' AND n.oid=pn.oid
    AND c.relname ~ '_[0-9]{4}_(0[1-9]|1[0-2])$'
    AND left(c.relname,length(c.relname)-8)=p.relname
    AND pn.nspname || '.' || p.relname = ANY(ARRAY[
      'public.market_ticks','public.depth_5_snapshots','public.depth_5_metrics',
      'public.quote_snapshots','public.oi_snapshots_options',
      'public.oi_snapshots_equity','public.oi_snapshots_futures',
      'public.smartapi_option_chain_snapshots','public.bars_1m',
      'public.oi_snapshots_index','public.option_greeks','public.pcr_snapshots',
      'public.gainers_losers_snapshots','public.oibuildup_snapshots',
      'public.putcallratio_snapshots',
      'nse_intraday.raw_security_1m','nse_intraday.raw_index_1m',
      'nse_intraday.security_minute_feature','nse_intraday.market_minute_feature',
      'nse_intraday.stock_minute_volume_profile'])
)
SELECT partitions.*, boundary.cutoff, pg_total_relation_size(oid) AS bytes
FROM partitions CROSS JOIN boundary
WHERE month_start < cutoff
  AND bounds[1]::timestamptz = month_start::timestamptz
  AND bounds[2]::timestamptz = (month_start + interval '1 month')::timestamptz;

SELECT parent,format('%I.%I',nspname,relname) AS partition,
  cutoff,pg_size_pretty(bytes) AS size FROM monthly_cleanup_candidates
ORDER BY bytes DESC;

\if :apply
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.monthly_partition_cleanup_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  relation_name text NOT NULL,
  parent_name text NOT NULL,
  cutoff date NOT NULL,
  bytes_before bigint NOT NULL,
  policy text NOT NULL DEFAULT 'User authorized prior-month cleanup on each seventh; 2026-10-12'
);
DO $$
DECLARE r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('tradingdb:monthly-partition-cleanup',0)) THEN
    RAISE EXCEPTION 'Another monthly partition cleanup is running';
  END IF;
  FOR r IN SELECT * FROM monthly_cleanup_candidates ORDER BY bytes DESC LOOP
    -- RESTRICT is intentional: unexpected dependent objects prevent deletion.
    EXECUTE format('DROP TABLE %I.%I RESTRICT',r.nspname,r.relname);
    INSERT INTO operations.monthly_partition_cleanup_log
      (relation_name,parent_name,cutoff,bytes_before)
    VALUES (format('%I.%I',r.nspname,r.relname),r.parent,r.cutoff,r.bytes);
    RAISE NOTICE 'Dropped %.%, released %',r.nspname,r.relname,pg_size_pretty(r.bytes);
  END LOOP;
END $$;
\endif
