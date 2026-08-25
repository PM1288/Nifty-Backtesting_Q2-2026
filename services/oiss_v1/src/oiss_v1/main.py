from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import subprocess
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import CONFIG_VERSION, FORMULA_VERSION, FRAMEWORK_VERSION, STRATEGY_ID
from .engine import (
    assign_status,
    clamp,
    data_quality,
    extension_bucket,
    finite,
    horizon_score,
    horizon_state,
    position_size,
    sector_score,
    tqs,
)

LOG = logging.getLogger("oiss-v1")
IST = ZoneInfo("Asia/Kolkata")
OFFICIAL_SLOTS = (
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


def json_value(value: Any, default: Any) -> Any:
    return value if isinstance(value, type(default)) else default


def compact_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def code_commit() -> str:
    configured = os.getenv("GIT_COMMIT")
    if configured:
        return configured
    try:
        detected = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False
        ).stdout.strip()
    except FileNotFoundError:
        detected = ""
    return detected or "UNKNOWN"


class OissRuntime:
    def __init__(self) -> None:
        self.config_path = Path(os.getenv("OISS_CONFIG_PATH", "/app/config/oiss-v1-202608.yaml"))
        if not self.config_path.exists():
            self.config_path = Path(__file__).resolve().parents[2] / "config" / "oiss-v1-202608.yaml"
        self.config = json.loads(self.config_path.read_text())
        self.pool = ConnectionPool(
            os.environ["DATABASE_URL"], min_size=1, max_size=3, kwargs={"row_factory": dict_row}
        )
        with self.pool.connection() as conn:
            config_hash = compact_hash(self.config)
            conn.execute(
                """INSERT INTO oiss.strategy_version(strategy_id,strategy_version,formula_version,config_version,config,config_hash,status)
              VALUES (%s,%s,%s,%s,%s::jsonb,%s,'SHADOW') ON CONFLICT DO NOTHING""",
                (
                    STRATEGY_ID,
                    FRAMEWORK_VERSION,
                    FORMULA_VERSION,
                    CONFIG_VERSION,
                    json.dumps(self.config),
                    config_hash,
                ),
            )
            stored = conn.execute(
                """SELECT config_hash FROM oiss.strategy_version WHERE strategy_id=%s AND strategy_version=%s AND formula_version=%s AND config_version=%s""",
                (STRATEGY_ID, FRAMEWORK_VERSION, FORMULA_VERSION, CONFIG_VERSION),
            ).fetchone()
            if not stored or stored["config_hash"] != config_hash:
                raise RuntimeError("immutable OISS configuration hash mismatch")

    def close(self) -> None:
        self.pool.close()

    def source_runs(
        self, start: date | None = None, end: date | None = None, latest_only: bool = False
    ) -> list[dict[str, Any]]:
        where = ["r.status='COMPLETED'", "r.run_slot=ANY(%s)", "r.trade_date>=date '2026-08-11'"]
        params: list[Any] = [list(OFFICIAL_SLOTS)]
        if start:
            where.append("r.trade_date>=%s")
            params.append(start)
        if end:
            where.append("r.trade_date<=%s")
            params.append(end)
        query = f"""SELECT DISTINCT ON (r.trade_date,r.run_slot) r.*,
          greatest(coalesce(r.decision_as_of,r.as_of_ts,r.completed_at),coalesce(x.max_available_at,r.completed_at)) effective_as_of
          FROM oiis_live.selection_run r
          LEFT JOIN LATERAL (SELECT max(available_at) max_available_at FROM oiis_live.daily_candidate c WHERE c.run_id=r.run_id) x ON true
          WHERE {" AND ".join(where)} ORDER BY r.trade_date,r.run_slot,r.completed_at DESC NULLS LAST"""
        with self.pool.connection() as conn:
            rows = list(conn.execute(query, params).fetchall())
        rows.sort(key=lambda row: row["effective_as_of"])
        return rows[-1:] if latest_only and rows else rows

    def run_from_source(self, source: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        with self.pool.connection() as conn:
            existing = conn.execute(
                """SELECT run_id,status FROM oiss.run WHERE source_oiis_run_id=%s AND strategy_id=%s AND formula_version=%s AND config_version=%s""",
                (source["run_id"], STRATEGY_ID, FORMULA_VERSION, CONFIG_VERSION),
            ).fetchone()
            if existing and existing["status"] == "COMPLETED":
                return {"run_id": str(existing["run_id"]), "status": "UNCHANGED"}
            source_rows = conn.execute(
                """SELECT c.*,p.company_name,p.sector profile_sector,p.is_nse_fno,
              EXISTS(SELECT 1 FROM public.instruments o WHERE o.exchange='NFO' AND o.name=c.symbol AND o.instrumenttype='OPTSTK' AND o.expiry>=c.trade_date) option_eligible,
              (SELECT max(lotsize) FROM public.instruments i WHERE i.exchange='NFO' AND i.name=c.symbol AND i.instrumenttype IN ('FUTSTK','OPTSTK') AND i.expiry>=c.trade_date) lot_size
              FROM oiis_live.daily_candidate c LEFT JOIN public.instrument_profiles p ON p.symbol=c.symbol WHERE c.run_id=%s ORDER BY c.symbol""",
                (source["run_id"],),
            ).fetchall()
            if not source_rows:
                return {"status": "BLOCKED_DATA", "reason": "source OIIS run has no candidates"}
            previous = conn.execute(
                "SELECT run_id FROM oiss.run WHERE status='COMPLETED' AND scan_timestamp<%s ORDER BY scan_timestamp DESC LIMIT 1",
                (source["effective_as_of"],),
            ).fetchone()
            dq_values = [
                finite(row["data_quality"]) for row in source_rows if finite(row["data_quality"]) is not None
            ]
            run_dq = min(dq_values) if dq_values else 0
            run_grade = (
                "A"
                if run_dq >= 90
                else "B"
                if run_dq >= 80
                else "C"
                if run_dq >= 70
                else "D"
                if run_dq >= 50
                else "F"
            )
            run = conn.execute(
                """INSERT INTO oiss.run(source_oiis_run_id,strategy_id,strategy_version,formula_version,config_version,
              run_date,scan_timestamp,scan_sequence,market_session,market_stage,trading_mode,primary_data_source,backup_data_source,
              data_quality_grade,data_quality_score,overall_confidence,previous_run_id,code_commit,build_version,status)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'NSE_CASH','INTRADAY_SCAN','INTELLIGENCE','OIIS_IMMUTABLE_SNAPSHOT','NSE_EOD/YAHOO',%s,%s,%s,%s,%s,%s,'RUNNING')
              ON CONFLICT(source_oiis_run_id,strategy_id,formula_version,config_version) DO UPDATE SET status='RUNNING',started_at=now(),completed_at=NULL RETURNING *""",
                (
                    source["run_id"],
                    STRATEGY_ID,
                    FRAMEWORK_VERSION,
                    FORMULA_VERSION,
                    CONFIG_VERSION,
                    source["trade_date"],
                    source["effective_as_of"],
                    OFFICIAL_SLOTS.index(source["run_slot"]) + 1,
                    run_grade,
                    run_dq,
                    run_dq,
                    previous["run_id"] if previous else None,
                    code_commit(),
                    os.getenv("BUILD_VERSION", "source"),
                ),
            ).fetchone()
            conn.execute("DELETE FROM oiss.sector_score WHERE run_id=%s", (run["run_id"],))
            conn.execute("DELETE FROM oiss.scan_change WHERE run_id=%s", (run["run_id"],))
            conn.execute("DELETE FROM oiss.candidate WHERE run_id=%s", (run["run_id"],))

            transformed = [self.transform(row, source["effective_as_of"]) for row in source_rows]
            transformed.sort(key=lambda item: (item["tqs"] is not None, item["tqs"] or -1), reverse=True)
            for rank, item in enumerate(transformed, 1):
                item["rank"] = rank
                candidate = conn.execute(
                    """INSERT INTO oiss.candidate(run_id,source_oiis_candidate_id,strategy_id,strategy_version,formula_version,config_version,as_of,
                  symbol,company_name,sector,direction,fno_eligible,option_eligible,lot_size,ofactor_long,ofactor_short,ofactor,xfactor,tqs,
                  extension_atr,extension_state,data_quality_score,data_quality_grade,canonical_status,selected,rank,why,missing_confirmation,
                  upgrade_condition,invalidation,entry_plan,option_selection,position_sizing,horizon_scores,rejection,feature_snapshot,source_max_event_time)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,
                    %s::jsonb,%s::jsonb,%s::jsonb,%s) RETURNING candidate_id""",
                    (
                        run["run_id"],
                        item["source_id"],
                        STRATEGY_ID,
                        FRAMEWORK_VERSION,
                        FORMULA_VERSION,
                        CONFIG_VERSION,
                        source["effective_as_of"],
                        item["symbol"],
                        item["company_name"],
                        item["sector"],
                        item["direction"],
                        item["fno"],
                        item["option_eligible"],
                        item["lot_size"],
                        item["ofactor_long"],
                        item["ofactor_short"],
                        item["ofactor"],
                        item["xfactor"],
                        item["tqs"],
                        item["extension_atr"],
                        item["extension_state"],
                        item["dq"]["effective"],
                        item["dq"]["grade"],
                        item["decision"].status,
                        item["decision"].status in {"BUY NOW", "SELL NOW"},
                        rank,
                        json.dumps(item["decision"].why),
                        json.dumps(item["decision"].missing_confirmation),
                        item["decision"].upgrade_condition,
                        item["decision"].invalidation,
                        json.dumps(item["entry"]),
                        json.dumps(item["option"]),
                        json.dumps(item["sizing"]),
                        json.dumps(item["horizons"]),
                        json.dumps(item["rejection"]),
                        json.dumps(item["snapshot"], default=str),
                        source["effective_as_of"],
                    ),
                ).fetchone()
                item["candidate_id"] = candidate["candidate_id"]
            self.populate_option_selections(conn, run["run_id"], source["effective_as_of"])
            self.persist_sectors(conn, run["run_id"], transformed)
            self.persist_changes(conn, run["run_id"], previous["run_id"] if previous else None)
            sections = self.build_sections(transformed)
            digest = compact_hash(
                {
                    "source": str(source["run_id"]),
                    "candidates": [(x["symbol"], x["decision"].status, x["tqs"]) for x in transformed],
                }
            )
            runtime = {
                "total_duration_ms": round((time.monotonic() - started) * 1000, 2),
                "stocks_evaluated": len(transformed),
                "actionable": sections["summary"]["actionable"],
                "rejections": sections["summary"]["rejected"],
            }
            conn.execute(
                "UPDATE oiss.run SET status='COMPLETED',sections=%s::jsonb,runtime_metrics=%s::jsonb,result_hash=%s,completed_at=now() WHERE run_id=%s",
                (json.dumps(sections, default=str), json.dumps(runtime), digest, run["run_id"]),
            )
            self.evaluate_outcomes(conn, run["run_id"])
            return {"run_id": str(run["run_id"]), "status": "COMPLETED", **runtime}

    def transform(self, row: dict[str, Any], as_of: datetime) -> dict[str, Any]:
        evidence = json_value(row.get("evidence"), {})
        feature = json_value(evidence.get("feature"), {})
        xdetail = json_value(evidence.get("xfactor"), {})
        long_o = json_value(evidence.get("ofactor_long"), {})
        short_o = json_value(evidence.get("ofactor_short"), {})
        dq_source = json_value(evidence.get("dq"), {})
        base_dq = finite(row.get("data_quality"))
        dq = data_quality(
            {
                "freshness": finite(dq_source.get("freshness")) or base_dq,
                "completeness": finite(dq_source.get("coverage")) or base_dq,
                "consistency": finite(dq_source.get("consistency")) or base_dq,
                "coverage": finite(row.get("data_coverage")) or finite(dq_source.get("coverage")) or base_dq,
                "source_integrity": finite(dq_source.get("source_reliability")) or base_dq,
            },
            {
                "market_context": base_dq,
                "stock_price": base_dq,
                "required_features": finite(dq_source.get("coverage")) or base_dq,
            },
        )
        o_long, o_short = finite(long_o.get("final_score")), finite(short_o.get("final_score"))
        direction = "LONG" if (o_long or 0) >= (o_short or 0) else "SHORT"
        ofactor = o_long if direction == "LONG" else o_short
        xfactor = finite(row.get("xfactor_snapshot"))
        ext_atr = finite(xdetail.get("extension_atr"))
        ext_state, penalty = extension_bucket(ext_atr, self.config["extension"])
        score = tqs(ofactor, xfactor, penalty)
        rr = finite(xdetail.get("reward_risk"))
        trigger = str(xdetail.get("setup_state") or row.get("setup_state") or "").upper() == "TRIGGERED"
        gates = [
            str(value)
            for value in json_value(xdetail.get("hard_gates"), [])
            if str(value) not in {"EXCESSIVE_EXTENSION"}
        ]
        decision = assign_status(
            direction=direction,
            ofactor=ofactor,
            xfactor=xfactor,
            score=score,
            extension=ext_state,
            dq_grade=dq["grade"],
            trigger=trigger,
            rr=rr,
            hard_gates=gates,
            thresholds=self.config["thresholds"],
        )
        entry = finite(row.get("reference_price")) or finite(feature.get("close_price"))
        stop = finite(xdetail.get("structural_stop"))
        risk = abs(entry - stop) if entry is not None and stop is not None else None
        entry_plan = {
            "setup": xdetail.get("setup_id") or row.get("setup_id"),
            "trigger": xdetail.get("setup_state"),
            "entry_zone_low": round(entry - 0.1 * risk, 4) if risk is not None else None,
            "entry_zone_high": round(entry + 0.1 * risk, 4) if risk is not None else None,
            "stop": stop,
            "target_1": round(entry + (risk * 1.5 if direction == "LONG" else -risk * 1.5), 4)
            if risk is not None
            else None,
            "target_2": round(entry + (risk * 2 if direction == "LONG" else -risk * 2), 4)
            if risk is not None
            else None,
            "rr_1": 1.5 if risk else None,
            "rr_2": 2 if risk else None,
        }
        components = json_value(row.get("component_scores"), {})
        oc = json_value(components.get("ofactor"), {})
        xc = json_value(components.get("xfactor"), {})
        extension_quality = (
            100
            if ext_state in {"FRESH", "ACCEPTABLE"}
            else 70
            if ext_state == "MODERATE"
            else 35
            if ext_state == "EXTENDED"
            else 0
        )
        common = {
            "sector": finite(oc.get("sector_industry_support")),
            "oi": finite(oc.get("money_flow_participation")),
            "momentum": finite(oc.get("momentum_quality")),
            "liquidity": finite(oc.get("liquidity_tradability")),
            "extension": extension_quality,
        }
        close = clamp((finite(feature.get("close_location")) or 0.5) * 100)
        values = {
            "BTST": {"close": close if direction == "LONG" else 100 - close, **common},
            "STBT": {"close": 100 - close if direction == "SHORT" else close, **common},
            "H2": {
                "relative": finite(oc.get("relative_strength")),
                "sector": common["sector"],
                "catalyst": finite(oc.get("catalyst_context")),
                "oi": common["oi"],
                "runway": extension_quality,
                "execution": xfactor,
            },
            "H3": {
                "relative": finite(oc.get("relative_strength")),
                "flow": common["oi"],
                "sector": common["sector"],
                "regime": finite(oc.get("market_regime_support")),
                "extension": extension_quality,
            },
            "H4": {
                "weekly": finite(oc.get("trend_quality")),
                "sector": common["sector"],
                "institutional": finite(oc.get("institutional_confirmation")),
                "trend": finite(oc.get("trend_quality")),
                "risk": finite(xc.get("stop_invalidation_quality")),
            },
        }
        horizons = {}
        for name, inputs in values.items():
            value = horizon_score(name, inputs)
            horizons[name] = {
                "score": value,
                "state": horizon_state(name, value, direction, dq["grade"], ext_state == "EXTREME"),
                "inputs": inputs,
            }
        lot = int(row["lot_size"]) if row.get("lot_size") else None
        sizing = position_size(
            self.config["risk"]["account_capital"],
            self.config["risk"]["risk_per_trade_pct"],
            entry,
            stop,
            lot,
            entry * lot if entry and lot else None,
            self.config["risk"]["account_capital"],
            self.config["risk"]["max_lots"],
        )
        rejection = (
            {}
            if decision.status in {"BUY NOW", "SELL NOW"}
            else {
                "reason_rejected": decision.missing_confirmation,
                "failed_gate": gates,
                "upgrade_condition": decision.upgrade_condition,
                "invalidation": decision.invalidation,
            }
        )
        return {
            "source_id": row["candidate_id"],
            "symbol": row["symbol"],
            "company_name": row.get("company_name"),
            "sector": row.get("profile_sector") or row.get("sector") or "UNCLASSIFIED",
            "direction": direction,
            "fno": bool(row.get("is_nse_fno")),
            "option_eligible": bool(row.get("option_eligible")),
            "lot_size": lot,
            "ofactor_long": o_long,
            "ofactor_short": o_short,
            "ofactor": ofactor,
            "xfactor": xfactor,
            "tqs": score,
            "extension_atr": ext_atr,
            "extension_state": ext_state,
            "dq": dq,
            "decision": decision,
            "entry": entry_plan,
            "option": {
                "state": "DATA_INSUFFICIENT",
                "reason": "Contract selection is populated only when a point-in-time chain passes quality gates",
            },
            "sizing": sizing,
            "horizons": horizons,
            "rejection": rejection,
            "snapshot": {
                "source_available_at": str(row.get("available_at")),
                "feature": feature,
                "ofactor_components": oc,
                "xfactor_components": xc,
                "source_evidence": evidence,
            },
        }

    def persist_sectors(self, conn: Any, run_id: Any, items: list[dict[str, Any]]) -> None:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            grouped.setdefault(item["sector"], []).append(item)
        scored = []
        for sector, rows in grouped.items():

            def avg(key: str) -> float | None:
                values = [finite(r["snapshot"]["ofactor_components"].get(key)) for r in rows]
                values = [v for v in values if v is not None]
                return sum(values) / len(values) if values else None

            parts = {
                "relative_strength": avg("relative_strength"),
                "breadth": avg("sector_industry_support"),
                "money_flow": avg("money_flow_participation"),
                "participation": avg("liquidity_tradability"),
            }
            result = sector_score(parts)
            scored.append((sector, parts, result))
        scored.sort(key=lambda row: row[2]["score"] or -1, reverse=True)
        for rank, (sector, parts, result) in enumerate(scored, 1):
            conn.execute(
                """INSERT INTO oiss.sector_score(run_id,sector,rank,score,state,relative_strength,breadth,money_flow,participation,persistence,evidence)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s::jsonb)""",
                (
                    run_id,
                    sector,
                    rank,
                    result["score"],
                    result["state"],
                    parts["relative_strength"],
                    parts["breadth"],
                    parts["money_flow"],
                    parts["participation"],
                    json.dumps({"sample_size": len(grouped[sector])}),
                ),
            )

    def populate_option_selections(self, conn: Any, run_id: Any, as_of: datetime) -> None:
        policy = self.config["option"]
        conn.execute(
            """WITH scoped AS (
              SELECT c.candidate_id,c.symbol,c.direction,c.lot_size,s.*,
                row_number() OVER(PARTITION BY c.candidate_id,s.expiry,s.strike,s.right ORDER BY s.ts DESC) latest_contract
              FROM oiss.candidate c JOIN public.smartapi_option_chain_snapshots s ON s.underlying=c.symbol
              WHERE c.run_id=%s AND c.option_eligible AND c.ofactor>=%s
                AND s.ts<=%s AND s.ts>%s-make_interval(mins=>%s) AND s.expiry>=c.as_of::date
                AND s.right=CASE WHEN c.direction='LONG' THEN 'CE' ELSE 'PE' END
            ), latest AS (
              SELECT *,dense_rank() OVER(PARTITION BY candidate_id,expiry ORDER BY abs(strike-spot_price)) proximity,
                percent_rank() OVER(PARTITION BY candidate_id,expiry ORDER BY oi) oi_rank,
                percent_rank() OVER(PARTITION BY candidate_id,expiry ORDER BY volume) volume_rank
              FROM scoped WHERE latest_contract=1
            ), scored AS (
              SELECT *,greatest(0,100-least(100,coalesce(spread_pct,100)*10)) spread_quality,
                greatest(0,least(100,50+coalesce(depth_imbalance,0)*50)) depth_quality
              FROM latest WHERE proximity<=3
            ), selected AS (
              SELECT DISTINCT ON(candidate_id) *,
                .35*spread_quality+.25*oi_rank*100+.20*volume_rank*100+.20*depth_quality liquidity_score
              FROM scored WHERE coalesce(spread_pct,999)<=%s AND coalesce(oi,0)>=%s AND coalesce(volume,0)>=%s
              ORDER BY candidate_id,(.35*spread_quality+.25*oi_rank*100+.20*volume_rank*100+.20*depth_quality) DESC,expiry,strike
            ) UPDATE oiss.candidate c SET option_selection=jsonb_build_object(
              'state','SELECTED','underlying',s.symbol,'spot',s.spot_price,'expiry',s.expiry,'atm_strike',
              (SELECT strike FROM scored a WHERE a.candidate_id=s.candidate_id ORDER BY abs(a.strike-a.spot_price) LIMIT 1),
              'selected_strike',s.strike,'moneyness',CASE WHEN s.strike=s.spot_price THEN 'ATM' WHEN (s.direction='LONG' AND s.strike<s.spot_price) OR (s.direction='SHORT' AND s.strike>s.spot_price) THEN 'ITM' ELSE 'OTM' END,
              'right',s.right,'premium',s.midpoint,'bid',s.bid,'ask',s.ask,'spread',s.spread,'spread_pct',s.spread_pct,
              'volume',s.volume,'open_interest',s.oi,'delta',coalesce(s.broker_delta,s.local_delta),'lot_size',s.lotsize,
              'liquidity_score',round(s.liquidity_score::numeric,4),'selection_reason','Highest point-in-time liquidity score among ATM and one-step ITM/OTM contracts',
              'quote_as_of',s.ts,'data_quality_status',s.data_quality_status),
              position_sizing=c.position_sizing||jsonb_build_object('option_capital_per_lot',s.midpoint*s.lotsize,'verified_option_lot_size',s.lotsize)
              FROM selected s WHERE c.candidate_id=s.candidate_id""",
            (
                run_id,
                self.config["thresholds"]["ofactor_candidate"],
                as_of,
                as_of,
                policy["maximum_quote_age_minutes"],
                policy["maximum_spread_pct"],
                policy["minimum_open_interest"],
                policy["minimum_volume"],
            ),
        )

    def persist_changes(self, conn: Any, run_id: Any, previous_run_id: Any) -> None:
        conn.execute(
            """INSERT INTO oiss.scan_change(run_id,candidate_id,symbol,previous_status,current_status,previous_ofactor,current_ofactor,previous_xfactor,current_xfactor,previous_tqs,current_tqs,change_kind,changed_components,reason_changed)
          SELECT c.run_id,c.candidate_id,c.symbol,p.canonical_status,c.canonical_status,p.ofactor,c.ofactor,p.xfactor,c.xfactor,p.tqs,c.tqs,
          CASE WHEN p.candidate_id IS NULL THEN 'APPEARED' WHEN p.canonical_status<>c.canonical_status AND c.selected THEN 'UPGRADED' WHEN p.canonical_status<>c.canonical_status THEN 'CHANGED' WHEN c.tqs>p.tqs THEN 'IMPROVED' WHEN c.tqs<p.tqs THEN 'DECLINED' ELSE 'UNCHANGED' END,
          jsonb_build_object('status',p.canonical_status IS DISTINCT FROM c.canonical_status,'ofactor',p.ofactor IS DISTINCT FROM c.ofactor,'xfactor',p.xfactor IS DISTINCT FROM c.xfactor,'tqs',p.tqs IS DISTINCT FROM c.tqs),
          CASE WHEN p.candidate_id IS NULL THEN 'First appearance in OISS radar' WHEN p.canonical_status IS DISTINCT FROM c.canonical_status THEN concat('Status changed from ',p.canonical_status,' to ',c.canonical_status) ELSE 'Scores refreshed from the current immutable scan' END
          FROM oiss.candidate c LEFT JOIN oiss.candidate p ON p.run_id=%s AND p.symbol=c.symbol WHERE c.run_id=%s""",
            (previous_run_id, run_id),
        )

    def build_sections(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        actionable = [x for x in items if x["decision"].status in {"BUY NOW", "SELL NOW"}]
        rejected = [x for x in items if x["decision"].status in {"NO TRADE", "NO CHASE", "DATA INSUFFICIENT"}]

        def best(predicate: Any) -> dict[str, Any] | None:
            return next(
                (
                    {"symbol": x["symbol"], "status": x["decision"].status, "score": x["tqs"]}
                    for x in items
                    if predicate(x)
                ),
                None,
            )

        bests = {
            "best_intraday_long": best(lambda x: x["direction"] == "LONG" and x in actionable),
            "best_intraday_short": best(lambda x: x["direction"] == "SHORT" and x in actionable),
            "best_BTST": best(lambda x: x["horizons"]["BTST"]["state"] == "BTST QUALIFIED"),
            "best_STBT": best(lambda x: x["horizons"]["STBT"]["state"] == "STBT QUALIFIED"),
            "best_H2": best(lambda x: x["horizons"]["H2"]["state"] == "H2 QUALIFIED"),
            "best_H3": best(lambda x: x["horizons"]["H3"]["state"] == "H3 QUALIFIED"),
            "best_H4": best(lambda x: x["horizons"]["H4"]["state"] == "H4 QUALIFIED"),
            "highest_OFactor_no_chase": best(lambda x: x["decision"].status == "NO CHASE"),
        }
        final = {
            "decision": "NO TRADE" if not actionable else "SELECTIVE TRADE ENVIRONMENT",
            "reason": "No candidate passed every actionability gate"
            if not actionable
            else f"{len(actionable)} candidate(s) passed every configured gate",
            "best": bests,
        }
        return {
            "contract_sections": [
                "01 Run Identity",
                "02 Data Quality",
                "03 Market Regime",
                "04 Critical Index Levels",
                "05 Macro / Event Risk",
                "06 Sector Rotation",
                "07 Money Flow",
                "08 Stock Radar",
                "09 OFactor",
                "10 Extension",
                "11 Trade Qualification",
                "12 XFactor",
                "13 Entry / Stop / Targets",
                "14 Option Selection",
                "15 ATM / ITM / OTM",
                "16 Lot Size",
                "17 Margin",
                "18 Position Size",
                "19 Intraday Long / Short",
                "20 BTST",
                "21 STBT",
                "22 H2",
                "23 H3",
                "24 H4",
                "25 Carry Matrix",
                "26 Rejected Trades",
                "27 Portfolio Risk",
                "28 Existing Trade Management",
                "29 Previous Scan Comparison",
                "30 Best Opportunities",
                "31 Final Decision",
            ],
            "summary": {
                "stocks": len(items),
                "actionable": len(actionable),
                "rejected": len(rejected),
                "developing": len(items) - len(actionable) - len(rejected),
            },
            "best_opportunities": bests,
            "final_decision": final,
            "data_states": {
                "critical_index_levels": "REUSE_EXISTING_PENDING_API_VIEW",
                "macro_event_risk": "DATA INSUFFICIENT",
                "option_selection": "DATA INSUFFICIENT unless point-in-time chain passes",
                "portfolio_risk": "INTELLIGENCE_ONLY while paper flag disabled",
            },
        }

    def evaluate_outcomes(self, conn: Any, run_id: Any) -> None:
        conn.execute(
            """INSERT INTO oiss.backtest_outcome(candidate_id,run_id,symbol,direction,entry_price,outcome_state,observed_through,returns,extrema,target_path,source_max_event_time)
          SELECT c.candidate_id,c.run_id,c.symbol,c.direction,(c.entry_plan->>'entry_zone_high')::numeric,
          CASE WHEN count(b.trade_date)=0 THEN 'DATA_INSUFFICIENT' WHEN count(b.trade_date)>=5 THEN 'MATURE_D5' ELSE 'DEVELOPING' END,
          max(b.trade_date)::timestamp AT TIME ZONE 'Asia/Kolkata',
          jsonb_build_object('D1',max(CASE WHEN b.rn=1 THEN CASE WHEN c.direction='LONG' THEN 100*(b.close/e.entry-1) ELSE 100*(e.entry/b.close-1) END END),'D2',max(CASE WHEN b.rn=2 THEN CASE WHEN c.direction='LONG' THEN 100*(b.close/e.entry-1) ELSE 100*(e.entry/b.close-1) END END),'D3',max(CASE WHEN b.rn=3 THEN CASE WHEN c.direction='LONG' THEN 100*(b.close/e.entry-1) ELSE 100*(e.entry/b.close-1) END END),'D4',max(CASE WHEN b.rn=4 THEN CASE WHEN c.direction='LONG' THEN 100*(b.close/e.entry-1) ELSE 100*(e.entry/b.close-1) END END),'D5',max(CASE WHEN b.rn=5 THEN CASE WHEN c.direction='LONG' THEN 100*(b.close/e.entry-1) ELSE 100*(e.entry/b.close-1) END END)),
          jsonb_build_object('MFE_PCT',CASE WHEN c.direction='LONG' THEN 100*(max(b.high)/e.entry-1) ELSE 100*(e.entry/min(b.low)-1) END,'MAE_PCT',CASE WHEN c.direction='LONG' THEN 100*(min(b.low)/e.entry-1) ELSE 100*(e.entry/max(b.high)-1) END),
          '{}'::jsonb,max(b.trade_date)::timestamp AT TIME ZONE 'Asia/Kolkata'
          FROM oiss.candidate c CROSS JOIN LATERAL (SELECT coalesce((c.entry_plan->>'entry_zone_high')::numeric,(c.feature_snapshot#>>'{feature,close_price}')::numeric) entry) e
          LEFT JOIN LATERAL (SELECT d.trade_date,d.high,d.low,d.close,row_number() OVER(ORDER BY d.trade_date) rn FROM public.bars_1d d JOIN public.instruments i ON i.symbol_token=d.symbol_token AND i.exchange='NSE' WHERE upper(regexp_replace(i.tradingsymbol,'-EQ$',''))=c.symbol AND d.trade_date>c.as_of::date ORDER BY d.trade_date LIMIT 5) b ON true
          WHERE c.run_id=%s GROUP BY c.candidate_id,c.run_id,c.symbol,c.direction,e.entry
          ON CONFLICT(candidate_id) DO UPDATE SET outcome_state=excluded.outcome_state,observed_through=excluded.observed_through,returns=excluded.returns,extrema=excluded.extrema,source_max_event_time=excluded.source_max_event_time,evaluated_at=now()""",
            (run_id,),
        )

    def backfill(self, start: date | None, end: date | None) -> dict[str, Any]:
        results = [self.run_from_source(row) for row in self.source_runs(start, end)]
        return {
            "source_runs": len(results),
            "completed": sum(r["status"] == "COMPLETED" for r in results),
            "unchanged": sum(r["status"] == "UNCHANGED" for r in results),
            "results": results,
        }

    def validate(self) -> dict[str, Any]:
        with self.pool.connection() as conn:
            row = conn.execute(
                """SELECT count(*) runs,count(*) FILTER(WHERE status='COMPLETED') completed,min(run_date) start_date,max(run_date) end_date FROM oiss.run"""
            ).fetchone()
            candidates = conn.execute(
                "SELECT count(*) observations,count(*) FILTER(WHERE selected) actionable,count(*) FILTER(WHERE canonical_status IN ('NO TRADE','NO CHASE','DATA INSUFFICIENT')) rejected,count(DISTINCT symbol) symbols FROM oiss.candidate"
            ).fetchone()
            leakage = conn.execute(
                "SELECT count(*) violations FROM oiss.candidate WHERE source_max_event_time>as_of"
            ).fetchone()["violations"]
            duplicates = conn.execute(
                "SELECT count(*) duplicates FROM (SELECT run_id,symbol,count(*) FROM oiss.candidate GROUP BY 1,2 HAVING count(*)>1)x"
            ).fetchone()["duplicates"]
            outcomes = conn.execute(
                "SELECT count(*) outcomes,count(*) FILTER(WHERE outcome_state='DATA_INSUFFICIENT') insufficient FROM oiss.backtest_outcome"
            ).fetchone()
        return {
            **row,
            **candidates,
            **outcomes,
            "leakage_violations": leakage,
            "duplicate_candidates": duplicates,
            "status": "PASS" if leakage == 0 and duplicates == 0 else "FAIL",
        }

    def refresh_options(self) -> dict[str, int]:
        with self.pool.connection() as conn:
            runs = conn.execute(
                "SELECT run_id,scan_timestamp FROM oiss.run WHERE status='COMPLETED' ORDER BY scan_timestamp"
            ).fetchall()
            for run in runs:
                self.populate_option_selections(conn, run["run_id"], run["scan_timestamp"])
            selected = conn.execute(
                "SELECT count(*) count FROM oiss.candidate WHERE option_selection->>'state'='SELECTED'"
            ).fetchone()["count"]
        return {"runs": len(runs), "selected_contracts": selected}


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    backfill = sub.add_parser("backfill")
    backfill.add_argument("--start", type=date.fromisoformat)
    backfill.add_argument("--end", type=date.fromisoformat)
    sub.add_parser("scan-latest")
    sub.add_parser("validate")
    sub.add_parser("refresh-options")
    sub.add_parser("scheduler")
    args = parser.parse_args()
    runtime = OissRuntime()
    try:
        if args.command == "backfill":
            result = runtime.backfill(args.start, args.end)
        elif args.command == "scan-latest":
            rows = runtime.source_runs(latest_only=True)
            result = (
                runtime.run_from_source(rows[0])
                if rows
                else {"status": "BLOCKED_DATA", "reason": "No eligible OIIS source run"}
            )
        elif args.command == "validate":
            result = runtime.validate()
        elif args.command == "refresh-options":
            result = runtime.refresh_options()
        else:
            if os.getenv("OISS_V1_202608_SCHEDULER_ENABLED", "0") not in {"1", "true", "TRUE"}:
                LOG.info("OISS scheduler disabled; shadow container remains healthy")
                while True:
                    time.sleep(300)
            while True:
                rows = runtime.source_runs(latest_only=True)
                if rows:
                    runtime.run_from_source(rows[0])
                time.sleep(max(30, int(os.getenv("OISS_POLL_SECONDS", "60"))))
            return
        print(json.dumps(result, indent=2, default=str))
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
