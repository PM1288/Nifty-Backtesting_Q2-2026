from __future__ import annotations

import argparse
import hashlib
import json
import logging
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

from .policy import intraday_entry_eligible, price_momentum_entry_evaluation, wilder_rsi, williams_r
from .selector import evaluate_latest, refresh_universe, result_hash

LOG = logging.getLogger("oiis-live")
IST = ZoneInfo("Asia/Kolkata")
POLICY_ID = "OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0"
POLICY_VERSION = "3.9"
ENTRY_METHOD_RSI_WILLR = "RSI_WILLR"
ENTRY_METHOD_PRICE_MOMENTUM = "PRICE_MOMENTUM_1D_1H_15M"
ENTRY_METHODS = (ENTRY_METHOD_RSI_WILLR, ENTRY_METHOD_PRICE_MOMENTUM)
SELECTION_SLOTS = {
    "OPEN_0930": wall_time(9, 30),
    "INTRADAY_1000": wall_time(10, 0),
    "INTRADAY_1030": wall_time(10, 30),
    "INTRADAY_1100": wall_time(11, 0),
    "INTRADAY_1130": wall_time(11, 30),
    "INTRADAY_1200": wall_time(12, 0),
    "INTRADAY_1230": wall_time(12, 30),
    "INTRADAY_1300": wall_time(13, 0),
    "INTRADAY_1330": wall_time(13, 30),
    "INTRADAY_1400": wall_time(14, 0),
    "INTRADAY_1430": wall_time(14, 30),
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
        self.universe_mode = str(self.policy.get("universe", "ALL_FNO"))
        self.pool = ConnectionPool(self.database_url, min_size=1, max_size=4, kwargs={"row_factory": dict_row})
        config_hash = hashlib.sha256(json.dumps(self.policy,sort_keys=True,separators=(",", ":")).encode()).hexdigest()
        with self.pool.connection() as conn:
            conn.execute("""INSERT INTO oiis_live.policy_version(policy_id,version,status,config,config_hash)
              VALUES (%s,%s,'PAPER',%s::jsonb,%s)
              ON CONFLICT(policy_id,version) DO NOTHING""",
              (POLICY_ID,POLICY_VERSION,json.dumps(self.policy),config_hash))
            stored=conn.execute("SELECT config_hash FROM oiis_live.policy_version WHERE policy_id=%s AND version=%s",(POLICY_ID,POLICY_VERSION)).fetchone()
            if not stored or stored["config_hash"] != config_hash:
                raise RuntimeError("immutable OIIS policy version hash mismatch")

    def close(self) -> None:
        self.pool.close()

    def expire_prior_watchlists(self, current_trade_date: date) -> int:
        """Close every earlier daily selection while retaining its audit history."""
        with self.pool.connection() as conn:
            changed = expire_prior_watchlist_rows(conn, current_trade_date)
        if changed:
            LOG.info(
                "Expired %s OIIS watchlist rows before trade date %s",
                changed,
                current_trade_date,
            )
        return changed

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

    def run_selection(
        self,
        signal_date: date | None = None,
        trade_date: date | None = None,
        run_slot: str | None = None,
        decision_as_of: datetime | None = None,
    ) -> dict[str, Any]:
        today_ist = datetime.now(IST).date()
        if trade_date is None or trade_date == today_ist:
            self.expire_prior_watchlists(today_ist)
        with self.pool.connection() as conn:
            universe_counts = refresh_universe(conn, self.universe_mode)
            if trade_date is None and signal_date is None:
                row=conn.execute("""SELECT greatest(
                  coalesce((SELECT max(trade_date) FROM nse.fact_eod_prices),date '1900-01-01'),
                  coalesce((SELECT max(trade_date) FROM strategy_eval.stock_daily_regime),date '1900-01-01')) signal_date""").fetchone()
                signal_date=row["signal_date"]
            trade_date=trade_date or next_session(conn,signal_date)
            run_slot = run_slot or f"MANUAL_{datetime.now(IST).strftime('%H%M%S')}"
            execution_timestamp = datetime.now(IST)
            decision_as_of = resolve_decision_as_of(trade_date,run_slot,execution_timestamp,decision_as_of)
            if signal_date is None:
                signal_date=conn.execute("""SELECT greatest(
                  coalesce((SELECT max(trade_date) FROM nse.fact_eod_prices WHERE trade_date<%s),date '1900-01-01'),
                  coalesce((SELECT max(trade_date) FROM strategy_eval.stock_daily_regime WHERE trade_date<%s),date '1900-01-01')) signal_date""",(trade_date,trade_date)).fetchone()["signal_date"]
            source=conn.execute("""SELECT max(trade_date) FILTER (WHERE trade_date<=%s) eod,
              (SELECT max(ts) FROM public.bars_1m WHERE ts<=%s) minute_ts
              FROM nse.fact_eod_prices""",(signal_date,decision_as_of)).fetchone()
            previous=conn.execute("""SELECT run_id FROM oiis_live.selection_run
              WHERE policy_id=%s AND trade_date=%s AND requested_universe=%s
                AND status='COMPLETED' AND decision_as_of<%s
              ORDER BY decision_as_of DESC,completed_at DESC NULLS LAST LIMIT 1""",
              (POLICY_ID,trade_date,self.universe_mode,decision_as_of)).fetchone()
            auto_config=self.policy.get("auto_paper_entry",{})
            auto_threshold=Decimal(str(auto_config.get("quality_sum_threshold",185)))
            run=conn.execute("""INSERT INTO oiis_live.selection_run(policy_id,policy_version,signal_date,trade_date,run_slot,as_of_ts,decision_as_of,execution_timestamp,requested_universe,universe_counts,status,source_max_eod_date,source_max_minute_ts)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,'RUNNING',%s,%s)
              ON CONFLICT(policy_id,policy_version,signal_date,trade_date,run_slot) DO UPDATE SET status='RUNNING',as_of_ts=excluded.as_of_ts,decision_as_of=excluded.decision_as_of,execution_timestamp=excluded.execution_timestamp,requested_universe=excluded.requested_universe,universe_counts=excluded.universe_counts,error_detail=NULL,started_at=now(),completed_at=NULL
              RETURNING run_id""",(
                POLICY_ID,POLICY_VERSION,signal_date,trade_date,run_slot,
                decision_as_of,decision_as_of,execution_timestamp,self.universe_mode,json.dumps(universe_counts),
                source["eod"],source["minute_ts"],
              )).fetchone()
            conn.execute("""UPDATE oiis_live.selection_run
              SET previous_run_id=%s,auto_paper_threshold=%s,auto_paper_status='NOT_EVALUATED'
              WHERE run_id=%s""",(previous["run_id"] if previous else None,auto_threshold,run["run_id"]))
            rows=evaluate_latest(conn,signal_date,decision_as_of)
            conn.execute("""UPDATE oiis_live.watchlist_item SET active=false,entry_enabled=false,updated_at=now()
              WHERE policy_id=%s AND trade_date=%s AND source='DAILY_SELECTION'
                AND NOT EXISTS (SELECT 1 FROM oiis_live.entry_claim e WHERE e.watchlist_item_id=oiis_live.watchlist_item.watchlist_item_id)""",(POLICY_ID,trade_date))
            selected=qualified=0
            for item in rows:
                selected+=int(item["selected"]); qualified+=int(item["canonical_status"]=="QUALIFIED_FOR_INTRADAY_REVALIDATION")
                reference_price = item["reference_price"]
                no_chase_price = reference_price * 1.01 if reference_price is not None else None
                candidate=conn.execute("""INSERT INTO oiis_live.daily_candidate(run_id,policy_id,policy_version,signal_date,trade_date,symbol,instrument_token,sector,direction,structural_direction,session_direction,direction_state,session_direction_score,daily_level,ofactor_level,directional_edge_level,extension_level,volume_level,canonical_status,selected,rank,opportunity_rank,execution_rank,data_quality,data_permission,data_coverage,ofactor,xfactor_snapshot,directional_edge,rsi14,willr14,ema61,macd_line,atr14,volume_vs_sma20,volume_percentile_90,reference_price,buy_limit,no_chase_price,failed_gate_count,blocking_gate_count,recommended,recommendation_rank,setup_id,setup_state,component_scores,market_context,condition_results,reason_codes,feature_values,gate_evidence,universe_flags,evidence,observed_at,available_at)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s)
                  ON CONFLICT(run_id,symbol) DO UPDATE SET direction=excluded.direction,structural_direction=excluded.structural_direction,session_direction=excluded.session_direction,direction_state=excluded.direction_state,session_direction_score=excluded.session_direction_score,daily_level=excluded.daily_level,canonical_status=excluded.canonical_status,selected=excluded.selected,rank=excluded.rank,opportunity_rank=excluded.opportunity_rank,execution_rank=excluded.execution_rank,data_quality=excluded.data_quality,data_permission=excluded.data_permission,data_coverage=excluded.data_coverage,ofactor=excluded.ofactor,xfactor_snapshot=excluded.xfactor_snapshot,directional_edge=excluded.directional_edge,recommended=excluded.recommended,recommendation_rank=excluded.recommendation_rank,setup_id=excluded.setup_id,setup_state=excluded.setup_state,component_scores=excluded.component_scores,condition_results=excluded.condition_results,reason_codes=excluded.reason_codes,feature_values=excluded.feature_values,gate_evidence=excluded.gate_evidence,evidence=excluded.evidence,observed_at=excluded.observed_at,available_at=excluded.available_at
                  RETURNING candidate_id""",
                  (run["run_id"],POLICY_ID,POLICY_VERSION,signal_date,trade_date,item["symbol"],item["instrument_token"],item["sector"],item["direction"],item["structural_direction"],item["session_direction"],item["direction_state"],item["session_direction_score"],item["daily_level"],item["ofactor_level"],item["directional_edge_level"],item["extension_level"],item["volume_level"],item["canonical_status"],item["selected"],item["rank"],item["opportunity_rank"],item["execution_rank"],item["data_quality"],item["data_permission"],item["data_coverage"],item["ofactor"],item["xfactor"],item["directional_edge"],item["rsi14"],item["willr14"],item["ema61"],item["macd_line"],item["atr14"],item["volume_vs_sma20"],item["volume_percentile_90"],reference_price,reference_price,no_chase_price,item["failed_gate_count"],item["blocking_gate_count"],item["recommended"],item["recommendation_rank"],item["setup_id"],item["setup_state"],json.dumps(item["component_scores"]),json.dumps(item["market_context"]),json.dumps(item["conditions"]),json.dumps(item["reason_codes"]),json.dumps(item["feature_values"],default=str),json.dumps(item["gate_evidence"],default=str),json.dumps(item["universe_flags"],default=str),json.dumps(item["evidence"],default=str),decision_as_of,execution_timestamp)).fetchone()
                score=quality_sum(item)
                conn.execute("""UPDATE oiis_live.daily_candidate SET quality_score=%s,
                  auto_paper_eligible=%s WHERE candidate_id=%s""",
                  (score,score is not None and score>auto_threshold,candidate["candidate_id"]))
                if item["recommended"]:
                    conn.execute("""INSERT INTO oiis_live.watchlist_item(candidate_id,policy_id,trade_date,symbol,instrument_token,source,active,entry_enabled,daily_level,canonical_status,rank,buy_limit,no_chase_price)
                      VALUES (%s,%s,%s,%s,%s,'DAILY_SELECTION',true,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(policy_id,trade_date,symbol) DO UPDATE SET candidate_id=excluded.candidate_id,
                        instrument_token=excluded.instrument_token,active=true,entry_enabled=excluded.entry_enabled,
                        daily_level=excluded.daily_level,canonical_status=excluded.canonical_status,rank=excluded.rank,
                        buy_limit=excluded.buy_limit,no_chase_price=excluded.no_chase_price,updated_at=now()""",
                      (candidate["candidate_id"],POLICY_ID,trade_date,item["symbol"],item["instrument_token"],item["selected"],item["daily_level"],item["canonical_status"],item["recommendation_rank"],reference_price,no_chase_price))
            self.record_run_changes(conn,run["run_id"],previous["run_id"] if previous else None,trade_date,auto_threshold)
            auto_paper=self.auto_paper_top_candidate(conn,run["run_id"],trade_date,run_slot,decision_as_of,execution_timestamp,auto_threshold)
            digest=result_hash(rows)
            conn.execute("""UPDATE oiis_live.selection_run SET status='COMPLETED',requested_symbols=%s,evaluated_symbols=%s,selected_symbols=%s,qualified_symbols=%s,completed_at=now(),result_hash=%s WHERE run_id=%s""",(len(rows),len(rows),selected,qualified,digest,run["run_id"]))
            result={"run_id":str(run["run_id"]),"run_slot":run_slot,"signal_date":str(signal_date),"trade_date":str(trade_date),"decision_as_of":decision_as_of.isoformat(),"execution_timestamp":execution_timestamp.isoformat(),"requested_universe":self.universe_mode,"universe":universe_counts,"evaluated":len(rows),"selected":selected,"recommended":sum(int(item["recommended"]) for item in rows),"qualified":qualified,"auto_paper":auto_paper,"result_hash":digest}
            self.heartbeat("oiis-live-selector","OK",result)
            return result

    def record_run_changes(self, conn: Any, run_id: Any, previous_run_id: Any, trade_date: date, threshold: Decimal) -> None:
        conn.execute("DELETE FROM oiis_live.candidate_run_change WHERE run_id=%s",(run_id,))
        conn.execute("""INSERT INTO oiis_live.candidate_run_change(
          run_id,previous_run_id,candidate_id,trade_date,symbol,direction,previous_direction,
          ofactor,previous_ofactor,ofactor_delta,xfactor,previous_xfactor,xfactor_delta,
          data_quality,previous_data_quality,data_quality_delta,quality_score,previous_quality_score,
          quality_score_delta,opportunity_rank,previous_opportunity_rank,change_kind,crossed_above_threshold)
        SELECT c.run_id,%s,c.candidate_id,%s,c.symbol,c.direction,p.direction,
          c.ofactor,p.ofactor,c.ofactor-p.ofactor,c.xfactor_snapshot,p.xfactor_snapshot,
          c.xfactor_snapshot-p.xfactor_snapshot,c.data_quality,p.data_quality,
          c.data_quality-p.data_quality,c.quality_score,p.quality_score,c.quality_score-p.quality_score,
          c.opportunity_rank,p.opportunity_rank,
          CASE WHEN p.candidate_id IS NULL THEN 'NEW'
               WHEN c.quality_score>p.quality_score THEN 'IMPROVED'
               WHEN c.quality_score<p.quality_score THEN 'DECLINED' ELSE 'UNCHANGED' END,
          c.quality_score>%s AND coalesce(p.quality_score,0)<=%s
        FROM oiis_live.daily_candidate c
        LEFT JOIN oiis_live.daily_candidate p ON p.run_id=%s AND p.symbol=c.symbol
        WHERE c.run_id=%s""",(previous_run_id,trade_date,threshold,threshold,previous_run_id,run_id))

    def auto_paper_top_candidate(self, conn: Any, run_id: Any, trade_date: date, run_slot: str,
                                 decision_as_of: datetime, execution_timestamp: datetime,
                                 threshold: Decimal) -> dict[str,Any]:
        config=self.policy.get("auto_paper_entry",{})
        top=conn.execute("""SELECT * FROM oiis_live.daily_candidate WHERE run_id=%s
          AND auto_paper_eligible AND direction IN ('LONG','SHORT') AND instrument_token IS NOT NULL
          AND reference_price>0 ORDER BY quality_score DESC,opportunity_rank NULLS LAST,symbol LIMIT 1""",(run_id,)).fetchone()
        eligible=conn.execute("SELECT count(*) n FROM oiis_live.daily_candidate WHERE run_id=%s AND auto_paper_eligible",(run_id,)).fetchone()["n"]
        status="BELOW_THRESHOLD" if not top else "INELIGIBLE"
        submitted=0
        if top:
            conn.execute("UPDATE oiis_live.daily_candidate SET auto_paper_selected=true WHERE candidate_id=%s",(top["candidate_id"],))
            conn.execute("UPDATE oiis_live.candidate_run_change SET auto_paper_selected=true WHERE run_id=%s AND symbol=%s",(run_id,top["symbol"]))
            conn.execute("""INSERT INTO oiis_live.watchlist_item(candidate_id,policy_id,trade_date,symbol,instrument_token,source,active,entry_enabled,daily_level,canonical_status,rank,buy_limit,no_chase_price)
              VALUES (%s,%s,%s,%s,%s,'DAILY_SELECTION',true,true,%s,%s,1,%s,%s)
              ON CONFLICT(policy_id,trade_date,symbol) DO UPDATE SET candidate_id=excluded.candidate_id,
                instrument_token=excluded.instrument_token,active=true,entry_enabled=true,rank=1,
                daily_level=excluded.daily_level,canonical_status=excluded.canonical_status,
                buy_limit=excluded.buy_limit,no_chase_price=excluded.no_chase_price,updated_at=now()""",
              (top["candidate_id"],POLICY_ID,trade_date,top["symbol"],top["instrument_token"],top["daily_level"],top["canonical_status"],top["reference_price"],Decimal(str(top["reference_price"]))*Decimal("1.01")))
            scheduled_ok=not config.get("scheduled_slots_only",True) or run_slot in SELECTION_SLOTS
            age=abs((execution_timestamp-decision_as_of).total_seconds())/60
            fresh=trade_date==datetime.now(IST).date() and age<=float(config.get("maximum_signal_age_minutes",10))
            if not config.get("enabled",False) or not scheduled_ok:
                status="INELIGIBLE"
            elif not fresh:
                status="STALE"
            else:
                bar=conn.execute("""SELECT ts,open,high,low,close,volume,source FROM public.bars_1m
                  WHERE exchange='NSE' AND symbol_token=%s AND ts<=%s
                  ORDER BY ts DESC LIMIT 1""",(top["instrument_token"],decision_as_of)).fetchone()
                if bar and bar["ts"]>=decision_as_of-timedelta(minutes=10):
                    # Candidate selection and entry timing are separate decisions.
                    # Both entry methods are evaluated by monitor_once and create
                    # independent paper observations when they qualify.
                    status="MONITORING"
                else:
                    status="INELIGIBLE"
        conn.execute("""UPDATE oiis_live.selection_run SET auto_paper_candidate_id=%s,
          auto_paper_status=%s,auto_paper_eligible_symbols=%s,auto_paper_submitted_symbols=%s
          WHERE run_id=%s""",(top["candidate_id"] if top else None,status,eligible,submitted,run_id))
        return {"status":status,"threshold":str(threshold),"eligible":eligible,"submitted":submitted,
                "symbol":top["symbol"] if top else None,"quality_score":str(top["quality_score"]) if top else None}

    def monitor_once(self, trade_date: date | None = None, submit: bool = True) -> dict[str, Any]:
        trade_date=trade_date or datetime.now(IST).date()
        result={"watchlist":0,"evaluated":0,"eligible":0,"submitted":0,
                "method_submitted":{method:0 for method in ENTRY_METHODS}}
        with self.pool.connection() as conn:
            rows=conn.execute("""SELECT * FROM oiis_live.v_current_watchlist WHERE trade_date=%s AND active AND entry_enabled
              AND instrument_token IS NOT NULL ORDER BY rank NULLS LAST,symbol""",(trade_date,)).fetchall()
            result["watchlist"]=len(rows)
            for item in rows:
                statuses=dict(item.get("entry_method_statuses") or {})
                pending=[method for method in ENTRY_METHODS
                  if statuses.get(method) not in {"CLAIMED","SUBMITTING","ACCEPTED","FILLED","REJECTED"}]
                if not pending:
                    continue
                session_open=datetime.combine(trade_date,wall_time(9,15),tzinfo=IST)
                session_end=datetime.combine(trade_date,wall_time(15,31),tzinfo=IST)
                bars=conn.execute("""SELECT ts,open,high,low,close,volume,source FROM public.bars_1m
                  WHERE exchange='NSE' AND symbol_token=%s AND ts>=%s AND ts<%s
                  ORDER BY ts""",(item["instrument_token"],session_open,session_end)).fetchall()
                if len(bars)<15:
                    continue
                previous_daily=conn.execute("""SELECT close_price FROM nse.fact_eod_prices
                  WHERE upper(symbol)=upper(%s) AND series='EQ' AND trade_date<%s AND close_price>0
                  ORDER BY trade_date DESC LIMIT 1""",(item["symbol"],trade_date)).fetchone()
                previous_close=float(previous_daily["close_price"]) if previous_daily else None
                highs=[float(value["high"]) for value in bars]
                lows=[float(value["low"]) for value in bars]
                closes=[float(value["close"]) for value in bars]
                for index in range(14,len(bars)):
                    bar=bars[index]
                    source_bar=f"NSE:{item['instrument_token']}:{bar['ts'].isoformat()}:{bar['source']}"
                    if ENTRY_METHOD_RSI_WILLR in pending:
                        exists=conn.execute("""SELECT 1 FROM oiis_live.intraday_evaluation
                          WHERE watchlist_item_id=%s AND source_bar_id=%s AND entry_method=%s""",
                          (item["watchlist_item_id"],source_bar,ENTRY_METHOD_RSI_WILLR)).fetchone()
                        if not exists:
                            rsi=wilder_rsi(closes[:index+1])
                            willr=williams_r(highs[:index+1],lows[:index+1],closes[:index+1])
                            eligible=intraday_entry_eligible(rsi,willr,float(item["rsi_max"]),float(item["willr_max"]))
                            conn.execute("""INSERT INTO oiis_live.intraday_evaluation
                              (watchlist_item_id,bar_ts,source_bar_id,entry_method,close_price,rsi14,willr14,
                               rsi_pass,willr_pass,price_limit_pass,eligible,decision,detail)
                              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s,%s::jsonb)""",
                              (item["watchlist_item_id"],bar["ts"],source_bar,ENTRY_METHOD_RSI_WILLR,
                               bar["close"],rsi,willr,rsi is not None and rsi<float(item["rsi_max"]),
                               willr is not None and willr<float(item["willr_max"]),eligible,
                               "ENTRY_CLAIMED" if eligible else "WAIT_INDICATORS",
                               json.dumps({"one_entry_per_symbol_day_per_method":True})))
                            result["evaluated"]+=1
                            if eligible:
                                result["eligible"]+=1
                                if submit and self.claim_and_submit(conn,item,bar,rsi,willr,source_bar,
                                  ENTRY_METHOD_RSI_WILLR)=="SUBMITTED":
                                    result["submitted"]+=1
                                    result["method_submitted"][ENTRY_METHOD_RSI_WILLR]+=1
                                pending.remove(ENTRY_METHOD_RSI_WILLR)
                    if (ENTRY_METHOD_PRICE_MOMENTUM in pending
                        and str(item.get("direction") or "LONG").upper()=="LONG"):
                        exists=conn.execute("""SELECT 1 FROM oiis_live.intraday_evaluation
                          WHERE watchlist_item_id=%s AND source_bar_id=%s AND entry_method=%s""",
                          (item["watchlist_item_id"],source_bar,ENTRY_METHOD_PRICE_MOMENTUM)).fetchone()
                        if not exists:
                            momentum=price_momentum_entry_evaluation(bars[:index+1],previous_close)
                            checks=momentum.get("checks") or {}
                            eligible=bool(momentum.get("eligible"))
                            conn.execute("""INSERT INTO oiis_live.intraday_evaluation
                              (watchlist_item_id,bar_ts,source_bar_id,entry_method,close_price,rsi_pass,willr_pass,
                               price_limit_pass,eligible,decision,detail,previous_daily_close,current_hour_close,
                               previous_hour_close,current_15m_close,previous_15m_close,daily_price_pass,
                               hourly_price_pass,fifteen_minute_price_pass)
                              VALUES (%s,%s,%s,%s,%s,false,false,true,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s)""",
                              (item["watchlist_item_id"],bar["ts"],source_bar,ENTRY_METHOD_PRICE_MOMENTUM,
                               bar["close"],eligible,"ENTRY_CLAIMED" if eligible else momentum.get("state","WAIT_DATA"),
                               json.dumps(momentum,default=str),momentum.get("previous_daily_close"),
                               momentum.get("current_hour_close"),momentum.get("previous_hour_close"),
                               momentum.get("current_15m_close"),momentum.get("previous_15m_close"),
                               checks.get("current_above_previous_daily_close"),checks.get("current_hour_above_previous_hour"),
                               checks.get("current_15m_above_previous_15m")))
                            result["evaluated"]+=1
                            if eligible:
                                result["eligible"]+=1
                                if submit and self.claim_and_submit(conn,item,bar,None,None,source_bar,
                                  ENTRY_METHOD_PRICE_MOMENTUM,entry_evidence=momentum)=="SUBMITTED":
                                    result["submitted"]+=1
                                    result["method_submitted"][ENTRY_METHOD_PRICE_MOMENTUM]+=1
                                pending.remove(ENTRY_METHOD_PRICE_MOMENTUM)
                    if not pending:
                        break
        self.heartbeat("oiis-live-monitor","OK",result)
        return result

    def claim_and_submit(self, conn: Any, item: dict[str,Any], bar: dict[str,Any], rsi: float | None, willr: float | None, source_bar: str,
                         entry_rule: str="RSI_WILLR", run_id: str | None=None, run_slot: str | None=None,
                         quality_score: Any=None, threshold: Any=None,
                         entry_evidence: dict[str,Any] | None=None) -> str:
        method_slug=entry_rule.lower().replace("_","-")
        key=f"oiis-live:{item['trade_date']}:{item['symbol']}:{method_slug}"
        event=f"oiis-{item['trade_date']}-{item['symbol']}-{method_slug}".lower()
        lot_size=resolve_fno_lot_size(conn,str(item["symbol"]),item["trade_date"])
        payload=trade_payload(item,bar,rsi,willr,lot_size,event,entry_rule,run_id,run_slot,quality_score,threshold,entry_evidence)
        claim=conn.execute("""INSERT INTO oiis_live.entry_claim(watchlist_item_id,policy_id,trade_date,symbol,entry_method,signal_ts,source_bar_id,status,idempotency_key,client_event_id,request_payload)
          VALUES (%s,%s,%s,%s,%s,%s,%s,'CLAIMED',%s,%s,%s::jsonb)
          ON CONFLICT(policy_id,trade_date,symbol,entry_method) DO NOTHING RETURNING entry_claim_id""",
          (item["watchlist_item_id"],POLICY_ID,item["trade_date"],item["symbol"],entry_rule,bar["ts"],source_bar,key,event,json.dumps(payload))).fetchone()
        if not claim:
            claim=conn.execute("""SELECT entry_claim_id,status FROM oiis_live.entry_claim
              WHERE policy_id=%s AND trade_date=%s AND symbol=%s AND entry_method=%s""",
              (POLICY_ID,item["trade_date"],item["symbol"],entry_rule)).fetchone()
            if not claim or claim["status"]!="FAILED_RETRYABLE": return "DUPLICATE"
        conn.execute("""UPDATE oiis_live.entry_claim SET status='SUBMITTING',attempts=attempts+1,
          signal_ts=%s,source_bar_id=%s,request_payload=%s::jsonb,last_error=NULL,updated_at=now()
          WHERE entry_claim_id=%s""",(bar["ts"],source_bar,json.dumps(payload),claim["entry_claim_id"]))
        try:
            correlation=str(uuid.uuid5(uuid.NAMESPACE_URL,event))
            response=httpx.post(f"{self.paper_api_url}/api/v1/trade-intents",json=payload,headers={"Authorization":f"Bearer {self.paper_token}","Idempotency-Key":key,"X-Correlation-Id":correlation},timeout=20)
            body=response.json(); response.raise_for_status()
            conn.execute("""UPDATE oiis_live.entry_claim SET status='ACCEPTED',paper_trade_intent_id=%s,paper_trade_group_id=%s,response_payload=%s::jsonb,last_error=NULL,updated_at=now() WHERE entry_claim_id=%s""",(body.get("trade_intent_id"),body.get("trade_group_id"),json.dumps(body),claim["entry_claim_id"]))
            return "SUBMITTED"
        except Exception as exc:
            conn.execute("UPDATE oiis_live.entry_claim SET status='FAILED_RETRYABLE',last_error=%s,updated_at=now() WHERE entry_claim_id=%s",(str(exc)[:1000],claim["entry_claim_id"])); self.record_error("oiis-live-paper-submit",exc,{"symbol":item["symbol"],"trade_date":str(item["trade_date"]),"entry_method":entry_rule}); return "FAILED"

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
            duplicates=conn.execute("SELECT count(*) n FROM (SELECT policy_id,trade_date,symbol,entry_method,count(*) FROM oiis_live.entry_claim GROUP BY 1,2,3,4 HAVING count(*)>1)x").fetchone()["n"]
            missing=conn.execute("SELECT count(*) n FROM oiis_live.entry_claim WHERE status='ACCEPTED' AND paper_trade_group_id IS NULL").fetchone()["n"]
        return {"duplicate_entries":duplicates,"accepted_without_group":missing}


def quality_sum(item: dict[str,Any]) -> Decimal | None:
    values=(item.get("ofactor"),item.get("xfactor"),item.get("data_quality"))
    if any(value is None for value in values):
        return None
    return sum((Decimal(str(value)) for value in values),Decimal("0"))


def expire_prior_watchlist_rows(conn: Any, current_trade_date: date) -> int:
    """Deactivate stale daily and manual selections without deleting evidence."""
    cursor = conn.execute(
        """UPDATE oiis_live.watchlist_item
           SET active=false,entry_enabled=false,
               updated_by='oiis-live-day-rollover',
               revision=revision+1,updated_at=now()
           WHERE trade_date < %s AND (active OR entry_enabled)""",
        (current_trade_date,),
    )
    return max(0, int(cursor.rowcount or 0))


def resolve_fno_lot_size(conn: Any, symbol: str, trade_date: date) -> int:
    row=conn.execute("""SELECT lotsize FROM public.instruments
      WHERE exchange='NFO' AND instrumenttype='FUTSTK' AND upper(name)=upper(%s)
        AND expiry>=%s AND lotsize IS NOT NULL AND lotsize>0
      ORDER BY expiry,updated_at DESC LIMIT 1""",(symbol,trade_date)).fetchone()
    if not row:
        raise RuntimeError(f"active FUTSTK lot size unavailable for {symbol} on {trade_date}")
    return int(row["lotsize"])


def trade_payload(item: dict[str,Any], bar: dict[str,Any], rsi: float | None, willr: float | None,
                  quantity: int, event: str, entry_rule: str="RSI_WILLR",
                  run_id: str | None=None, run_slot: str | None=None,
                  quality_score: Any=None, threshold: Any=None,
                  entry_evidence: dict[str,Any] | None=None) -> dict[str,Any]:
    symbol=item["symbol"]; price=Decimal(str(bar["close"])); amount=price*quantity
    qualified=item.get("canonical_status")=="QUALIFIED_FOR_INTRADAY_REVALIDATION"
    direction=item.get("direction") if item.get("direction") in {"LONG","SHORT"} else "LONG"
    auto=entry_rule=="QUALITY_SUM_THRESHOLD"
    momentum=entry_rule==ENTRY_METHOD_PRICE_MOMENTUM
    reasons=(["TOP_CANDIDATE_FOR_RUN","QUALITY_SUM_ABOVE_THRESHOLD"] if auto else
             ["DAILY_SELECTED" if item.get("candidate_id") else "MANUAL_WATCHLIST_ENTRY_ENABLED",
              "OFACTOR_XFACTOR_QUALIFIED" if qualified else "OPERATOR_ENTRY_OVERRIDE"]+
             (["CURRENT_ABOVE_PREVIOUS_CLOSE","CURRENT_1H_CLOSE_ABOVE_PREVIOUS_1H_CLOSE",
               "CURRENT_15M_CLOSE_ABOVE_PREVIOUS_15M_CLOSE"] if momentum else ["RSI_LT_30","WILLR_LT_NEG80"]))
    reasons.append("ONE_ENTRY_PER_SYMBOL_DAY_PER_METHOD")
    features={"ofactor":str(item.get("ofactor")),"xfactor":str(item.get("xfactor_snapshot")),
              "data_quality":str(item.get("data_quality")),"daily_level":item.get("daily_level"),
              "rsi14":str(rsi) if rsi is not None else None,"willr14":str(willr) if willr is not None else None,
              "quality_score":str(quality_score) if quality_score is not None else None,
              "quality_threshold":str(threshold) if threshold is not None else None,
              "selection_signal_date":str(item.get("signal_date")),"entry_evidence":entry_evidence or {}}
    strategy_name=("OIIS Run Quality Auto Paper" if auto else
      "OIIS Daily Selection + Price Momentum 1D/1H/15M Entry" if momentum else
      "OIIS Daily Selection + RSI/WILLR Entry")
    return {"schema_version":"1.0","client_event_id":event,"account_id":"paper-main","environment":"PAPER","source":{"service":"oiis-live","instance":os.getenv("HOSTNAME","oiis-live")},"strategy":{"strategy_id":"OIIS_LIVE","strategy_name":strategy_name,"strategy_family":"OIIS","strategy_version":POLICY_VERSION,"strategy_run_id":run_id or f"live-{item['trade_date']}","signal_id":event,"tags":["equity","live-data","paper","daily-selection",entry_rule.lower()]},"signal":{"occurred_at":bar["ts"].isoformat(),"exchange_timezone":"Asia/Kolkata","direction":direction,"reason_codes":reasons,"features":features},"trade_group":{"client_group_id":event,"asset_class":"EQUITY","expected_leg_count":1,"group_entry_policy":"ATOMIC","group_close_policy":"ALL_LEGS","performance_basis":{"type":"ENTRY_NOTIONAL","amount":str(amount),"currency":"INR"}},"legs":[{"client_leg_id":"equity-1","role":"PRIMARY","position_effect":"OPEN","instrument":{"instrument_id":f"NSE:CASH:{symbol}","instrument_token":item["instrument_token"],"exchange":"NSE","segment":"CASH","symbol":symbol,"underlying":symbol,"lot_size":str(quantity),"contract_multiplier":"1","currency":"INR"},"side":"BUY" if direction=="LONG" else "SELL","quantity":{"value":str(quantity),"unit":"SHARES"},"entry_order":{"type":"MARKET","time_in_force":"DAY","price_source":"NEXT_AVAILABLE_BAR_OPEN"}}],"execution_policy":{"mode":"RULES","intraday_square_off":False,"exit_rules":[{"rule_id":"I100","kind":"TARGET_PCT","value":"0.010","action":"FULL_CLOSE","target_lifecycle":"INTRADAY"},{"rule_id":"S300","kind":"TARGET_PCT","value":"0.030","action":"FULL_CLOSE","target_lifecycle":"SWING"}]},"analytics_policy":{"apply_default_ladders":False,"intraday_targets_pct":["0.003","0.004","0.005","0.010"],"swing_targets_pct":["0.010","0.030","0.050"],"horizons_trading_sessions":[5,30],"track_after_execution_close":True,"snapshot_cadence":"EVENTS_AND_EOD"},"cost_profile_id":"india-equity-current","tax_profile_id":"management-profit-tax-35pct","metadata":{"policy_id":POLICY_ID,"one_entry_per_symbol_trade_date":False,"one_entry_per_symbol_trade_date_per_method":True,"operator_override":False if auto else not qualified,"entry_rule":entry_rule,"entry_evidence":entry_evidence or {},"run_id":run_id,"run_slot":run_slot,"quality_score":str(quality_score) if quality_score is not None else None,"quality_threshold":str(threshold) if threshold is not None else None,"sizing_policy":"ONE_CURRENT_FNO_LOT","fno_lot_size":quantity,"source_bar_id":f"NSE:{item['instrument_token']}:{bar['ts'].isoformat()}:{bar['source']}"}}


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


def resolve_decision_as_of(
    trade_date: date,
    run_slot: str,
    execution_timestamp: datetime | None = None,
    requested: datetime | None = None,
) -> datetime:
    """Resolve the immutable market-information cutoff independently of execution time."""
    if requested is not None:
        value = requested if requested.tzinfo is not None else requested.replace(tzinfo=IST)
        if value.astimezone(IST).date() != trade_date:
            raise ValueError("decision_as_of must fall on trade_date in Asia/Kolkata")
        return value.astimezone(IST)
    if run_slot in SELECTION_SLOTS:
        return datetime.combine(trade_date,SELECTION_SLOTS[run_slot],tzinfo=IST)
    execution_timestamp = (execution_timestamp or datetime.now(IST)).astimezone(IST)
    if trade_date < execution_timestamp.date():
        return datetime.combine(trade_date,wall_time(15,30),tzinfo=IST)
    if trade_date > execution_timestamp.date():
        return datetime.combine(trade_date,wall_time(8,30),tzinfo=IST)
    return execution_timestamp


def due_selection_slots(now: datetime) -> list[str]:
    return [name for name, scheduled in SELECTION_SLOTS.items() if now.time() >= scheduled]


def in_market(now: datetime) -> bool:
    return now.weekday()<5 and wall_time(9,15)<=now.time()<=wall_time(15,30)


def run_loop(runtime: Runtime) -> None:
    LOG.info("OIIS live service started in PAPER mode")
    expired_for_date: date | None = None
    while True:
        try:
            now=datetime.now(IST)
            if expired_for_date != now.date():
                runtime.expire_prior_watchlists(now.date())
                expired_for_date = now.date()
            runtime.process_commands()
            with runtime.pool.connection() as conn:
                trading_day = is_trading_session(conn, now.date())
            if trading_day:
                for run_slot in due_selection_slots(now):
                    with runtime.pool.connection() as conn:
                        exists=conn.execute("""SELECT 1 FROM oiis_live.selection_run
                          WHERE policy_id=%s AND trade_date=%s
                            AND run_slot=%s AND status='COMPLETED'""",
                          (POLICY_ID,now.date(),run_slot)).fetchone()
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
    sub.add_parser("run"); select=sub.add_parser("select"); select.add_argument("--signal-date",type=date.fromisoformat); select.add_argument("--trade-date",type=date.fromisoformat); select.add_argument("--run-slot"); select.add_argument("--decision-as-of",type=datetime.fromisoformat)
    sub.add_parser("refresh-universe")
    monitor=sub.add_parser("monitor-once"); monitor.add_argument("--trade-date",type=date.fromisoformat); monitor.add_argument("--no-submit",action="store_true")
    sub.add_parser("verify-config"); sub.add_parser("reconcile")
    args=parser.parse_args(); runtime=Runtime()
    try:
        if args.command=="run": run_loop(runtime)
        elif args.command=="select": print(json.dumps(runtime.run_selection(args.signal_date,args.trade_date,args.run_slot,args.decision_as_of),indent=2,default=str))
        elif args.command=="refresh-universe":
            with runtime.pool.connection() as conn: print(json.dumps(refresh_universe(conn, runtime.universe_mode),indent=2))
        elif args.command=="monitor-once": print(json.dumps(runtime.monitor_once(args.trade_date,not args.no_submit),indent=2))
        elif args.command=="reconcile": print(json.dumps(runtime.reconcile(),indent=2))
        else: print(json.dumps({"status":"PASS","paper_only":True,"policy_id":POLICY_ID,"database":True,"paper_api":runtime.paper_api_url}))
    finally: runtime.close()


if __name__ == "__main__":
    main()
