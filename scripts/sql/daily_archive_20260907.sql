-- Additive preservation store. Never overwrites official bars_1d / NSE EOD.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TABLE IF NOT EXISTS public.minute_daily_archive (
 exchange text NOT NULL,symbol_token text NOT NULL,trade_date date NOT NULL,
 open numeric,high numeric,low numeric,close numeric,volume numeric,
 first_ts timestamptz NOT NULL,last_ts timestamptz NOT NULL,bar_count integer NOT NULL,
 sources text[] NOT NULL,archived_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(exchange,symbol_token,trade_date)
);
CREATE OR REPLACE FUNCTION public.archive_minute_session(session_date date) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE affected bigint;
BEGIN
 IF session_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
  RAISE EXCEPTION 'Only completed prior sessions may be archived';
 END IF;
 INSERT INTO public.minute_daily_archive
  (exchange,symbol_token,trade_date,open,high,low,close,volume,first_ts,last_ts,bar_count,sources)
 SELECT exchange,symbol_token,session_date,
  (array_agg(open ORDER BY ts))[1],max(high),min(low),(array_agg(close ORDER BY ts DESC))[1],
  sum(volume)::numeric,min(ts),max(ts),count(*)::integer,array_agg(DISTINCT source)
 FROM public.bars_1m
 WHERE ts >= (session_date + time '09:15') AT TIME ZONE 'Asia/Kolkata'
   AND ts <= (session_date + time '15:30') AT TIME ZONE 'Asia/Kolkata'
   AND exchange IN ('NSE','BSE')
 GROUP BY exchange,symbol_token
 ON CONFLICT(exchange,symbol_token,trade_date) DO UPDATE SET
  open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,
  volume=excluded.volume,first_ts=excluded.first_ts,last_ts=excluded.last_ts,
  bar_count=excluded.bar_count,sources=excluded.sources,archived_at=now()
 -- Do not replace a complete archived session with a subsequently purged partial path.
 WHERE excluded.bar_count>=minute_daily_archive.bar_count;
 GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected;
END $$;
COMMIT;
