#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_db="current_month_cleanup_test_$$"
psql_test() {
 docker exec -i trading-stack-novius2-postgres-1 sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$@"' sh "$test_db" "$@"
}
docker exec trading-stack-novius2-postgres-1 sh -c 'exec createdb -U "$POSTGRES_USER" "$1"' sh "$test_db"
trap 'docker exec trading-stack-novius2-postgres-1 sh -c '\''exec dropdb -U "$POSTGRES_USER" "$1"'\'' sh "$test_db"' EXIT
psql_test <<'SQL'
CREATE SCHEMA nse;
CREATE SCHEMA nse_app;
CREATE SCHEMA oiis;
CREATE SCHEMA oiis_live;
CREATE SCHEMA oiss;
CREATE SCHEMA paper_trading;
CREATE TABLE nse.dim_security_master_snapshot(fininstrm_id bigint,snapshot_date date);
CREATE TABLE public.instrument_master_snapshot(exchange text,symbol_token text,snapshot_date date,expiry date);
CREATE TABLE public.instruments(exchange text,symbol_token text,expiry date);
CREATE TABLE public.instrument_state(symbol_token text);
CREATE TABLE public.instrument_universe(symbol_token text);
CREATE TABLE public.subscriptions(symbol_token text);
CREATE TABLE public.api_request_log(ts timestamptz);
CREATE TABLE nse_app.backtest_daily_equity(trade_date date);
CREATE TABLE nse_app.batch_run_audit(batch_run_id int PRIMARY KEY,data_as_of_date date);
CREATE TABLE nse_app.backtest_stock_summary(batch_run_id int REFERENCES nse_app.batch_run_audit);
CREATE TABLE oiis.replay_run(replay_run_id int PRIMARY KEY,status text,actual_end date);
CREATE TABLE oiis.decision_snapshot(decision_id int PRIMARY KEY,replay_run_id int REFERENCES oiis.replay_run,trade_date date);
CREATE TABLE oiis.trade_outcome(decision_id int REFERENCES oiis.decision_snapshot);
CREATE TABLE paper_trading.trade_groups(trade_group_id int PRIMARY KEY,opened_at timestamptz,created_at timestamptz,metadata jsonb);
CREATE TABLE paper_trading.instrument_snapshots(instrument_snapshot_id int PRIMARY KEY,symbol text,instrument_token text);
CREATE TABLE paper_trading.trade_legs(trade_leg_id int PRIMARY KEY,trade_group_id int,instrument_snapshot_id int,opened_at timestamptz,side text);
CREATE TABLE paper_trading.positions(trade_leg_id int PRIMARY KEY,remaining_quantity numeric,average_entry_price numeric,unrealised_pnl numeric);
CREATE TABLE paper_trading.valuation_snapshots(valuation_snapshot_id int PRIMARY KEY,trade_group_id int,valued_at timestamptz);
CREATE TABLE paper_trading.account_equity_snapshots(account_id text,snapshot_at timestamptz);
CREATE TABLE paper_trading.processed_market_bars(exchange text,instrument_token text,bar_ts timestamptz);
CREATE TABLE paper_trading.instrument_monitor_cursors(exchange text,instrument_token text,last_bar_ts timestamptz);
CREATE TABLE oiis_live.daily_candidate(candidate_id int PRIMARY KEY,run_id int,symbol text,direction text,available_at timestamptz,created_at timestamptz,trade_date date);
CREATE TABLE oiis_live.selection_run(auto_paper_candidate_id int);
CREATE TABLE oiis_live.watchlist_item(candidate_id int);
CREATE TABLE oiis_live.candidate_run_change(candidate_id int,trade_date date);
CREATE TABLE oiss.candidate(source_oiis_candidate_id int);
INSERT INTO nse.dim_security_master_snapshot VALUES (1,'2026-09-01'),(1,'2026-10-01'),(2,'2026-09-01');
INSERT INTO public.instrument_master_snapshot VALUES ('NSE','1','2026-09-01',NULL),('NSE','1','2026-10-01',NULL),('NSE','2','2026-09-01',NULL),('NFO','3','2026-09-01','2026-09-30');
INSERT INTO public.instruments VALUES ('NFO','3','2026-09-30'),('NFO','4','2026-09-30'),('NFO','5','2026-10-30');
INSERT INTO public.subscriptions VALUES ('4');
INSERT INTO public.api_request_log VALUES ('2026-09-01'),('2026-10-01');
INSERT INTO nse_app.backtest_daily_equity VALUES ('2026-09-01'),('2026-10-01');
INSERT INTO nse_app.batch_run_audit VALUES (1,'2026-09-30'),(2,'2026-10-12');
INSERT INTO nse_app.backtest_stock_summary VALUES (1),(2);
INSERT INTO oiis.replay_run VALUES (1,'SUCCEEDED','2026-09-30'),(2,'SUCCEEDED','2026-10-12');
INSERT INTO oiis.decision_snapshot VALUES (1,1,'2026-09-01'),(2,2,'2026-10-01');
INSERT INTO oiis.trade_outcome VALUES (1),(2);
INSERT INTO paper_trading.trade_groups VALUES (1,'2026-09-02','2026-09-02','{"run_id":"1"}');
INSERT INTO paper_trading.instrument_snapshots VALUES (1,'ABC-EQ','1');
INSERT INTO paper_trading.trade_legs VALUES (1,1,1,'2026-09-02','BUY');
INSERT INTO paper_trading.positions VALUES (1,5,100,25);
INSERT INTO paper_trading.valuation_snapshots VALUES
 (1,1,'2026-09-01'),(2,1,'2026-10-11 09:00Z'),(3,1,'2026-10-12 09:00Z');
INSERT INTO paper_trading.account_equity_snapshots VALUES ('a','2026-09-01'),('a','2026-10-11 09:00Z'),('a','2026-10-12 09:00Z');
INSERT INTO paper_trading.processed_market_bars VALUES ('NSE','1','2026-09-01'),('NSE','2','2026-09-01');
INSERT INTO paper_trading.instrument_monitor_cursors VALUES ('NSE','1','2026-10-01'),('NSE','2','2026-08-01');
INSERT INTO oiis_live.daily_candidate VALUES
 (1,1,'ABC','LONG','2026-09-01','2026-09-01','2026-09-01'),
 (2,2,'ABC','LONG','2026-09-03','2026-09-03','2026-09-03'),
 (3,3,'XYZ','LONG','2026-09-03','2026-09-03','2026-09-03'),
 (4,4,'XYZ','LONG','2026-10-03','2026-10-03','2026-10-03');
INSERT INTO oiis_live.selection_run VALUES (3);
INSERT INTO oiis_live.candidate_run_change VALUES (1,'2026-09-01'),(2,'2026-09-03');
SQL
run_cleanup() {
 psql_test -v "apply=$1" -v compact=true -v "paper_only=$2" -v as_of=2026-10-12T09:00:00Z < "$root_dir/scripts/sql/current_month_data_cleanup.sql"
}
run_cleanup false false
psql_test <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.api_request_log)<>2 THEN RAISE EXCEPTION 'Planning deleted rows'; END IF;
END $$;
SQL
run_cleanup true false
psql_test <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.api_request_log)<>1 OR
    (SELECT count(*) FROM nse_app.backtest_daily_equity)<>1 OR
    (SELECT count(*) FROM nse_app.backtest_stock_summary)<>1 OR
    (SELECT count(*) FROM oiis.decision_snapshot)<>1 OR
    (SELECT count(*) FROM oiis.trade_outcome)<>1 OR
    (SELECT count(*) FROM nse.dim_security_master_snapshot)<>2 OR
    (SELECT count(*) FROM public.instrument_master_snapshot)<>2 OR
    (SELECT count(*) FROM public.instruments)<>2 OR
    (SELECT count(*) FROM oiis_live.candidate_run_change)<>1 OR
    (SELECT count(*) FROM paper_trading.valuation_snapshots)<>2 OR
    (SELECT count(*) FROM paper_trading.account_equity_snapshots)<>2 OR
    (SELECT count(*) FROM paper_trading.processed_market_bars)<>1 OR
    EXISTS(SELECT FROM oiis_live.daily_candidate WHERE candidate_id=2) OR
    (SELECT count(*) FROM oiis_live.daily_candidate)<>3 OR
    (SELECT opened_at FROM paper_trading.trade_legs WHERE trade_leg_id=1)<>'2026-09-02' OR
    (SELECT unrealised_pnl FROM paper_trading.positions WHERE trade_leg_id=1)<>25 THEN
  RAISE EXCEPTION 'Current-month, baseline, identity, dedup or paper preservation failed';
 END IF;
END $$;
SQL
run_cleanup true false
psql_test <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT FROM (SELECT DISTINCT ON(relation_name) rows_removed
   FROM operations.current_month_cleanup_log ORDER BY relation_name,id DESC) latest WHERE rows_removed<>0) THEN
  RAISE EXCEPTION 'Idempotency or zero-row audit count failed';
 END IF;
END $$;
TRUNCATE oiis.trade_outcome,oiis.decision_snapshot;
INSERT INTO oiis.replay_run VALUES (1,'SUCCEEDED','2026-09-30');
INSERT INTO oiis.decision_snapshot VALUES (1,1,'2026-09-01');
INSERT INTO oiis.trade_outcome VALUES (1);
INSERT INTO public.api_request_log VALUES ('2026-09-01');
SQL
run_cleanup true true
psql_test <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.api_request_log)<>2 THEN RAISE EXCEPTION 'Daily paper-only affected non-paper data'; END IF;
END $$;
SQL
run_cleanup true false
psql_test <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT FROM oiis.decision_snapshot) OR EXISTS(SELECT FROM oiis.trade_outcome) THEN
  RAISE EXCEPTION 'All-expired research truncate failed';
 END IF;
END $$;
SQL
echo 'Current-month data cleanup integration tests passed.'
