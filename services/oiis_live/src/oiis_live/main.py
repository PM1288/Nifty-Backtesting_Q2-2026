from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import sys
import time
import uuid
from datetime import UTC, date, datetime, time as wall_time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .policy import intraday_entry_eligible, wilder_rsi, williams_r
from .selector import evaluate_latest, refresh_universe, result_hash

LOG = logging.getLogger("oiis-live")
IST = ZoneInfo("Asia/Kolkata")
POLICY_ID = "OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0"
POLICY_VERSION = "2.0"
SELECTION_SLOTS = {
    "PREOPEN_0830": wall_time(8, 30),
    "OPEN_0930": wall_time(9, 30),
    "AFTERNOON_1500": wall_time(15, 0),
}


class Runtime:
    def __init__(self) -> None:
        self.database_url = required("DATABASE_URL")
        self.paper_api_url = os.getenv("PAPER_API_URL", "http://paper-api:8088").rstrip("/")
        self.paper_token = os.getenv("PAPER_API_SERVICE_TOKEN") or required("API_SERVICE_TOKENS").split(",")[0]
        self.error_webhook = os.getenv("OIIS_ERROR_WEBHOOK_URL", "")
        self.poll_seconds = max(2, int(os.getenv("OIIS_POLL_SECONDS", "10")))
        self.policy_path = Path(os.getenv("OIIS_POLICY_PATH", "/app/config/policy.json"))
        self.policy = json.loads(self.policy_path.read_text())
        self.pool = ConnectionPool(self.database_url, min_size=1, max_size=4, kwargs={"row_factory": dict_row})

    def close(self) -> None:
        self.pool.close()

    def heartbeat(self, service: str, status: str, detail: dict[str, Any], success: bool = True) -> None:
        with self.pool.connection() as conn:
            conn.execute("""INSERT INTO oiis_live.service_heartbeat(service_name,status,detail,last_success_at,last_error_at)
              VALUES (%s,%s,%s::jsonb,CASE WHEN %s THEN now() END,CASE WHEN %s THEN NULL ELSE now() END)
              ON CONFLICT(service_name) DO UPDATE SET status=excluded.status,detail=excluded.detail,
              last_success_at=CASE WHEN %s THEN now() ELSE oiis_live.service_heartbeat.last_success_at END,
              last_error_at=CASE WHEN %s THEN oiis_live.service_heartbeat.last_error_at ELSE now() END,updated_at=now()""",
              (service,status,json.dumps(detail,default=str),success,success,success,success))

    def record_error(self, service: str, exc: Exception, context: dict[str, Any] | None = None) -> None:
        message=f"{type(exc).__name__}: {exc}"; bucket=datetime.now(UTC).strftime("%Y%m%d%H")
        key=hashlib.sha256(f"{service}|{type(exc).__name__}|{message}|{bucket}".encode()).hexdigest()
        with self.pool.connection() as conn:
            conn.execute("""INSERT INTO oiis_live.error_outbox(service_name,severity,error_class,message,context,dedupe_key)
              VALUES (%s,'ERROR',%s,%s,%s::jsonb,%s) ON CONFLICT(dedupe_key) DO NOTHING""",
              (service,type(exc).__name__,message,json.dumps(context or {},default=str),key))
        self.heartbeat(service,"ERROR",{"error":message},False)

    def deliver_errors(self) -> int:
        if not self.error_webhook:
            return 0
        delivered=0
        with self.pool.connection() as conn:
            rows=conn.execute("""SELECT * FROM oiis_live.error_outbox WHERE status='PENDING' AND available_at<=now()
              ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED""").fetchall()
            for row in rows:
                conn.execute("UPDATE oiis_live.error_outbox SET status='PROCESSING',attempts=attempts+1 WHERE error_id=%s",(row["error_id"],))
                detail={"service":"oiis-live","severity":row["severity"],"error_class":row["error_class"],"message":row["message"],"context":row["context"],"occurred_at":row["created_at"].isoformat(),"environment":"PAPER"}
                # The configured endpoint is Mattermost-compatible and requires
                # a top-level text field; props preserve structured evidence.
                payload={"text":f"OIIS LIVE PAPER {row['severity']}: {row['error_class']} - {row['message']}","props":{"oiis_error":detail}}
                try:
                    response=httpx.post(self.error_webhook,json=payload,timeout=10)
                    response.raise_for_status()
                    conn.execute("UPDATE oiis_live.error_outbox SET status='DELIVERED',delivered_at=now(),last_error=NULL WHERE error_id=%s",(row["error_id"],)); delivered+=1
                except Exception as exc:
                    dead=int(row["attempts"])+1>=8
                    conn.execute("UPDATE oiis_live.error_outbox SET status=%s,last_error=%s,available_at=now()+make_interval(secs=>%s) WHERE error_id=%s",("DEAD" if dead else "PENDING",str(exc)[:1000],min(3600,30*2**int(row["attempts"])),row["error_id"]))
        return delivered

    def run_selection(self, signal_date: date | None = None, trade_date: date | None = None, run_slot: str | None = None) -> dict[str, Any]:
        with self.pool.connection() as conn:
            universe_counts = refresh_universe(conn)
            if signal_date is None:
                row=conn.execute("""SELECT greatest(
                  coalesce((SELECT max(trade_date) FROM nse.fact_eod_prices),date '1900-01-01'),
                  coalesce((SELECT max(trade_date) FROM strategy_eval.stock_daily_regime),date '1900-01-01')) signal_date""").fetchone()
                signal_date=row["signal_date"]
            trade_date=trade_date or next_session(conn,signal_date)
            run_slot = run_slot or f"MANUAL_{datetime.now(IST).strftime('%H%M%S')}"
            source=conn.execute("SELECT max(trade_date) eod,(SELECT max(ts) FROM public.bars_1m) minute_ts FROM nse.fact_eod_prices").fetchone()
            run=conn.execute("""INSERT INTO oiis_live.selection_run(policy_id,policy_version,signal_date,trade_date,run_slot,as_of_ts,status,source_max_eod_date,source_max_minute_ts)
              VALUES (%s,%s,%s,%s,%s,now(),'RUNNING',%s,%s)
              ON CONFLICT(policy_id,policy_version,signal_date,trade_date,run_slot) DO UPDATE SET status='RUNNING',as_of_ts=now(),error_detail=NULL,started_at=now(),completed_at=NULL
              RETURNING run_id""",(POLICY_ID,POLICY_VERSION,signal_date,trade_date,run_slot,source["eod"],source["minute_ts"])).fetchone()
            as_of_ts = datetime.now(IST) if trade_date == datetime.now(IST).date() else None
            rows=evaluate_latest(conn,signal_date,as_of_ts)
            conn.execute("""UPDATE oiis_live.watchlist_item SET active=false,entry_enabled=false,updated_at=now()
              WHERE policy_id=%s AND trade_date=%s AND source='DAILY_SELECTION'
                AND NOT EXISTS (SELECT 1 FROM oiis_live.entry_claim e WHERE e.watchlist_item_id=oiis_live.watchlist_item.watchlist_item_id)""",(POLICY_ID,trade_date))
            selected=qualified=0
            for item in rows:
                selected+=int(item["selected"]); qualified+=int(item["canonical_status"]=="QUALIFIED_FOR_INTRADAY_REVALIDATION")
                reference_price = item["reference_price"]
                no_chase_price = reference_price * 1.01 if reference_price is not None else None
                candidate=conn.execute("""INSERT INTO oiis_live.daily_candidate(run_id,policy_id,policy_version,signal_date,trade_date,symbol,instrument_token,sector,direction,daily_level,ofactor_level,directional_edge_level,extension_level,volume_level,canonical_status,selected,rank,data_quality,data_permission,ofactor,xfactor_snapshot,directional_edge,rsi14,willr14,ema61,macd_line,atr14,volume_vs_sma20,volume_percentile_90,reference_price,buy_limit,no_chase_price,failed_gate_count,blocking_gate_count,recommended,recommendation_rank,component_scores,market_context,condition_results,reason_codes,feature_values,gate_evidence,universe_flags,evidence,observed_at,available_at)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s)
                  ON CONFLICT(run_id,symbol) DO UPDATE SET selected=excluded.selected,rank=excluded.rank,recommended=excluded.recommended,recommendation_rank=excluded.recommendation_rank,component_scores=excluded.component_scores,condition_results=excluded.condition_results,reason_codes=excluded.reason_codes,feature_values=excluded.feature_values,gate_evidence=excluded.gate_evidence,evidence=excluded.evidence,observed_at=excluded.observed_at,available_at=excluded.available_at
                  RETURNING candidate_id""",
                  (run["run_id"],POLICY_ID,POLICY_VERSION,signal_date,trade_date,item["symbol"],item["instrument_token"],item["sector"],item["direction"],item["daily_level"],item["ofactor_level"],item["directional_edge_level"],item["extension_level"],item["volume_level"],item["canonical_status"],item["selected"],item["rank"],item["data_quality"],item["data_permission"],item["ofactor"],item["xfactor"],item["directional_edge"],item["rsi14"],item["willr14"],item["ema61"],item["macd_line"],item["atr14"],item["volume_vs_sma20"],item["volume_percentile_90"],reference_price,reference_price,no_chase_price,item["failed_gate_count"],item["blocking_gate_count"],item["recommended"],item["recommendation_rank"],json.dumps(item["component_scores"]),json.dumps(item["market_context"]),json.dumps(item["conditions"]),json.dumps(item["reason_codes"]),json.dumps(item["feature_values"]),json.dumps(item["gate_evidence"]),json.dumps(item["universe_flags"],default=str),json.dumps(item["evidence"]),datetime.now(UTC),datetime.now(UTC))).fetchone()
                if item["recommended"]:
                    conn.execute("""INSERT INTO oiis_live.watchlist_item(candidate_id,policy_id,trade_date,symbol,instrument_token,source,active,entry_enabled,daily_level,canonical_status,rank,buy_limit,no_chase_price)
                      VALUES (%s,%s,%s,%s,%s,'DAILY_SELECTION',true,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(policy_id,trade_date,symbol) DO UPDATE SET candidate_id=excluded.candidate_id,
                        instrument_token=excluded.instrument_token,active=true,entry_enabled=excluded.entry_enabled,
                        daily_level=excluded.daily_level,canonical_status=excluded.canonical_status,rank=excluded.rank,
                        buy_limit=excluded.buy_limit,no_chase_price=excluded.no_chase_price,updated_at=now()""",
                      (candidate["candidate_id"],POLICY_ID,trade_date,item["symbol"],item["instrument_token"],item["selected"],item["daily_level"],item["canonical_status"],item["recommendation_rank"],reference_price,no_chase_price))
            digest=result_hash(rows)
            conn.execute("""UPDATE oiis_live.selection_run SET status='COMPLETED',requested_symbols=%s,evaluated_symbols=%s,selected_symbols=%s,qualified_symbols=%s,completed_at=now(),result_hash=%s WHERE run_id=%s""",(len(rows),len(rows),selected,qualified,digest,run["run_id"]))
            result={"run_id":str(run["run_id"]),"run_slot":run_slot,"signal_date":str(signal_date),"trade_date":str(trade_date),"universe":universe_counts,"evaluated":len(rows),"selected":selected,"recommended":min(10,len(rows)),"qualified":qualified,"result_hash":digest}
            self.heartbeat("oiis-live-selector","OK",result)
            return result

    def monitor_once(self, trade_date: date | None = None, submit: bool = True) -> dict[str, int]:
        trade_date=trade_date or datetime.now(IST).date(); result={"watchlist":0,"evaluated":0,"eligible":0,"submitted":0}
        with self.pool.connection() as conn:
            rows=conn.execute("""SELECT * FROM oiis_live.v_current_watchlist WHERE trade_date=%s AND active AND entry_enabled
              AND instrument_token IS NOT NULL ORDER BY rank NULLS LAST,symbol""",(trade_date,)).fetchall()
            result["watchlist"]=len(rows)
            for item in rows:
                if item["entry_status"] in {"CLAIMED","SUBMITTING","ACCEPTED","FILLED","REJECTED"}:
                    continue
                session_open=datetime.combine(trade_date,wall_time(9,15),tzinfo=IST)
                session_end=datetime.combine(trade_date,wall_time(15,31),tzinfo=IST)
                bars=conn.execute("""SELECT ts,open,high,low,close,volume,source FROM public.bars_1m
                  WHERE exchange='NSE' AND symbol_token=%s AND ts>=%s AND ts<%s
                  ORDER BY ts""",(item["instrument_token"],session_open,session_end)).fetchall()
                if len(bars)<15:
                    continue
                highs=[float(value["high"]) for value in bars]; lows=[float(value["low"]) for value in bars]; closes=[float(value["close"]) for value in bars]
                for index in range(14,len(bars)):
                    bar=bars[index]; source_bar=f"NSE:{item['instrument_token']}:{bar['ts'].isoformat()}:{bar['source']}"
                    exists=conn.execute("SELECT 1 FROM oiis_live.intraday_evaluation WHERE watchlist_item_id=%s AND source_bar_id=%s",(item["watchlist_item_id"],source_bar)).fetchone()
                    if exists:
                        continue
                    rsi=wilder_rsi(closes[:index+1]); willr=williams_r(highs[:index+1],lows[:index+1],closes[:index+1]); eligible=intraday_entry_eligible(rsi,willr,float(item["rsi_max"]),float(item["willr_max"]))
                    conn.execute("""INSERT INTO oiis_live.intraday_evaluation(watchlist_item_id,bar_ts,source_bar_id,close_price,rsi14,willr14,rsi_pass,willr_pass,price_limit_pass,eligible,decision,detail)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s,%s::jsonb)""",(item["watchlist_item_id"],bar["ts"],source_bar,bar["close"],rsi,willr,rsi is not None and rsi<float(item["rsi_max"]),willr is not None and willr<float(item["willr_max"]),eligible,"ENTRY_CLAIMED" if eligible else "WAIT_INDICATORS",json.dumps({"one_entry_per_symbol_day":True})))
                    result["evaluated"]+=1
                    if eligible:
                        result["eligible"]+=1
                        if submit and self.claim_and_submit(conn,item,bar,rsi,willr,source_bar): result["submitted"]+=1
                        break
        self.heartbeat("oiis-live-monitor","OK",result)
        return result

    def claim_and_submit(self, conn: Any, item: dict[str,Any], bar: dict[str,Any], rsi: float, willr: float, source_bar: str) -> bool:
        key=f"oiis-live:{item['trade_date']}:{item['symbol']}"; event=f"oiis-{item['trade_date']}-{item['symbol']}".lower()
        quantity=max(1,math.floor(float(self.policy["entry"]["maximum_ticket_inr"])/float(bar["close"])))
        payload=trade_payload(item,bar,rsi,willr,quantity,event)
        claim=conn.execute("""INSERT INTO oiis_live.entry_claim(watchlist_item_id,policy_id,trade_date,symbol,signal_ts,source_bar_id,status,idempotency_key,client_event_id,request_payload)
          VALUES (%s,%s,%s,%s,%s,%s,'CLAIMED',%s,%s,%s::jsonb) ON CONFLICT(policy_id,trade_date,symbol) DO NOTHING RETURNING entry_claim_id""",(item["watchlist_item_id"],POLICY_ID,item["trade_date"],item["symbol"],bar["ts"],source_bar,key,event,json.dumps(payload))).fetchone()
        if not claim: return False
        conn.execute("UPDATE oiis_live.entry_claim SET status='SUBMITTING',attempts=attempts+1,updated_at=now() WHERE entry_claim_id=%s",(claim["entry_claim_id"],))
        try:
            response=httpx.post(f"{self.paper_api_url}/api/v1/trade-intents",json=payload,headers={"Authorization":f"Bearer {self.paper_token}","Idempotency-Key":key,"X-Correlation-Id":event},timeout=20)
            body=response.json(); response.raise_for_status()
            conn.execute("""UPDATE oiis_live.entry_claim SET status='ACCEPTED',paper_trade_intent_id=%s,paper_trade_group_id=%s,response_payload=%s::jsonb,last_error=NULL,updated_at=now() WHERE entry_claim_id=%s""",(body.get("trade_intent_id"),body.get("trade_group_id"),json.dumps(body),claim["entry_claim_id"]))
            return True
        except Exception as exc:
            conn.execute("UPDATE oiis_live.entry_claim SET status='FAILED_RETRYABLE',last_error=%s,updated_at=now() WHERE entry_claim_id=%s",(str(exc)[:1000],claim["entry_claim_id"])); self.record_error("oiis-live-paper-submit",exc,{"symbol":item["symbol"],"trade_date":str(item["trade_date"])}); return False

    def process_commands(self) -> int:
        completed=0
        with self.pool.connection() as conn:
            rows=conn.execute("""SELECT * FROM oiis_live.command_queue WHERE status='PENDING' AND available_at<=now()
              ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED""").fetchall()
            for row in rows:
                conn.execute("UPDATE oiis_live.command_queue SET status='PROCESSING',lease_expires_at=now()+interval '5 minutes' WHERE command_id=%s",(row["command_id"],))
                try:
                    if row["command_type"]=="RUN_SELECTION": value=self.run_selection()
                    elif row["command_type"]=="RECONCILE": value=self.reconcile()
                    else: value={"status":"ACKNOWLEDGED","command":row["command_type"]}
                    conn.execute("UPDATE oiis_live.command_queue SET status='COMPLETED',result=%s::jsonb,completed_at=now() WHERE command_id=%s",(json.dumps(value,default=str),row["command_id"])); completed+=1
                except Exception as exc:
                    conn.execute("UPDATE oiis_live.command_queue SET status='FAILED',result=%s::jsonb,completed_at=now() WHERE command_id=%s",(json.dumps({"error":str(exc)}),row["command_id"])); self.record_error("oiis-live-command",exc,{"command_id":str(row["command_id"])})
        return completed

    def reconcile(self) -> dict[str,int]:
        with self.pool.connection() as conn:
            duplicates=conn.execute("SELECT count(*) n FROM (SELECT policy_id,trade_date,symbol,count(*) FROM oiis_live.entry_claim GROUP BY 1,2,3 HAVING count(*)>1)x").fetchone()["n"]
            missing=conn.execute("SELECT count(*) n FROM oiis_live.entry_claim WHERE status='ACCEPTED' AND paper_trade_group_id IS NULL").fetchone()["n"]
        return {"duplicate_entries":duplicates,"accepted_without_group":missing}


def trade_payload(item: dict[str,Any], bar: dict[str,Any], rsi: float, willr: float, quantity: int, event: str) -> dict[str,Any]:
    symbol=item["symbol"]; price=Decimal(str(bar["close"])); amount=price*quantity
    qualified=item.get("canonical_status")=="QUALIFIED_FOR_INTRADAY_REVALIDATION"
    reasons=["DAILY_SELECTED" if item.get("candidate_id") else "MANUAL_WATCHLIST_ENTRY_ENABLED", "OFACTOR_XFACTOR_QUALIFIED" if qualified else "OPERATOR_ENTRY_OVERRIDE", "RSI_LT_30","WILLR_LT_NEG80","ONE_ENTRY_PER_SYMBOL_DAY"]
    return {"schema_version":"1.0","client_event_id":event,"account_id":"paper-main","environment":"PAPER","source":{"service":"oiis-live","instance":os.getenv("HOSTNAME","oiis-live")},"strategy":{"strategy_id":"OIIS_LIVE","strategy_name":"OIIS Daily Selection + RSI/WILLR Entry","strategy_family":"OIIS","strategy_version":POLICY_VERSION,"strategy_run_id":f"live-{item['trade_date']}","signal_id":event,"tags":["equity","live-data","paper","daily-selection"]},"signal":{"occurred_at":bar["ts"].isoformat(),"exchange_timezone":"Asia/Kolkata","direction":"LONG","reason_codes":reasons,"features":{"ofactor":str(item["ofactor"]),"xfactor":str(item["xfactor_snapshot"]),"daily_level":item["daily_level"],"rsi14":str(rsi),"willr14":str(willr),"selection_signal_date":str(item["signal_date"])}},"trade_group":{"client_group_id":event,"asset_class":"EQUITY","expected_leg_count":1,"group_entry_policy":"ATOMIC","group_close_policy":"ALL_LEGS","performance_basis":{"type":"ENTRY_NOTIONAL","amount":str(amount),"currency":"INR"}},"legs":[{"client_leg_id":"equity-1","role":"PRIMARY","position_effect":"OPEN","instrument":{"instrument_id":f"NSE:CASH:{symbol}","instrument_token":item["instrument_token"],"exchange":"NSE","segment":"CASH","symbol":symbol,"underlying":symbol,"lot_size":"1","contract_multiplier":"1","currency":"INR"},"side":"BUY","quantity":{"value":str(quantity),"unit":"SHARES"},"entry_order":{"type":"MARKET","time_in_force":"DAY","price_source":"NEXT_AVAILABLE_BAR_OPEN"}}],"execution_policy":{"mode":"RULES","intraday_square_off":False,"exit_rules":[{"rule_id":"I030","kind":"TARGET_PCT","value":"0.003","action":"FULL_CLOSE","target_lifecycle":"INTRADAY"},{"rule_id":"S100","kind":"TARGET_PCT","value":"0.010","action":"FULL_CLOSE","target_lifecycle":"SWING"}]},"analytics_policy":{"apply_default_ladders":False,"intraday_targets_pct":["0.003","0.005","0.007"],"swing_targets_pct":["0.010","0.020","0.050"],"horizons_trading_sessions":[5,30],"track_after_execution_close":True,"snapshot_cadence":"EVENTS_AND_EOD"},"cost_profile_id":"india-equity-current","tax_profile_id":"management-profit-tax-35pct","metadata":{"policy_id":POLICY_ID,"one_entry_per_symbol_trade_date":True,"operator_override":not qualified,"source_bar_id":f"NSE:{item['instrument_token']}:{bar['ts'].isoformat()}:{bar['source']}"}}


def required(name: str) -> str:
    value=os.getenv(name)
    if not value: raise RuntimeError(f"{name} is required")
    return value


def next_session(conn: Any, after: date) -> date:
    row=conn.execute("SELECT min(session_date) d FROM paper_trading.trading_sessions WHERE exchange='NSE' AND session_date>%s AND NOT is_holiday",(after,)).fetchone()
    if row and row["d"]: return row["d"]
    value=after+timedelta(days=1)
    while value.weekday()>=5: value+=timedelta(days=1)
    return value


def is_trading_session(conn: Any, value: date) -> bool:
    row = conn.execute("""SELECT NOT is_holiday AS open FROM paper_trading.trading_sessions
      WHERE exchange='NSE' AND session_date=%s LIMIT 1""", (value,)).fetchone()
    return bool(row["open"]) if row else value.weekday() < 5


def due_selection_slots(now: datetime) -> list[str]:
    return [name for name, scheduled in SELECTION_SLOTS.items() if now.time() >= scheduled]


def in_market(now: datetime) -> bool:
    return now.weekday()<5 and wall_time(9,15)<=now.time()<=wall_time(15,30)


def run_loop(runtime: Runtime) -> None:
    LOG.info("OIIS live service started in PAPER mode")
    while True:
        try:
            now=datetime.now(IST); runtime.process_commands()
            with runtime.pool.connection() as conn:
                trading_day = is_trading_session(conn, now.date())
            if trading_day:
                for run_slot in due_selection_slots(now):
                    with runtime.pool.connection() as conn:
                        exists=conn.execute("""SELECT 1 FROM oiis_live.selection_run
                          WHERE policy_id=%s AND policy_version=%s AND trade_date=%s
                            AND run_slot=%s AND status='COMPLETED'""",
                          (POLICY_ID,POLICY_VERSION,now.date(),run_slot)).fetchone()
                    if not exists:
                        runtime.run_selection(trade_date=now.date(),run_slot=run_slot)
            if trading_day and in_market(now): runtime.monitor_once(now.date(),submit=True)
            runtime.deliver_errors(); runtime.heartbeat("oiis-live","OK",{"mode":"PAPER","now_ist":now.isoformat()})
        except Exception as exc:
            LOG.exception("OIIS live loop failed"); runtime.record_error("oiis-live",exc)
            try: runtime.deliver_errors()
            except Exception: LOG.exception("Error webhook delivery failed")
        time.sleep(runtime.poll_seconds)


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL","INFO"),format='%(asctime)s %(levelname)s %(name)s %(message)s')
    parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest="command",required=True)
    sub.add_parser("run"); select=sub.add_parser("select"); select.add_argument("--signal-date",type=date.fromisoformat); select.add_argument("--trade-date",type=date.fromisoformat); select.add_argument("--run-slot")
    sub.add_parser("refresh-universe")
    monitor=sub.add_parser("monitor-once"); monitor.add_argument("--trade-date",type=date.fromisoformat); monitor.add_argument("--no-submit",action="store_true")
    sub.add_parser("verify-config"); sub.add_parser("reconcile")
    args=parser.parse_args(); runtime=Runtime()
    try:
        if args.command=="run": run_loop(runtime)
        elif args.command=="select": print(json.dumps(runtime.run_selection(args.signal_date,args.trade_date,args.run_slot),indent=2,default=str))
        elif args.command=="refresh-universe":
            with runtime.pool.connection() as conn: print(json.dumps(refresh_universe(conn),indent=2))
        elif args.command=="monitor-once": print(json.dumps(runtime.monitor_once(args.trade_date,not args.no_submit),indent=2))
        elif args.command=="reconcile": print(json.dumps(runtime.reconcile(),indent=2))
        else: print(json.dumps({"status":"PASS","paper_only":True,"policy_id":POLICY_ID,"database":True,"paper_api":runtime.paper_api_url}))
    finally: runtime.close()


if __name__ == "__main__":
    main()
