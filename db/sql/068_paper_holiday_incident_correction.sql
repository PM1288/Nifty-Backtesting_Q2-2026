-- Preserve the original incident and its evidence while correcting its classification.
UPDATE paper_trading.data_quality_incidents i
SET status='RESOLVED',
    detail=coalesce(i.detail,'{}'::jsonb) || jsonb_build_object(
      'resolution','NO_TRADING_SESSION','calendar_source',c.source,'resolved_at',now())
FROM market_status.exchange_session_calendar c
WHERE i.incident_type='STALE' AND i.status='OPEN' AND i.exchange='NSE'
  AND c.trade_date=(i.detected_at AT TIME ZONE 'Asia/Kolkata')::date
  AND c.trade_date=DATE '2026-11-24' AND NOT c.is_trading_day;
