-- Run ONLY after archive_minute_session has covered every retained completed session.
-- Exact legacy index-close parity is checked before replacing either view.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM (
   SELECT symbol_token,(ts AT TIME ZONE 'Asia/Kolkata')::date d,
    (array_agg(close ORDER BY ts DESC))[1]::numeric(18,6) px,
    max(high)::numeric(18,6) high,min(low)::numeric(18,6) low
   FROM public.bars_1m WHERE exchange='NSE' AND symbol_token IN('99926000','99926009','99926017')
    AND ts < ((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')
    AND extract(isodow FROM ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 1 AND 5
    AND (ts AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND time '15:30'
   GROUP BY 1,2
  ) m LEFT JOIN public.minute_daily_archive a ON a.exchange='NSE' AND a.symbol_token=m.symbol_token AND a.trade_date=m.d
  WHERE a.symbol_token IS NULL OR a.close::numeric(18,6) IS DISTINCT FROM m.px
   OR a.high::numeric(18,6) IS DISTINCT FROM m.high OR a.low::numeric(18,6) IS DISTINCT FROM m.low
 ) THEN RAISE EXCEPTION 'Index daily archive parity incomplete; cutover blocked'; END IF;
END $$;

CREATE OR REPLACE VIEW integration.v_archived_index_close AS
SELECT a.trade_date,a.symbol_token,a.close::numeric(18,6) close_px,a.high::numeric(18,6) high,a.low::numeric(18,6) low
FROM public.minute_daily_archive a
WHERE a.exchange='NSE' AND a.symbol_token IN('99926000','99926009','99926017')
 AND extract(isodow FROM a.trade_date) BETWEEN 1 AND 5
 AND a.trade_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
UNION ALL
SELECT (b.ts AT TIME ZONE 'Asia/Kolkata')::date,b.symbol_token,
 (array_agg(b.close ORDER BY b.ts DESC))[1]::numeric(18,6),max(b.high)::numeric(18,6),min(b.low)::numeric(18,6)
FROM public.bars_1m b WHERE b.exchange='NSE' AND b.symbol_token IN('99926000','99926009','99926017')
 AND b.ts >= ((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')
 AND extract(isodow FROM b.ts AT TIME ZONE 'Asia/Kolkata') BETWEEN 1 AND 5
 AND (b.ts AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND time '15:30'
GROUP BY 1,2;

CREATE OR REPLACE VIEW integration.v_prev_index_daily AS
WITH index_map(index_code,symbol_token) AS (VALUES('NIFTY 50'::text,'99926000'::text),('BANK NIFTY','99926009'),('INDIA VIX','99926017')),
session_dates AS (
 SELECT DISTINCT s.trade_date,s.index_code FROM integration.v_source_index_1m s
 UNION SELECT a.trade_date,m.index_code FROM public.minute_daily_archive a JOIN index_map m USING(symbol_token) WHERE a.exchange='NSE'
)
SELECT sd.trade_date,sd.index_code,prev.prev_close FROM session_dates sd JOIN index_map im USING(index_code)
LEFT JOIN LATERAL (
 SELECT d.close_px prev_close FROM integration.v_archived_index_close d
 WHERE d.symbol_token=im.symbol_token AND d.trade_date<sd.trade_date ORDER BY d.trade_date DESC LIMIT 1
) prev ON true;

CREATE OR REPLACE VIEW integration.v_index_daily_history AS
WITH market_activity AS (
 SELECT trade_date,CASE WHEN upper(index_name) IN('NIFTY 50','NIFTY50') THEN 'NIFTY 50'
 WHEN upper(index_name) IN('NIFTY BANK','BANK NIFTY') THEN 'BANK NIFTY'
 WHEN upper(index_name)='INDIA VIX' THEN 'INDIA VIX' ELSE NULL END index_code,close_price::numeric(18,6) close_px,
 close_price::numeric(18,6) close,high_price::numeric(18,6) high,low_price::numeric(18,6) low
 FROM nse.fact_market_activity_index WHERE upper(index_name) IN('NIFTY 50','NIFTY50','NIFTY BANK','BANK NIFTY','INDIA VIX')
), index_map(index_code,symbol_token) AS (VALUES('NIFTY 50'::text,'99926000'::text),('BANK NIFTY','99926009'),('INDIA VIX','99926017')),
minute_fallback AS (SELECT d.trade_date,im.index_code,d.close_px,d.close_px AS close,d.high,d.low FROM integration.v_archived_index_close d JOIN index_map im USING(symbol_token))
SELECT trade_date,index_code,close_px,close,high,low FROM market_activity WHERE index_code IS NOT NULL
UNION ALL
SELECT mf.trade_date,mf.index_code,mf.close_px,mf.close,mf.high,mf.low FROM minute_fallback mf WHERE NOT EXISTS(
 SELECT 1 FROM market_activity ma WHERE ma.index_code=mf.index_code AND ma.trade_date=mf.trade_date
);
COMMIT;
