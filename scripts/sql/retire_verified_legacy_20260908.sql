\if :{?backup_uri}
\else
  \echo 'backup_uri is required'
  \quit 2
\endif

\if :{?backup_sha256}
\else
  \echo 'backup_sha256 is required'
  \quit 2
\endif

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '180s';

CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.retired_relation_manifest (
  relation_name text PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT now(),
  retention_policy text NOT NULL,
  cutoff timestamptz NOT NULL,
  exact_rows bigint NOT NULL,
  bytes_before bigint NOT NULL,
  min_event_time timestamptz,
  max_event_time timestamptz,
  backup_uri text NOT NULL,
  backup_sha256 text NOT NULL,
  approved_by text NOT NULL,
  reason text NOT NULL
);

DO $$
DECLARE
  cutoff_minute timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
    AT TIME ZONE 'Asia/Kolkata' - interval '15 days';
  cutoff_option timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
    AT TIME ZONE 'Asia/Kolkata' - interval '30 days';
BEGIN
  IF EXISTS (SELECT 1 FROM research.security_minute_technical WHERE ts >= cutoff_minute LIMIT 1) THEN
    RAISE EXCEPTION 'research.security_minute_technical contains data inside the 15-day retention window';
  END IF;
  IF EXISTS (SELECT 1 FROM migration_backup_20260808.bars_1m_legacy_20260808 WHERE ts >= cutoff_minute LIMIT 1)
     OR EXISTS (SELECT 1 FROM migration_backup_20260808.oi_snapshots_equity_legacy_20260808 WHERE ts >= cutoff_minute LIMIT 1)
     OR EXISTS (SELECT 1 FROM migration_backup_20260808.oi_snapshots_futures_legacy_20260808 WHERE ts >= cutoff_minute LIMIT 1)
     OR EXISTS (SELECT 1 FROM migration_backup_20260808.oi_snapshots_index_legacy_20260808 WHERE ts >= cutoff_minute LIMIT 1) THEN
    RAISE EXCEPTION 'legacy minute/OI recovery data overlaps the 15-day retention window';
  END IF;
  IF EXISTS (SELECT 1 FROM migration_backup_20260808.oi_snapshots_options_legacy_20260808 WHERE ts >= cutoff_option LIMIT 1)
     OR EXISTS (SELECT 1 FROM migration_backup_20260808.option_greeks_legacy_20260808 WHERE ts >= cutoff_option LIMIT 1)
     OR EXISTS (SELECT 1 FROM migration_backup_20260808.quote_snapshots_legacy_20260808 WHERE ts >= cutoff_option LIMIT 1) THEN
    RAISE EXCEPTION 'legacy option/quote recovery data overlaps the 30-day retention window';
  END IF;
END $$;

LOCK TABLE research.security_minute_technical IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.bars_1m_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.oi_snapshots_equity_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.oi_snapshots_futures_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.oi_snapshots_index_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.oi_snapshots_options_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.option_greeks_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE migration_backup_20260808.quote_snapshots_legacy_20260808 IN ACCESS EXCLUSIVE MODE NOWAIT;

INSERT INTO operations.retired_relation_manifest
  (relation_name, retention_policy, cutoff, exact_rows, bytes_before,
   min_event_time, max_event_time, backup_uri, backup_sha256, approved_by, reason)
SELECT relation_name, retention_policy, cutoff, exact_rows, bytes_before,
       min_event_time, max_event_time, :'backup_uri', :'backup_sha256',
       'user-explicit-2026-09-08', reason
FROM (
  SELECT 'research.security_minute_technical'::text relation_name,
         'minute-derived:15d'::text retention_policy,
         date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days' cutoff,
         count(*) exact_rows, pg_total_relation_size('research.security_minute_technical') bytes_before,
         min(ts) min_event_time, max(ts) max_event_time,
         'Derived minute indicators older than retention; permanent OHLCV stores preserved'::text reason
  FROM research.security_minute_technical
  UNION ALL
  SELECT format('migration_backup_20260808.%s', v.table_name), v.policy,
         v.cutoff, v.exact_rows, v.bytes_before, v.min_ts, v.max_ts,
         'Superseded migration recovery copy older than retention; current parents and fresh restore-tested backup preserved'
  FROM (
    SELECT 'bars_1m_legacy_20260808' table_name, 'minute:15d' policy,
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days' cutoff,
      count(*) exact_rows, pg_total_relation_size('migration_backup_20260808.bars_1m_legacy_20260808') bytes_before, min(ts) min_ts, max(ts) max_ts
      FROM migration_backup_20260808.bars_1m_legacy_20260808
    UNION ALL SELECT 'oi_snapshots_equity_legacy_20260808','intraday-oi:15d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days',
      count(*),pg_total_relation_size('migration_backup_20260808.oi_snapshots_equity_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.oi_snapshots_equity_legacy_20260808
    UNION ALL SELECT 'oi_snapshots_futures_legacy_20260808','intraday-oi:15d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days',
      count(*),pg_total_relation_size('migration_backup_20260808.oi_snapshots_futures_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.oi_snapshots_futures_legacy_20260808
    UNION ALL SELECT 'oi_snapshots_index_legacy_20260808','intraday-oi:15d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days',
      count(*),pg_total_relation_size('migration_backup_20260808.oi_snapshots_index_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.oi_snapshots_index_legacy_20260808
    UNION ALL SELECT 'oi_snapshots_options_legacy_20260808','options:30d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '30 days',
      count(*),pg_total_relation_size('migration_backup_20260808.oi_snapshots_options_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.oi_snapshots_options_legacy_20260808
    UNION ALL SELECT 'option_greeks_legacy_20260808','options:30d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '30 days',
      count(*),pg_total_relation_size('migration_backup_20260808.option_greeks_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.option_greeks_legacy_20260808
    UNION ALL SELECT 'quote_snapshots_legacy_20260808','quotes:30d',
      date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '30 days',
      count(*),pg_total_relation_size('migration_backup_20260808.quote_snapshots_legacy_20260808'),min(ts),max(ts) FROM migration_backup_20260808.quote_snapshots_legacy_20260808
  ) v
) evidence
ON CONFLICT (relation_name) DO NOTHING;

DROP TABLE research.security_minute_technical;
DROP TABLE migration_backup_20260808.bars_1m_legacy_20260808;
DROP TABLE migration_backup_20260808.oi_snapshots_equity_legacy_20260808;
DROP TABLE migration_backup_20260808.oi_snapshots_futures_legacy_20260808;
DROP TABLE migration_backup_20260808.oi_snapshots_index_legacy_20260808;
DROP TABLE migration_backup_20260808.oi_snapshots_options_legacy_20260808;
DROP TABLE migration_backup_20260808.option_greeks_legacy_20260808;
DROP TABLE migration_backup_20260808.quote_snapshots_legacy_20260808;

COMMIT;
