BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '180s';

DO $$
DECLARE
  raw_cutoff timestamptz := now() - interval '7 days';
BEGIN
  IF EXISTS (SELECT 1 FROM public.market_ticks_2026_08 WHERE exchange_ts >= raw_cutoff LIMIT 1) THEN
    RAISE EXCEPTION 'August raw ticks overlap the rolling seven-day retention window';
  END IF;
  IF EXISTS (SELECT 1 FROM public.depth_5_metrics_2026_08 WHERE ts >= raw_cutoff LIMIT 1) THEN
    RAISE EXCEPTION 'August depth metrics overlap the rolling seven-day retention window';
  END IF;
  IF to_regclass('public.bars_1m_2026_08') IS NULL THEN
    RAISE EXCEPTION 'Retained August minute bars are missing';
  END IF;
END $$;

LOCK TABLE public.market_ticks_2026_08 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.depth_5_metrics_2026_08 IN ACCESS EXCLUSIVE MODE NOWAIT;

INSERT INTO operations.retired_relation_manifest
  (relation_name, retention_policy, cutoff, exact_rows, bytes_before,
   min_event_time, max_event_time, backup_uri, backup_sha256, approved_by, reason)
SELECT relation_name, 'raw-market:7d', now() - interval '7 days', exact_rows,
       bytes_before, min_ts, max_ts, 'USER_DECLINED_BACKUP',
       'NOT_APPLICABLE_USER_DECLINED', 'user-explicit-2026-09-08', reason
FROM (
  SELECT 'public.market_ticks_2026_08'::text relation_name,
    203982525::bigint exact_rows, pg_total_relation_size('public.market_ticks_2026_08') bytes_before,
    '2026-08-10 10:01:21+00'::timestamptz min_ts,
    '2026-08-31 23:46:15.904+00'::timestamptz max_ts,
    'Expired raw ticks; retained minute and daily OHLCV remain available'::text reason
  UNION ALL
  SELECT 'public.depth_5_metrics_2026_08', 95343264::bigint,
    pg_total_relation_size('public.depth_5_metrics_2026_08'),
    '2026-08-10 10:01:21+00'::timestamptz,
    '2026-08-31 23:59:23.045349+00'::timestamptz,
    'Expired derived depth metrics; current September partition retained'
) evidence
ON CONFLICT (relation_name) DO NOTHING;

DROP TABLE public.market_ticks_2026_08;
DROP TABLE public.depth_5_metrics_2026_08;

COMMIT;
