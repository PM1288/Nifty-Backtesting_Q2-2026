BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '180s';

DO $$
DECLARE mismatch_count bigint;
BEGIN
  IF (SELECT min(created_at) FROM paper_trading.trade_groups) < '2026-08-01 00:00:00+00' THEN
    RAISE EXCEPTION 'Paper evidence predates the proposed August retention boundary';
  END IF;

  WITH raw_daily AS (
    SELECT exchange, symbol_token,
           (ts AT TIME ZONE 'Asia/Kolkata')::date trade_date,
           (array_agg(open ORDER BY ts))[1] open,
           max(high) high, min(low) low,
           (array_agg(close ORDER BY ts DESC))[1] close,
           sum(volume)::numeric volume, count(*)::integer bar_count
    FROM public.bars_1m
    WHERE ts < '2026-08-01 00:00:00+00'
      AND (ts AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND time '15:30'
      AND exchange IN ('NSE','BSE')
    GROUP BY exchange, symbol_token, (ts AT TIME ZONE 'Asia/Kolkata')::date
  )
  SELECT count(*) INTO mismatch_count
  FROM raw_daily r
  LEFT JOIN public.minute_daily_archive a
    USING (exchange, symbol_token, trade_date)
  WHERE a.trade_date IS NULL
     OR a.open IS DISTINCT FROM r.open
     OR a.high IS DISTINCT FROM r.high
     OR a.low IS DISTINCT FROM r.low
     OR a.close IS DISTINCT FROM r.close
     OR a.volume IS DISTINCT FROM r.volume
     OR a.bar_count IS DISTINCT FROM r.bar_count;

  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Daily archive parity failed for % expired symbol-sessions', mismatch_count;
  END IF;
END $$;

LOCK TABLE public.bars_1m_2026_06 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.bars_1m_2026_07 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.oi_snapshots_index_2026_06 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.oi_snapshots_index_2026_07 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.option_greeks_2026_06 IN ACCESS EXCLUSIVE MODE NOWAIT;
LOCK TABLE public.option_greeks_2026_07 IN ACCESS EXCLUSIVE MODE NOWAIT;

INSERT INTO operations.retired_relation_manifest
  (relation_name, retention_policy, cutoff, exact_rows, bytes_before,
   min_event_time, max_event_time, backup_uri, backup_sha256, approved_by, reason)
SELECT format('public.%s', table_name), policy, '2026-08-01 00:00:00+00',
       exact_rows, bytes_before, min_ts, max_ts,
       'USER_DECLINED_BACKUP', 'NOT_APPLICABLE_USER_DECLINED',
       'user-explicit-2026-09-08', reason
FROM (
  SELECT 'bars_1m_2026_06' table_name, 'minute:15d' policy,
    count(*) exact_rows, pg_total_relation_size('public.bars_1m_2026_06') bytes_before,
    min(ts) min_ts,max(ts) max_ts,'Expired whole partition; exact daily archive parity passed' reason FROM public.bars_1m_2026_06
  UNION ALL SELECT 'bars_1m_2026_07','minute:15d',count(*),pg_total_relation_size('public.bars_1m_2026_07'),min(ts),max(ts),'Expired whole partition; exact daily archive parity passed' FROM public.bars_1m_2026_07
  UNION ALL SELECT 'oi_snapshots_index_2026_06','intraday-oi:15d',count(*),pg_total_relation_size('public.oi_snapshots_index_2026_06'),min(ts),max(ts),'Expired whole intraday OI partition' FROM public.oi_snapshots_index_2026_06
  UNION ALL SELECT 'oi_snapshots_index_2026_07','intraday-oi:15d',count(*),pg_total_relation_size('public.oi_snapshots_index_2026_07'),min(ts),max(ts),'Expired whole intraday OI partition' FROM public.oi_snapshots_index_2026_07
  UNION ALL SELECT 'option_greeks_2026_06','options:30d',count(*),pg_total_relation_size('public.option_greeks_2026_06'),min(ts),max(ts),'Expired whole option-Greeks partition' FROM public.option_greeks_2026_06
  UNION ALL SELECT 'option_greeks_2026_07','options:30d',count(*),pg_total_relation_size('public.option_greeks_2026_07'),min(ts),max(ts),'Expired whole option-Greeks partition' FROM public.option_greeks_2026_07
) evidence
ON CONFLICT (relation_name) DO NOTHING;

DROP TABLE public.bars_1m_2026_06;
DROP TABLE public.bars_1m_2026_07;
DROP TABLE public.oi_snapshots_index_2026_06;
DROP TABLE public.oi_snapshots_index_2026_07;
DROP TABLE public.option_greeks_2026_06;
DROP TABLE public.option_greeks_2026_07;

COMMIT;
