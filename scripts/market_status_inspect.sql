\pset pager off

SELECT service_name,status,detail,last_success_at,last_error_at,updated_at
FROM market_status.service_heartbeat
ORDER BY service_name;

SELECT trade_date,job_name,status,suppression_reason,count(*) AS jobs,
       max(source_data_as_of) AS latest_data_as_of,max(completed_at) AS latest_completion
FROM market_status.job_run
WHERE trade_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 5
GROUP BY trade_date,job_name,status,suppression_reason
ORDER BY trade_date DESC,job_name,status;

SELECT status,count(*) AS rows,min(next_attempt_at) AS oldest_due,
       max(attempts) AS max_attempts
FROM market_status.notification_outbox
GROUP BY status
ORDER BY status;

SELECT event_type,trade_date,status,event_id,dedupe_key,source_run_id,attempts,
       created_at,sent_at,last_error
FROM market_status.notification_outbox
ORDER BY created_at DESC
LIMIT 30;

SELECT event_family,destination_key,trade_date,last_successful_membership,
       last_successful_source_run_id,last_successful_at,last_enqueued_fingerprint
FROM market_status.notification_state
ORDER BY trade_date DESC,destination_key;

SELECT effective_from,count(*) AS members,count(DISTINCT symbol_token) AS tokens
FROM market_status.effective_universe_member
WHERE index_symbol='NIFTY50'
GROUP BY effective_from
ORDER BY effective_from DESC
LIMIT 10;
