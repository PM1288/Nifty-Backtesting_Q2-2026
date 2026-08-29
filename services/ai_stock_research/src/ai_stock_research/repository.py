from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import PROMPT_VERSION

PROVIDERS = ("CLAUDE", "QWEN", "DEEPSEEK")
OFFICIAL_OIIS_SLOTS = (
    "OPEN_0930",
    "INTRADAY_1000",
    "INTRADAY_1030",
    "INTRADAY_1100",
    "INTRADAY_1130",
    "INTRADAY_1200",
    "INTRADAY_1230",
    "INTRADAY_1300",
    "INTRADAY_1330",
    "INTRADAY_1400",
    "INTRADAY_1430",
    "AFTERNOON_1500",
)


def _json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_value(item) for item in value]
    return value


class Repository:
    def __init__(self, database_url: str) -> None:
        self.pool = ConnectionPool(
            database_url, min_size=1, max_size=6, kwargs={"row_factory": dict_row}
        )

    def close(self) -> None:
        self.pool.close()

    def register_prompt(self, prompt_text: str) -> None:
        prompt_hash = hashlib.sha256(prompt_text.encode()).hexdigest()
        with self.pool.connection() as conn:
            conn.execute(
                """INSERT INTO ai_stock_research.prompt_version(prompt_version,prompt_sha256,prompt_text)
                VALUES (%s,%s,%s) ON CONFLICT(prompt_version) DO NOTHING""",
                (PROMPT_VERSION, prompt_hash, prompt_text),
            )
            row = conn.execute(
                "SELECT prompt_sha256 FROM ai_stock_research.prompt_version WHERE prompt_version=%s",
                (PROMPT_VERSION,),
            ).fetchone()
            if not row or row["prompt_sha256"] != prompt_hash:
                raise RuntimeError("immutable AI research prompt hash mismatch")

    def _source_rows(self, conn: Any, start_date: date) -> list[dict[str, Any]]:
        oiis = conn.execute(
            """SELECT 'OIIS' source_strategy,r.run_id source_run_id,c.candidate_id source_candidate_id,
              r.run_slot source_slot,CASE WHEN r.run_slot='OPEN_0930' THEN 'MORNING_SELECTION'
                ELSE 'NEW_INTRADAY_RECOMMENDATION' END trigger_kind,
              coalesce(r.completed_at,r.decision_as_of) source_observed_at,r.trade_date,r.signal_date,
              c.symbol,p.company_name,c.instrument_token,c.direction,c.canonical_status strategy_status,
              c.ofactor,c.xfactor_snapshot xfactor,c.reference_price,c.evidence
              FROM oiis_live.selection_run r JOIN oiis_live.daily_candidate c ON c.run_id=r.run_id
              LEFT JOIN public.instrument_profiles p ON p.symbol=c.symbol
              WHERE r.status='COMPLETED' AND r.trade_date>=%s AND r.run_slot=ANY(%s)
                AND c.recommended=true
              ORDER BY r.trade_date,coalesce(r.decision_as_of,r.completed_at),c.recommendation_rank NULLS LAST,c.symbol""",
            (start_date, list(OFFICIAL_OIIS_SLOTS)),
        ).fetchall()
        oiss = conn.execute(
            """SELECT 'OISS' source_strategy,r.run_id source_run_id,c.candidate_id source_candidate_id,
              ('SCAN_'||r.scan_sequence::text) source_slot,'NEW_ACTIONABLE_SELECTION' trigger_kind,
              coalesce(r.completed_at,r.scan_timestamp) source_observed_at,r.run_date trade_date,
              oc.signal_date,c.symbol,c.company_name,oc.instrument_token,c.direction,
              c.canonical_status strategy_status,c.ofactor,c.xfactor,
              coalesce((c.entry_plan->>'entry_zone_high')::numeric,
                       (c.feature_snapshot#>>'{feature,close_price}')::numeric) reference_price,
              c.feature_snapshot evidence
              FROM oiss.run r JOIN oiss.candidate c ON c.run_id=r.run_id
              LEFT JOIN oiis_live.daily_candidate oc ON oc.candidate_id=c.source_oiis_candidate_id
              WHERE r.status='COMPLETED' AND r.run_date>=%s AND c.selected=true
              ORDER BY r.run_date,r.scan_timestamp,c.rank NULLS LAST,c.symbol""",
            (start_date,),
        ).fetchall()
        return list(oiis) + list(oiss)

    def _history(self, conn: Any, token: str | None, through: date) -> list[dict[str, Any]]:
        if not token:
            return []
        rows = conn.execute(
            """SELECT trade_date,open,high,low,close,volume,source
              FROM public.bars_1d WHERE exchange='NSE' AND symbol_token=%s AND trade_date<=%s
              ORDER BY trade_date DESC LIMIT 30""",
            (str(token), through),
        ).fetchall()
        return [_json_value(dict(row)) for row in reversed(rows)]

    def discover(
        self, start_date: date, models: dict[str, dict[str, str]]
    ) -> dict[str, int]:
        new_evaluations = 0
        new_sources = 0
        insufficient = 0
        with self.pool.connection() as conn:
            for source in self._source_rows(conn, start_date):
                symbol = str(source["symbol"]).upper()
                evaluation = conn.execute(
                    "SELECT evaluation_id FROM ai_stock_research.evaluation WHERE trade_date=%s AND symbol=%s",
                    (source["trade_date"], symbol),
                ).fetchone()
                if evaluation:
                    evaluation_id = evaluation["evaluation_id"]
                else:
                    through = source["signal_date"] or (source["trade_date"] - timedelta(days=1))
                    history = self._history(conn, source["instrument_token"], through)
                    snapshot = {
                        "schema_version": "1.0",
                        "analysis_date": source["trade_date"].isoformat(),
                        "source": {
                            "strategy": source["source_strategy"],
                            "run_id": str(source["source_run_id"]),
                            "candidate_id": str(source["source_candidate_id"]),
                            "slot": source["source_slot"],
                            "trigger": source["trigger_kind"],
                            "observed_at": source["source_observed_at"].isoformat(),
                        },
                        "stock": {
                            "symbol": symbol,
                            "company_name": source["company_name"] or symbol,
                            "exchange": "NSE",
                        },
                        "strategy_snapshot": {
                            "direction": source["direction"],
                            "status": source["strategy_status"],
                            "ofactor": _json_value(source["ofactor"]),
                            "xfactor": _json_value(source["xfactor"]),
                            "reference_price": _json_value(source["reference_price"]),
                        },
                        "history_30d": history,
                    }
                    encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
                    status = "PENDING" if len(history) >= 20 else "DATA_INSUFFICIENT"
                    inserted = conn.execute(
                        """INSERT INTO ai_stock_research.evaluation(
                          trade_date,symbol,company_name,direction,strategy_status,ofactor,xfactor,
                          reference_price,source_data_through,history_session_count,input_snapshot,
                          input_sha256,prompt_version,status,completed_at)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,
                            CASE WHEN %s='DATA_INSUFFICIENT' THEN now() END)
                          ON CONFLICT(trade_date,symbol) DO NOTHING RETURNING evaluation_id""",
                        (
                            source["trade_date"],
                            symbol,
                            source["company_name"],
                            source["direction"],
                            source["strategy_status"],
                            source["ofactor"],
                            source["xfactor"],
                            source["reference_price"],
                            through,
                            len(history),
                            encoded,
                            hashlib.sha256(encoded.encode()).hexdigest(),
                            PROMPT_VERSION,
                            status,
                            status,
                        ),
                    ).fetchone()
                    if not inserted:
                        evaluation_id = conn.execute(
                            "SELECT evaluation_id FROM ai_stock_research.evaluation WHERE trade_date=%s AND symbol=%s",
                            (source["trade_date"], symbol),
                        ).fetchone()["evaluation_id"]
                    else:
                        evaluation_id = inserted["evaluation_id"]
                        new_evaluations += 1
                        if status == "DATA_INSUFFICIENT":
                            insufficient += 1
                        else:
                            for provider in PROVIDERS:
                                conn.execute(
                                    """INSERT INTO ai_stock_research.provider_evaluation(
                                      evaluation_id,provider,model,endpoint)
                                      VALUES (%s,%s,%s,%s) ON CONFLICT(evaluation_id,provider) DO NOTHING""",
                                    (evaluation_id, provider, models[provider]["model"], models[provider]["endpoint"]),
                                )
                inserted_source = conn.execute(
                    """INSERT INTO ai_stock_research.evaluation_source(
                      evaluation_id,source_strategy,source_run_id,source_candidate_id,source_slot,
                      trigger_kind,source_observed_at)
                      VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(source_strategy,source_candidate_id) DO NOTHING
                      RETURNING evaluation_id""",
                    (
                        evaluation_id,
                        source["source_strategy"],
                        source["source_run_id"],
                        source["source_candidate_id"],
                        source["source_slot"],
                        source["trigger_kind"],
                        source["source_observed_at"],
                    ),
                ).fetchone()
                new_sources += int(inserted_source is not None)
        return {
            "new_evaluations": new_evaluations,
            "new_sources": new_sources,
            "data_insufficient": insufficient,
        }

    def claim_provider(self, provider: str, worker_id: str) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE ai_stock_research.provider_evaluation SET status='RETRY',lease_owner=NULL,
                  lease_expires_at=NULL,available_at=now(),updated_at=now()
                  WHERE provider=%s AND status='PROCESSING' AND lease_expires_at<now()""",
                (provider,),
            )
            return conn.execute(
                """WITH candidate AS (
                  SELECT p.provider_evaluation_id,e.input_snapshot,e.trade_date,e.symbol,
                    (SELECT s.source_strategy FROM ai_stock_research.evaluation_source s
                     WHERE s.evaluation_id=e.evaluation_id ORDER BY s.source_observed_at LIMIT 1) source_strategy
                  FROM ai_stock_research.provider_evaluation p
                  JOIN ai_stock_research.evaluation e ON e.evaluation_id=p.evaluation_id
                  WHERE p.provider=%s AND p.status IN ('PENDING','RETRY') AND p.available_at<=now()
                  ORDER BY e.trade_date,p.created_at FOR UPDATE OF p SKIP LOCKED LIMIT 1)
                UPDATE ai_stock_research.provider_evaluation p SET status='PROCESSING',attempt_count=attempt_count+1,
                  lease_owner=%s,lease_expires_at=now()+interval '6 minutes',started_at=coalesce(started_at,now()),
                  updated_at=now() FROM candidate c WHERE p.provider_evaluation_id=c.provider_evaluation_id
                  RETURNING p.*,c.input_snapshot,c.trade_date,c.symbol,c.source_strategy""",
                (provider, worker_id),
            ).fetchone()

    def provider_succeeded(
        self,
        row: dict[str, Any],
        request_payload: dict[str, Any],
        raw_response: dict[str, Any],
        output_text: str,
        parsed_output: dict[str, Any],
        message: str,
        chat_id: str | None,
        duration_ms: int,
        delivery_enabled: bool,
        whatsapp_chat_id: str,
    ) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE ai_stock_research.provider_evaluation SET status='SUCCEEDED',request_payload=%s::jsonb,
                  raw_response=%s::jsonb,output_text=%s,parsed_output=%s::jsonb,whatsapp_message=%s,
                  chat_id=%s,duration_ms=%s,completed_at=now(),lease_owner=NULL,lease_expires_at=NULL,
                  last_error_class=NULL,last_error_detail=NULL,updated_at=now()
                  WHERE provider_evaluation_id=%s""",
                (
                    json.dumps(request_payload),
                    json.dumps(raw_response),
                    output_text,
                    json.dumps(parsed_output),
                    message,
                    chat_id,
                    duration_ms,
                    row["provider_evaluation_id"],
                ),
            )
            if delivery_enabled:
                conn.execute(
                    """INSERT INTO ai_stock_research.delivery_outbox(
                      provider_evaluation_id,chat_id,message) VALUES (%s,%s,%s)
                      ON CONFLICT(provider_evaluation_id) DO NOTHING""",
                    (row["provider_evaluation_id"], whatsapp_chat_id, message),
                )
            self._refresh_evaluation_status(conn, row["evaluation_id"])

    def provider_failed(self, row: dict[str, Any], exc: Exception, max_attempts: int) -> str:
        attempt = int(row["attempt_count"])
        terminal = attempt >= max_attempts
        status = "DEAD" if terminal else "RETRY"
        retry_seconds = min(3600, 30 * (2 ** max(0, attempt - 1)))
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE ai_stock_research.provider_evaluation SET status=%s,
                  available_at=CASE WHEN %s THEN available_at ELSE now()+make_interval(secs=>%s) END,
                  lease_owner=NULL,lease_expires_at=NULL,last_error_class=%s,last_error_detail=%s,
                  completed_at=CASE WHEN %s THEN now() ELSE completed_at END,updated_at=now()
                  WHERE provider_evaluation_id=%s""",
                (
                    status,
                    terminal,
                    retry_seconds,
                    type(exc).__name__,
                    str(exc)[:500],
                    terminal,
                    row["provider_evaluation_id"],
                ),
            )
            self._refresh_evaluation_status(conn, row["evaluation_id"])
        return status

    def _refresh_evaluation_status(self, conn: Any, evaluation_id: Any) -> None:
        counts = conn.execute(
            """SELECT count(*) FILTER(WHERE status='SUCCEEDED') succeeded,
              count(*) FILTER(WHERE status='DEAD') dead,count(*) total
              FROM ai_stock_research.provider_evaluation WHERE evaluation_id=%s""",
            (evaluation_id,),
        ).fetchone()
        if counts["total"] and counts["succeeded"] == counts["total"]:
            status = "COMPLETED"
        elif counts["total"] and counts["dead"] == counts["total"]:
            status = "DEAD"
        elif counts["succeeded"] and counts["succeeded"] + counts["dead"] == counts["total"]:
            status = "PARTIAL"
        else:
            status = "RUNNING"
        conn.execute(
            """UPDATE ai_stock_research.evaluation SET status=%s,started_at=coalesce(started_at,now()),
              completed_at=CASE WHEN %s IN ('COMPLETED','PARTIAL','DEAD') THEN now() ELSE NULL END,
              updated_at=now() WHERE evaluation_id=%s""",
            (status, status, evaluation_id),
        )

    def claim_delivery(self, worker_id: str) -> dict[str, Any] | None:
        with self.pool.connection() as conn:
            conn.execute(
                """UPDATE ai_stock_research.delivery_outbox SET status='RETRY',lease_owner=NULL,
                  lease_expires_at=NULL,available_at=now(),updated_at=now()
                  WHERE status='PROCESSING' AND lease_expires_at<now()"""
            )
            return conn.execute(
                """WITH candidate AS (
                  SELECT delivery_id FROM ai_stock_research.delivery_outbox
                  WHERE status IN ('PENDING','RETRY') AND available_at<=now()
                  ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1)
                UPDATE ai_stock_research.delivery_outbox d SET status='PROCESSING',attempt_count=attempt_count+1,
                  lease_owner=%s,lease_expires_at=now()+interval '60 seconds',updated_at=now()
                  FROM candidate c WHERE d.delivery_id=c.delivery_id RETURNING d.*""",
                (worker_id,),
            ).fetchone()

    def delivery_finished(
        self,
        row: dict[str, Any],
        *,
        status_code: int | None,
        response_excerpt: str,
        error_class: str | None,
        duration_ms: int,
        max_attempts: int,
    ) -> str:
        attempt = int(row["attempt_count"])
        success = status_code is not None and 200 <= status_code < 300 and error_class is None
        retryable = (
            error_class in {"GATEWAY_REJECTED", "INVALID_GATEWAY_RESPONSE"}
            or status_code is None
            or status_code in {408, 425, 429}
            or status_code >= 500
        )
        terminal = not success and (not retryable or attempt >= max_attempts)
        state = "DELIVERED" if success else "DEAD" if terminal else "RETRY"
        retry_seconds = min(3600, 15 * (2 ** max(0, attempt - 1)))
        with self.pool.connection() as conn:
            conn.execute(
                """INSERT INTO ai_stock_research.delivery_attempt(
                  delivery_id,attempt_number,started_at,completed_at,response_status,response_excerpt,
                  error_class,duration_ms) VALUES (%s,%s,now()-make_interval(secs=>%s::numeric/1000),
                  now(),%s,%s,%s,%s)""",
                (
                    row["delivery_id"],
                    attempt,
                    duration_ms,
                    status_code,
                    response_excerpt[:500],
                    error_class,
                    duration_ms,
                ),
            )
            conn.execute(
                """UPDATE ai_stock_research.delivery_outbox SET status=%s,
                  available_at=CASE WHEN %s='RETRY' THEN now()+make_interval(secs=>%s) ELSE available_at END,
                  delivered_at=CASE WHEN %s='DELIVERED' THEN now() ELSE delivered_at END,
                  lease_owner=NULL,lease_expires_at=NULL,last_error_class=%s,updated_at=now()
                  WHERE delivery_id=%s""",
                (state, state, retry_seconds, state, error_class, row["delivery_id"]),
            )
        return state

    def heartbeat(self, status: str, detail: dict[str, Any], success: bool) -> None:
        with self.pool.connection() as conn:
            conn.execute(
                """INSERT INTO ai_stock_research.service_heartbeat(
                  service_name,status,detail,last_success_at,last_error_at)
                  VALUES ('ai-stock-research',%s,%s::jsonb,CASE WHEN %s THEN now() END,
                    CASE WHEN %s THEN NULL ELSE now() END)
                  ON CONFLICT(service_name) DO UPDATE SET status=excluded.status,detail=excluded.detail,
                    last_success_at=CASE WHEN %s THEN now() ELSE ai_stock_research.service_heartbeat.last_success_at END,
                    last_error_at=CASE WHEN %s THEN ai_stock_research.service_heartbeat.last_error_at ELSE now() END,
                    updated_at=now()""",
                (status, json.dumps(detail, default=str), success, success, success, success),
            )

    def validation_summary(self) -> dict[str, Any]:
        with self.pool.connection() as conn:
            return dict(
                conn.execute(
                    """SELECT
                      (SELECT count(*) FROM ai_stock_research.evaluation) evaluations,
                      (SELECT count(*) FROM ai_stock_research.provider_evaluation) provider_rows,
                      (SELECT count(*) FROM ai_stock_research.delivery_outbox) delivery_rows,
                      (SELECT count(*) FROM ai_stock_research.evaluation_source) source_rows"""
                ).fetchone()
            )
