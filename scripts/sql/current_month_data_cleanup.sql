\set ON_ERROR_STOP on
SET timezone='UTC';
SET lock_timeout='5s';
SET statement_timeout='30min';
SELECT pg_advisory_lock(hashtextextended('tradingdb:current-month-data-cleanup',0));
CREATE TEMP TABLE cleanup_params AS
SELECT (date_trunc('month', :'as_of'::timestamptz) -
  CASE WHEN extract(day FROM :'as_of'::timestamptz)<7
    THEN interval '1 month' ELSE interval '0 month' END)::date AS cutoff,
  ((:'as_of'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::timestamp
    AT TIME ZONE 'Asia/Kolkata') AS today;

-- Keep all authoritative trades, fills, purchase timestamps, positions,
-- cash/cost/P&L ledgers, monitor cursors and configuration. Old daily source
-- prices/features also remain: current signals need indicator warm-up history.
CREATE TEMP TABLE cleanup_rules(priority integer,relation_name text PRIMARY KEY,predicate text);
INSERT INTO cleanup_rules VALUES
 (10,'oiis.trade_outcome','EXISTS(SELECT FROM oiis.decision_snapshot d WHERE d.decision_id=t.decision_id AND d.trade_date<(SELECT cutoff FROM cleanup_params))'),
 (20,'oiis.decision_snapshot','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (30,'oiis.replay_run','status<>''RUNNING'' AND actual_end<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM oiis.decision_snapshot d WHERE d.replay_run_id=t.replay_run_id)'),
 (40,'public.api_request_log','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.symbol_perf_snapshot','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.pcr_snapshots','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.metrics_1m','minute_ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.strategy_state','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.oibuildup_snapshots','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.putcallratio_snapshots','ts<(SELECT cutoff FROM cleanup_params)'),
 (40,'public.gainers_losers_snapshots','ts<(SELECT cutoff FROM cleanup_params)'),
 (45,'public.instruments','expiry<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM public.instrument_state s WHERE s.symbol_token=t.symbol_token) AND NOT EXISTS(SELECT FROM public.instrument_universe s WHERE s.symbol_token=t.symbol_token) AND NOT EXISTS(SELECT FROM public.subscriptions s WHERE s.symbol_token=t.symbol_token) AND NOT EXISTS(SELECT FROM paper_trading.instrument_snapshots s WHERE s.instrument_token=t.symbol_token)'),
 (48,'oiis_live.candidate_run_change','trade_date<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_paper_candidate_keep k WHERE k.candidate_id=t.candidate_id)'),
 (50,'nse.dim_security_master_snapshot','snapshot_date<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_security_master_keep k WHERE k.fininstrm_id=t.fininstrm_id AND k.snapshot_date=t.snapshot_date)'),
 (50,'public.instrument_master_snapshot','(snapshot_date<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_instrument_master_keep k WHERE k.exchange=t.exchange AND k.symbol_token=t.symbol_token AND k.snapshot_date=t.snapshot_date)) OR (expiry<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM public.instruments i WHERE i.exchange=t.exchange AND i.symbol_token=t.symbol_token))'),
 (50,'oiis_live.daily_candidate','trade_date<(SELECT cutoff FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_paper_candidate_keep k WHERE k.candidate_id=t.candidate_id) AND NOT EXISTS(SELECT FROM oiis_live.selection_run r WHERE r.auto_paper_candidate_id=t.candidate_id) AND NOT EXISTS(SELECT FROM oiis_live.watchlist_item r WHERE r.candidate_id=t.candidate_id) AND NOT EXISTS(SELECT FROM oiis_live.candidate_run_change r WHERE r.candidate_id=t.candidate_id) AND NOT EXISTS(SELECT FROM oiss.candidate r WHERE r.source_oiis_candidate_id=t.candidate_id)'),
 (60,'paper_trading.valuation_snapshots','valued_at<(SELECT today FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_valuation_keep k WHERE k.valuation_snapshot_id=t.valuation_snapshot_id)'),
 (60,'paper_trading.account_equity_snapshots','snapshot_at<(SELECT today FROM cleanup_params) AND NOT EXISTS(SELECT FROM cleanup_equity_keep k WHERE k.account_id=t.account_id AND k.snapshot_at=t.snapshot_at)'),
 (60,'paper_trading.processed_market_bars','bar_ts<(SELECT cutoff FROM cleanup_params) AND EXISTS(SELECT FROM paper_trading.instrument_monitor_cursors c WHERE c.exchange=t.exchange AND c.instrument_token=t.instrument_token AND c.last_bar_ts>=t.bar_ts)'),
 (80,'nse_app.backtest_daily_equity','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_symbol_daily','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_benchmark_fd','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_feature_daily','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_compare_summary_mart','as_of_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_daily_summary_mart','as_of_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_strategy_summary_mart','as_of_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_open_position','as_of_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.dashboard_snapshots','snapshot_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'strategy_eval.long_horizon_checkpoint','trade_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'strategy_eval.path_checkpoint','checkpoint_ts<(SELECT cutoff FROM cleanup_params)'),
 (80,'strategy_eval.period_metric','period_end<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_skipped_signal','coalesce(entry_date,signal_date)<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_trade_log','exit_date<(SELECT cutoff FROM cleanup_params)'),
 (80,'nse_app.backtest_trade_template','theoretical_exit_date<(SELECT cutoff FROM cleanup_params)');
INSERT INTO cleanup_rules
SELECT 70,relation_name,'EXISTS(SELECT FROM nse_app.batch_run_audit a WHERE a.batch_run_id=t.batch_run_id AND a.data_as_of_date<(SELECT cutoff FROM cleanup_params))'
FROM unnest(ARRAY['nse_app.backtest_stock_summary','nse_app.backtest_stock_summary_mart',
 'nse_app.backtest_regime_summary','nse_app.backtest_regime_summary_mart',
 'nse_app.backtest_run_validation']) AS relation_name;
DELETE FROM cleanup_rules WHERE to_regclass(relation_name) IS NULL;
\if :paper_only
DELETE FROM cleanup_rules WHERE relation_name NOT IN
 ('paper_trading.valuation_snapshots','paper_trading.account_equity_snapshots');
\endif

\if :paper_only
\else
CREATE TEMP TABLE cleanup_security_master_keep AS
 SELECT fininstrm_id,max(snapshot_date) AS snapshot_date FROM nse.dim_security_master_snapshot GROUP BY 1;
CREATE UNIQUE INDEX ON cleanup_security_master_keep(fininstrm_id,snapshot_date);
CREATE TEMP TABLE cleanup_instrument_master_keep AS
 SELECT exchange,symbol_token,max(snapshot_date) AS snapshot_date FROM public.instrument_master_snapshot GROUP BY 1,2;
CREATE UNIQUE INDEX ON cleanup_instrument_master_keep(exchange,symbol_token,snapshot_date);
CREATE TEMP TABLE cleanup_paper_candidate_keep AS
 SELECT DISTINCT candidate_id FROM paper_trading.trade_legs l
 JOIN paper_trading.trade_groups g USING(trade_group_id)
 JOIN paper_trading.instrument_snapshots i USING(instrument_snapshot_id)
 JOIN LATERAL (
   SELECT candidate_id FROM oiis_live.daily_candidate d
   WHERE upper(d.symbol)=upper(regexp_replace(i.symbol,'-EQ$','','i'))
     AND d.available_at<=coalesce(l.opened_at,g.opened_at,g.created_at)
     AND d.direction=CASE WHEN l.side='SELL' THEN 'SHORT' ELSE 'LONG' END
   ORDER BY (d.run_id::text=coalesce(g.metadata->>'run_id','')) DESC,
     d.available_at DESC,d.created_at DESC LIMIT 1
 ) candidate ON true;
CREATE UNIQUE INDEX ON cleanup_paper_candidate_keep(candidate_id);
ANALYZE cleanup_security_master_keep;
ANALYZE cleanup_instrument_master_keep;
ANALYZE cleanup_paper_candidate_keep;
\endif
CREATE TEMP TABLE cleanup_valuation_keep AS
 SELECT DISTINCT ON (v.trade_group_id) v.valuation_snapshot_id
 FROM paper_trading.valuation_snapshots v
 WHERE v.valued_at<(SELECT today FROM cleanup_params)
   AND EXISTS(SELECT FROM paper_trading.trade_legs l JOIN paper_trading.positions p USING(trade_leg_id)
     WHERE l.trade_group_id=v.trade_group_id AND p.remaining_quantity>0)
 ORDER BY v.trade_group_id,v.valued_at DESC;
CREATE UNIQUE INDEX ON cleanup_valuation_keep(valuation_snapshot_id);
CREATE TEMP TABLE cleanup_equity_keep AS
 SELECT DISTINCT ON(account_id) account_id,snapshot_at
 FROM paper_trading.account_equity_snapshots
 WHERE snapshot_at<(SELECT today FROM cleanup_params)
 ORDER BY account_id,snapshot_at DESC;
CREATE UNIQUE INDEX ON cleanup_equity_keep(account_id,snapshot_at);
ANALYZE cleanup_valuation_keep;

SELECT relation_name,predicate FROM cleanup_rules ORDER BY priority,relation_name;
\if :apply
CREATE SCHEMA IF NOT EXISTS operations;
CREATE TABLE IF NOT EXISTS operations.current_month_cleanup_log(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 cleaned_at timestamptz NOT NULL DEFAULT now(),relation_name text NOT NULL,
 cutoff date NOT NULL,rows_removed bigint NOT NULL,bytes_before bigint NOT NULL,
 bytes_after bigint,policy text NOT NULL DEFAULT 'Current month plus active paper accounting; user authorized 2026-10-12'
);
-- Research replays are not live paper positions. When their whole dataset is
-- expired, truncate the two related tables together instead of generating
-- millions of delete records. Check under lock to protect concurrent inserts.
\if :paper_only
\else
DO $$ BEGIN
 LOCK TABLE oiis.decision_snapshot,oiis.trade_outcome IN ACCESS EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT FROM oiis.decision_snapshot WHERE trade_date>=(SELECT cutoff FROM cleanup_params)) THEN
   INSERT INTO operations.current_month_cleanup_log(relation_name,cutoff,rows_removed,bytes_before)
   SELECT 'oiis.decision_snapshot',(SELECT cutoff FROM cleanup_params),count(*),pg_total_relation_size('oiis.decision_snapshot') FROM oiis.decision_snapshot
   UNION ALL
   SELECT 'oiis.trade_outcome',(SELECT cutoff FROM cleanup_params),count(*),pg_total_relation_size('oiis.trade_outcome') FROM oiis.trade_outcome;
   TRUNCATE oiis.trade_outcome,oiis.decision_snapshot RESTRICT;
   UPDATE operations.current_month_cleanup_log SET bytes_after=pg_total_relation_size(relation_name::regclass)
   WHERE bytes_after IS NULL AND relation_name IN ('oiis.decision_snapshot','oiis.trade_outcome');
   DELETE FROM cleanup_rules WHERE relation_name IN ('oiis.trade_outcome','oiis.decision_snapshot');
 END IF;
END $$;
\endif
-- Each relation commits independently. Failures are visible and retryable.
SELECT format('WITH before AS MATERIALIZED (SELECT pg_total_relation_size(%L::regclass) AS bytes), deleted AS (DELETE FROM %s t WHERE %s RETURNING 1 AS removed) INSERT INTO operations.current_month_cleanup_log(relation_name,cutoff,rows_removed,bytes_before) SELECT %L,(SELECT cutoff FROM cleanup_params),count(deleted.removed),before.bytes FROM before LEFT JOIN deleted ON true GROUP BY before.bytes;',
 relation_name,relation_name,predicate,relation_name)
FROM cleanup_rules ORDER BY priority,relation_name
\gexec
\if :compact
-- VACUUM FULL returns deleted-row space to the filesystem. If a busy table
-- cannot be locked within five seconds, stop and retry rather than block it.
SELECT format('VACUUM (FULL, ANALYZE) %s;',relation_name)
FROM cleanup_rules r WHERE EXISTS(SELECT FROM operations.current_month_cleanup_log l
 WHERE l.relation_name=r.relation_name AND l.bytes_after IS NULL AND l.rows_removed>0)
ORDER BY priority,relation_name
\gexec
UPDATE operations.current_month_cleanup_log SET bytes_after=pg_total_relation_size(relation_name::regclass)
WHERE bytes_after IS NULL AND relation_name IN(SELECT relation_name FROM cleanup_rules);
\endif
\endif
