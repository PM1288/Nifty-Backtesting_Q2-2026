from __future__ import annotations

import hashlib
import json
import logging
import math
import uuid
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .model import (
    choose_decision,
    daily_features,
    deterministic_seed,
    direction_entropy,
    implied_volatility,
    percentile_of_history,
    simulate_structure,
    years_to_expiry,
)


LOG = logging.getLogger("fno-volatility")
IST = ZoneInfo("Asia/Kolkata")


class VolatilityService:
    def __init__(self, database_url: str, policy_path: Path) -> None:
        self.policy = json.loads(policy_path.read_text())
        if self.policy.get("environment") != "PAPER" or not self.policy["execution"].get(
            "paper_trading_only"
        ):
            raise RuntimeError("F&O volatility service is PAPER only")
        self.pool = ConnectionPool(database_url, min_size=1, max_size=4, kwargs={"row_factory": dict_row})

    def close(self) -> None:
        self.pool.close()

    def is_trading_day(self, trade_date: date) -> bool:
        with self.pool.connection() as conn:
            row = conn.execute(
                "SELECT is_trading_day FROM public.trading_calendar WHERE trade_date=%s",
                (trade_date,),
            ).fetchone()
        return bool(row and row["is_trading_day"])

    def migrate(self, migration_path: Path) -> dict[str, str]:
        sql = migration_path.read_text()
        checksum = hashlib.sha256(sql.encode()).hexdigest()
        with self.pool.connection() as conn:
            conn.execute(sql)
            existing = conn.execute(
                "SELECT checksum FROM fno_volatility.schema_migration WHERE version='001'"
            ).fetchone()
            if existing and existing["checksum"] != checksum:
                raise RuntimeError("immutable migration 001 checksum mismatch")
            conn.execute(
                "INSERT INTO fno_volatility.schema_migration(version,checksum) VALUES ('001',%s) ON CONFLICT DO NOTHING",
                (checksum,),
            )
            config_hash = hashlib.sha256(
                json.dumps(self.policy, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            conn.execute(
                """INSERT INTO fno_volatility.strategy_version(strategy_id,version,status,config,config_hash)
                   VALUES (%s,%s,'PAPER',%s::jsonb,%s) ON CONFLICT DO NOTHING""",
                (self.policy["strategy_id"], self.policy["version"], json.dumps(self.policy), config_hash),
            )
            stored = conn.execute(
                "SELECT config_hash FROM fno_volatility.strategy_version WHERE strategy_id=%s AND version=%s",
                (self.policy["strategy_id"], self.policy["version"]),
            ).fetchone()
            if not stored or stored["config_hash"] != config_hash:
                raise RuntimeError("immutable strategy configuration hash mismatch")
        return {"version": "001", "checksum": checksum}

    def _latest_source_date(self, conn: Any, trade_date: date) -> date:
        row = conn.execute(
            "SELECT max(trade_date) source_date FROM nse.fact_eod_prices WHERE trade_date < %s AND series='EQ'",
            (trade_date,),
        ).fetchone()
        if not row or not row["source_date"]:
            raise RuntimeError("no completed EOD session exists before trade date")
        return row["source_date"]

    def _universe(self, conn: Any, trade_date: date) -> list[dict[str, Any]]:
        plan_name = self.policy["universe"]["contract_plan"]
        rows = conn.execute(
            """WITH latest_plan AS (
                 SELECT max(plan_date) plan_date FROM public.derivative_token_plan
                 WHERE plan_name=%s AND plan_date<=%s
               ), option_counts AS (
                 SELECT upper(underlying) underlying, min(expiry) FILTER (WHERE expiry >= %s) nearest_option_expiry,
                        count(*) FILTER (WHERE active AND contract_kind='OPTSTK')::int active_option_contracts,
                        count(*) FILTER (WHERE active AND contract_kind='OPTSTK' AND "right"='CE')::int active_calls,
                        count(*) FILTER (WHERE active AND contract_kind='OPTSTK' AND "right"='PE')::int active_puts
                 FROM public.derivative_token_plan p JOIN latest_plan l ON p.plan_date=l.plan_date
                 WHERE p.plan_name=%s GROUP BY upper(underlying)
               ), futures AS (
                 SELECT DISTINCT ON (upper(underlying)) upper(underlying) underlying,
                        symbol_token future_token, expiry future_expiry
                 FROM public.derivative_token_plan p JOIN latest_plan l ON p.plan_date=l.plan_date
                 WHERE p.plan_name=%s AND p.active AND p.contract_kind='FUT' AND p.expiry >= %s
                 ORDER BY upper(underlying), expiry, priority
               ), cash AS (
                 SELECT DISTINCT ON (upper(name)) upper(name) underlying, symbol_token cash_token
                 FROM public.instruments WHERE exchange='NSE'
                   AND (instrumenttype IS NULL OR instrumenttype='' OR instrumenttype='EQ')
                 ORDER BY upper(name), CASE WHEN tradingsymbol LIKE '%%-EQ' THEN 0 ELSE 1 END, updated_at DESC
               )
               SELECT o.underlying,c.cash_token,f.future_token,f.future_expiry,o.nearest_option_expiry,
                      o.active_option_contracts,o.active_calls,o.active_puts
               FROM option_counts o LEFT JOIN cash c USING(underlying) LEFT JOIN futures f USING(underlying)
               WHERE o.active_option_contracts>0 ORDER BY o.underlying""",
            (plan_name, trade_date, trade_date, plan_name, plan_name, trade_date),
        ).fetchall()
        return rows

    def _history(self, conn: Any, symbols: list[str], source_date: date) -> pd.DataFrame:
        rows = conn.execute(
            """SELECT trade_date,upper(symbol) symbol,open_price::float8 open,high_price::float8 high,
                      low_price::float8 low,close_price::float8 close,total_traded_qty::float8 volume
               FROM nse.fact_eod_prices
               WHERE series='EQ' AND upper(symbol)=ANY(%s) AND trade_date<=%s
                 AND trade_date >= %s - interval '550 days'
               ORDER BY symbol,trade_date""",
            (symbols, source_date, source_date),
        ).fetchall()
        return pd.DataFrame(rows)

    def _premarket_predictions(self, history: pd.DataFrame, source_date: date) -> list[dict[str, Any]]:
        minimum = int(self.policy["universe"]["minimum_history_sessions"])
        history_sessions = int(self.policy["universe"]["percentile_history_sessions"])
        weights = self.policy["movement_score"]
        predictions: list[dict[str, Any]] = []
        for symbol, raw in history.groupby("symbol"):
            feature_frame = daily_features(raw.tail(history_sessions + 40)).tail(history_sessions + 1)
            available = len(feature_frame)
            latest = feature_frame.iloc[-1]
            feature_percentiles = {
                "atr": percentile_of_history(feature_frame["atr_pct"]),
                "bb_width": percentile_of_history(feature_frame["bb_width_pct"]),
                "volume_ratio": percentile_of_history(feature_frame["volume_ratio"]),
                "absolute_return": percentile_of_history(feature_frame["abs_return"]),
                "adx": percentile_of_history(feature_frame["adx"]),
            }
            market_proxy = float(np.nanmean([v for v in feature_percentiles.values() if v is not None]))
            score = 100 * (
                weights["atr_percentile_weight"] * (feature_percentiles["atr"] or 0)
                + weights["bollinger_width_percentile_weight"] * (feature_percentiles["bb_width"] or 0)
                + weights["volume_ratio_percentile_weight"] * (feature_percentiles["volume_ratio"] or 0)
                + weights["absolute_return_percentile_weight"] * (feature_percentiles["absolute_return"] or 0)
                + weights["adx_percentile_weight"] * (feature_percentiles["adx"] or 0)
                + weights["market_volatility_percentile_weight"] * market_proxy
            )
            absolute_history = feature_frame["abs_return"].dropna().to_numpy()
            scale = max(0.75, min(1.35, 0.75 + score / 100 * 0.6))
            quantiles = (
                np.quantile(absolute_history, [0.5, 0.75, 0.9]) * scale
                if len(absolute_history)
                else [np.nan] * 3
            )
            positive_rate = float((feature_frame["return"].dropna() > 0).mean()) if available else 0.5
            availability = {
                "history_sessions": available,
                "minimum_history_sessions": minimum,
                "complete": available >= minimum
                and all(value is not None for value in feature_percentiles.values()),
                "india_vix": "UNAVAILABLE_USING_MARKET_ATR_PROXY",
                "sector_breadth": "UNAVAILABLE_IN_MVP_SCORE",
            }
            predictions.append(
                {
                    "underlying": symbol,
                    "source_trade_date": source_date,
                    "move_score_pre": score if availability["complete"] else None,
                    "move_score_live": None,
                    "p50": None if math.isnan(float(quantiles[0])) else float(quantiles[0]),
                    "p75": None if math.isnan(float(quantiles[1])) else float(quantiles[1]),
                    "p90": None if math.isnan(float(quantiles[2])) else float(quantiles[2]),
                    "prob_top": min(0.65, max(0.05, 0.05 + score / 100 * 0.45))
                    if availability["complete"]
                    else None,
                    "prob_up": positive_rate,
                    "entropy": direction_entropy(positive_rate),
                    "opening_gap": None,
                    "opening_range": None,
                    "volume_pace": None,
                    "features": {
                        "atr_14_pct": finite(latest.get("atr_pct")),
                        "bb_width_pct": finite(latest.get("bb_width_pct")),
                        "volume_vs_sma20": finite(latest.get("volume_ratio")),
                        "volume_sma20": finite(latest.get("volume_sma20")),
                        "absolute_previous_return": finite(latest.get("abs_return")),
                        "adx_14": finite(latest.get("adx")),
                        "percentiles": feature_percentiles,
                        "market_volatility_proxy": market_proxy,
                    },
                    "availability": availability,
                }
            )
        valid = sorted(
            [p for p in predictions if p["move_score_pre"] is not None],
            key=lambda value: (-value["move_score_pre"], value["underlying"]),
        )
        rank = {row["underlying"]: index + 1 for index, row in enumerate(valid)}
        shortlist_size = int(self.policy["universe"]["premarket_shortlist_size"])
        for item in predictions:
            item["rank"] = rank.get(item["underlying"])
            item["shortlisted"] = item["rank"] is not None and item["rank"] <= shortlist_size
        return predictions

    def run_premarket(self, trade_date: date, slot: str = "PREMARKET_0830") -> dict[str, Any]:
        decision_as_of = datetime.combine(trade_date, time(8, 30), IST)
        execution = datetime.now(IST)
        with self.pool.connection() as conn:
            source_date = self._latest_source_date(conn, trade_date)
            universe = self._universe(conn, trade_date)
            symbols = [row["underlying"] for row in universe]
            history = self._history(conn, symbols, source_date)
            predictions = self._premarket_predictions(history, source_date)
            run_id = self._start_run(
                conn, trade_date, slot, "PREMARKET", decision_as_of, execution, source_date
            )
            for row in universe:
                data_status = (
                    "FULL"
                    if row["cash_token"] and row["active_calls"] and row["active_puts"]
                    else "CONTRACT_DATA_INCOMPLETE"
                )
                conn.execute(
                    """INSERT INTO fno_volatility.universe_snapshot
                       (run_id,underlying,cash_symbol_token,nearest_future_token,nearest_future_expiry,
                        nearest_option_expiry,active_option_contracts,active_call_contracts,active_put_contracts,data_status,detail)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'{}'::jsonb)""",
                    (
                        run_id,
                        row["underlying"],
                        row["cash_token"],
                        row["future_token"],
                        row["future_expiry"],
                        row["nearest_option_expiry"],
                        row["active_option_contracts"],
                        row["active_calls"],
                        row["active_puts"],
                        data_status,
                    ),
                )
            for item in predictions:
                self._insert_prediction(conn, run_id, item)
            evaluated = sum(item["move_score_pre"] is not None for item in predictions)
            shortlisted = sum(item["shortlisted"] for item in predictions)
            digest = result_digest(predictions)
            status = "COMPLETED" if evaluated else "BLOCKED_DATA"
            conn.execute(
                """UPDATE fno_volatility.signal_run SET status=%s,requested_underlyings=%s,evaluated_underlyings=%s,
                   shortlisted_underlyings=%s,data_quality=%s::jsonb,result_hash=%s,completed_at=now() WHERE run_id=%s""",
                (
                    status,
                    len(universe),
                    evaluated,
                    shortlisted,
                    json.dumps({"universe_contract_coverage": len(universe), "history_rows": len(history)}),
                    digest,
                    run_id,
                ),
            )
            self._heartbeat(
                conn, "fno-volatility-premarket", status, {"run_id": str(run_id), "evaluated": evaluated}
            )
            return {
                "run_id": str(run_id),
                "status": status,
                "trade_date": str(trade_date),
                "source_date": str(source_date),
                "universe": len(universe),
                "evaluated": evaluated,
                "shortlisted": shortlisted,
                "result_hash": digest,
            }

    def run_live(
        self, trade_date: date, decision_as_of: datetime | None = None, slot: str = "LIVE_MANUAL"
    ) -> dict[str, Any]:
        decision_as_of = decision_as_of or datetime.now(IST)
        if decision_as_of.tzinfo is None:
            decision_as_of = decision_as_of.replace(tzinfo=IST)
        execution = datetime.now(IST)
        with self.pool.connection() as conn:
            pre = conn.execute(
                """SELECT run_id,source_eod_date FROM fno_volatility.signal_run WHERE trade_date=%s AND stage='PREMARKET'
                   AND status IN ('COMPLETED','BLOCKED_DATA') ORDER BY completed_at DESC LIMIT 1""",
                (trade_date,),
            ).fetchone()
            if not pre:
                self.run_premarket(trade_date)
                pre = conn.execute(
                    "SELECT run_id,source_eod_date FROM fno_volatility.signal_run WHERE trade_date=%s AND stage='PREMARKET' ORDER BY completed_at DESC LIMIT 1",
                    (trade_date,),
                ).fetchone()
            pre_rows = conn.execute(
                "SELECT * FROM fno_volatility.movement_prediction WHERE run_id=%s ORDER BY movement_rank NULLS LAST",
                (pre["run_id"],),
            ).fetchall()
            universe = self._universe(conn, trade_date)
            run_id = self._start_run(
                conn, trade_date, slot, "LIVE", decision_as_of, execution, pre["source_eod_date"]
            )
            universe_by_symbol = {row["underlying"]: row for row in universe}
            live_predictions = self._live_predictions(
                conn, pre_rows, universe_by_symbol, trade_date, decision_as_of
            )
            for item in live_predictions:
                self._insert_prediction(conn, run_id, item)
            live_ranked = [item for item in live_predictions if item["shortlisted"]]
            signals: list[dict[str, Any]] = []
            for item in live_ranked:
                candidates = self._option_candidates(
                    conn, run_id, item, universe_by_symbol[item["underlying"]], decision_as_of
                )
                signals.append(self._persist_signal(conn, run_id, item, candidates))
            actionable = sum(signal["decision"] != "NO_TRADE" for signal in signals)
            digest = result_digest({"predictions": live_predictions, "signals": signals})
            status = "COMPLETED" if live_ranked else "BLOCKED_DATA"
            latest = conn.execute(
                "SELECT max(ts) minute_ts,(SELECT max(coalesce(exch_feed_time,ts)) FROM public.quote_snapshots) quote_ts FROM public.bars_1m"
            ).fetchone()
            conn.execute(
                """UPDATE fno_volatility.signal_run SET status=%s,requested_underlyings=%s,evaluated_underlyings=%s,
                   shortlisted_underlyings=%s,actionable_signals=%s,source_minute_ts=%s,source_quote_ts=%s,
                   data_quality=%s::jsonb,result_hash=%s,completed_at=now() WHERE run_id=%s""",
                (
                    status,
                    len(universe),
                    len(live_predictions),
                    len(live_ranked),
                    actionable,
                    latest["minute_ts"],
                    latest["quote_ts"],
                    json.dumps(
                        {
                            "market_session": market_session_status(trade_date, decision_as_of),
                            "option_gate": "TWO_SIDED_QUOTES_REQUIRED",
                        }
                    ),
                    digest,
                    run_id,
                ),
            )
            result = {
                "run_id": str(run_id),
                "status": status,
                "trade_date": str(trade_date),
                "decision_as_of": decision_as_of.isoformat(),
                "universe": len(universe),
                "live_shortlist": len(live_ranked),
                "actionable": actionable,
                "signals": signals,
                "result_hash": digest,
            }
            self._heartbeat(conn, "fno-volatility-live", status, result)
            return result

    def _live_predictions(
        self,
        conn: Any,
        pre_rows: list[dict[str, Any]],
        universe: dict[str, dict[str, Any]],
        trade_date: date,
        as_of: datetime,
    ) -> list[dict[str, Any]]:
        weights = self.policy["movement_score"]
        candidates = [row for row in pre_rows if row["shortlisted"]]
        raw: list[dict[str, Any]] = []
        for row in candidates:
            underlying = row["underlying"]
            token = universe.get(underlying, {}).get("cash_token")
            bars = (
                conn.execute(
                    """SELECT ts,open::float8,high::float8,low::float8,close::float8,volume::float8
              FROM public.bars_1m WHERE exchange='NSE' AND symbol_token=%s AND ts >= %s AND ts <= %s ORDER BY ts""",
                    (token, datetime.combine(trade_date, time(9, 15), IST), as_of),
                ).fetchall()
                if token
                else []
            )
            features = dict(row["features"])
            availability = dict(row["feature_availability"])
            gap = opening_range = volume_pace = None
            if bars:
                first = bars[0]
                latest = bars[-1]
                previous_close = conn.execute(
                    "SELECT close_price::float8 close FROM nse.fact_eod_prices WHERE upper(symbol)=%s AND trade_date<%s AND series='EQ' ORDER BY trade_date DESC LIMIT 1",
                    (underlying, trade_date),
                ).fetchone()
                if previous_close and previous_close["close"]:
                    gap = abs(first["open"] / previous_close["close"] - 1)
                opening_range = (
                    (max(bar["high"] for bar in bars) - min(bar["low"] for bar in bars)) / first["open"]
                    if first["open"]
                    else None
                )
                average_daily_volume = finite(features.get("volume_sma20"))
                expected_fraction = max(len(bars) / 375, 1 / 375)
                volume_pace = (
                    (sum(bar["volume"] for bar in bars) / expected_fraction) / average_daily_volume
                    if average_daily_volume and average_daily_volume > 0
                    else None
                )
                availability["opening_bars"] = len(bars)
                availability["latest_opening_bar_ts"] = latest["ts"].isoformat()
                availability["opening_bar_age_seconds"] = int((as_of - latest["ts"]).total_seconds())
            else:
                availability["opening_bars"] = 0
            raw.append(
                {
                    "base": row,
                    "gap": gap,
                    "opening_range": opening_range,
                    "volume_pace": volume_pace,
                    "features": features,
                    "availability": availability,
                }
            )
        for key in ("gap", "opening_range", "volume_pace"):
            vals = [item[key] for item in raw if item[key] is not None]
            for item in raw:
                item[key + "_pct"] = (
                    float(sum(v <= item[key] for v in vals) / len(vals))
                    if item[key] is not None and vals
                    else None
                )
        result = []
        for item in raw:
            base = item["base"]
            opening_bars = int(item["availability"].get("opening_bars", 0))
            bar_age = item["availability"].get("opening_bar_age_seconds")
            complete = (
                all(item[key] is not None for key in ("gap", "opening_range", "volume_pace"))
                and opening_bars >= int(self.policy["market_data"]["minimum_opening_bars"])
                and bar_age is not None
                and 0 <= bar_age <= int(self.policy["market_data"]["maximum_source_bar_age_seconds"])
            )
            item["availability"]["live_features_complete"] = complete
            live_score = (
                (
                    weights["live_pre_score_weight"] * float(base["move_score_pre"] or 0)
                    + 100
                    * (
                        weights["gap_percentile_weight"] * (item["gap_pct"] or 0)
                        + weights["opening_range_percentile_weight"] * (item["opening_range_pct"] or 0)
                        + weights["volume_pace_percentile_weight"] * (item["volume_pace_pct"] or 0)
                    )
                )
                if complete
                else None
            )
            result.append(
                {
                    "underlying": base["underlying"],
                    "source_trade_date": base["source_trade_date"],
                    "move_score_pre": float(base["move_score_pre"])
                    if base["move_score_pre"] is not None
                    else None,
                    "move_score_live": live_score,
                    "p50": float(base["predicted_abs_move_p50"])
                    if base["predicted_abs_move_p50"] is not None
                    else None,
                    "p75": float(base["predicted_abs_move_p75"])
                    if base["predicted_abs_move_p75"] is not None
                    else None,
                    "p90": float(base["predicted_abs_move_p90"])
                    if base["predicted_abs_move_p90"] is not None
                    else None,
                    "prob_top": float(base["probability_top_quintile"])
                    if base["probability_top_quintile"] is not None
                    else None,
                    "prob_up": float(base["probability_up"]) if base["probability_up"] is not None else None,
                    "entropy": float(base["direction_entropy"])
                    if base["direction_entropy"] is not None
                    else None,
                    "opening_gap": item["gap"],
                    "opening_range": item["opening_range"],
                    "volume_pace": item["volume_pace"],
                    "features": item["features"],
                    "availability": item["availability"],
                    "rank": None,
                    "shortlisted": False,
                }
            )
        valid = sorted(
            [row for row in result if row["move_score_live"] is not None],
            key=lambda x: (-x["move_score_live"], x["underlying"]),
        )
        live_size = int(self.policy["universe"]["live_shortlist_size"])
        for rank, row in enumerate(valid, 1):
            row["rank"] = rank
            row["shortlisted"] = rank <= live_size
        return result

    def _option_candidates(
        self,
        conn: Any,
        run_id: uuid.UUID,
        prediction: dict[str, Any],
        universe: dict[str, Any],
        as_of: datetime,
    ) -> list[dict[str, Any]]:
        underlying = prediction["underlying"]
        session_status = market_session_status(as_of.date(), as_of)
        expiry = universe.get("nearest_option_expiry")
        contracts = (
            conn.execute(
                """SELECT s.symbol_token,s.tradingsymbol,s.strike::float8,s."right",coalesce(i.lotsize,1) lotsize
          FROM public.subscriptions s LEFT JOIN public.instruments i
            ON i.exchange=s.exchange AND i.symbol_token=s.symbol_token
          WHERE s.active AND s.kind='OPTSTK' AND upper(s.underlying)=%s AND s.expiry=%s
          ORDER BY s.strike,s."right" """,
                (underlying, expiry),
            ).fetchall()
            if expiry
            else []
        )
        spot = self._latest_quote(conn, universe.get("cash_token"), as_of)
        future = self._latest_quote(conn, universe.get("future_token"), as_of)
        reference = (future or spot or {}).get("ltp")
        if not reference or not contracts:
            return [
                self._persist_empty_candidate(
                    conn, run_id, prediction, expiry, "UNDERLYING_OR_CONTRACT_DATA_MISSING"
                )
            ]
        strikes = sorted({float(row["strike"]) for row in contracts})
        atm = min(strikes, key=lambda value: abs(value - reference))
        atm_index = strikes.index(atm)
        structures = [("ATM_STRADDLE", atm, atm)]
        if atm_index > 0 and atm_index < len(strikes) - 1:
            structures.append(("NARROW_STRANGLE", strikes[atm_index + 1], strikes[atm_index - 1]))
        if atm_index > 1 and atm_index < len(strikes) - 2:
            structures.append(("MEDIUM_STRANGLE", strikes[atm_index + 2], strikes[atm_index - 2]))
        output = []
        for structure, call_strike, put_strike in structures:
            call = next(
                (row for row in contracts if float(row["strike"]) == call_strike and row["right"] == "CE"),
                None,
            )
            put = next(
                (row for row in contracts if float(row["strike"]) == put_strike and row["right"] == "PE"),
                None,
            )
            if not call or not put:
                continue
            call_quote = self._latest_quote(conn, call["symbol_token"], as_of)
            put_quote = self._latest_quote(conn, put["symbol_token"], as_of)
            output.append(
                self._value_candidate(
                    conn,
                    run_id,
                    prediction,
                    structure,
                    expiry,
                    call,
                    put,
                    call_quote,
                    put_quote,
                    spot,
                    future,
                    as_of,
                    session_status,
                )
            )
        return output or [
            self._persist_empty_candidate(conn, run_id, prediction, expiry, "COMPLETE_CE_PE_PAIR_MISSING")
        ]

    def _latest_quote(self, conn: Any, token: str | None, as_of: datetime) -> dict[str, Any] | None:
        if not token:
            return None
        return conn.execute(
            """SELECT ts,coalesce(exch_feed_time,exch_trade_time,ts) source_ts,
          ltp::float8,bid::float8,ask::float8,bid_qty,ask_qty,volume,oi
          FROM public.quote_snapshots WHERE symbol_token=%s AND ts<=%s ORDER BY ts DESC LIMIT 1""",
            (token, as_of),
        ).fetchone()

    def _value_candidate(
        self,
        conn: Any,
        run_id: uuid.UUID,
        prediction: dict[str, Any],
        structure: str,
        expiry: date,
        call: dict[str, Any],
        put: dict[str, Any],
        call_q: dict[str, Any] | None,
        put_q: dict[str, Any] | None,
        spot_q: dict[str, Any] | None,
        future_q: dict[str, Any] | None,
        as_of: datetime,
        session_status: str,
    ) -> dict[str, Any]:
        reasons = []
        data_status = "FULL"
        if session_status != "OPEN":
            reasons.append("MARKET_SESSION_NOT_OPEN")
        if not call_q or not put_q:
            reasons.append("OPTION_QUOTE_MISSING")
        source_times = [q["source_ts"] for q in (call_q, put_q) if q and q.get("source_ts")]
        source_as_of = min(source_times) if len(source_times) == 2 else None
        age = int((as_of - source_as_of).total_seconds()) if source_as_of else None
        if age is None or age < 0 or age > int(self.policy["market_data"]["maximum_quote_age_seconds"]):
            reasons.append("OPTION_QUOTE_STALE")
        values = [
            call_q.get("bid") if call_q else None,
            call_q.get("ask") if call_q else None,
            put_q.get("bid") if put_q else None,
            put_q.get("ask") if put_q else None,
        ]
        if any(value is None or value <= 0 for value in values):
            reasons.append("TWO_SIDED_QUOTE_UNAVAILABLE")
        if reasons:
            data_status = reasons[0]
        spot = float((future_q or spot_q or {}).get("ltp") or 0)
        entry = (
            (call_q["ask"] + put_q["ask"])
            if not any(
                value is None
                for value in (call_q.get("ask") if call_q else None, put_q.get("ask") if put_q else None)
            )
            else None
        )
        bid = (
            (call_q["bid"] + put_q["bid"])
            if not any(
                value is None
                for value in (call_q.get("bid") if call_q else None, put_q.get("bid") if put_q else None)
            )
            else None
        )
        spread = (entry - bid) / entry if entry and bid is not None else None
        years_entry = years_to_expiry(expiry, as_of)
        exit_time = datetime.combine(as_of.date(), time(15, 15), IST)
        years_exit = years_to_expiry(expiry, max(as_of, exit_time))
        rate = float(self.policy["option_gate"]["risk_free_rate"])
        dividend = float(self.policy["option_gate"]["dividend_yield"])
        call_iv = (
            implied_volatility(
                (call_q.get("ask") if call_q else 0) or 0,
                spot,
                float(call["strike"]),
                years_entry,
                rate,
                "CE",
                dividend,
            )
            if spot
            else None
        )
        put_iv = (
            implied_volatility(
                (put_q.get("ask") if put_q else 0) or 0,
                spot,
                float(put["strike"]),
                years_entry,
                rate,
                "PE",
                dividend,
            )
            if spot
            else None
        )
        predicted_iv_change = None
        scenario = None
        if call_iv and put_iv and prediction["p50"] and entry:
            realized_annual = float(prediction["p50"]) * math.sqrt(252)
            predicted_iv_change = max(-0.20, min(0.20, 0.15 * (realized_annual - (call_iv + put_iv) / 2)))
            scenario = simulate_structure(
                spot=spot,
                call_strike=float(call["strike"]),
                put_strike=float(put["strike"]),
                call_ask=call_q["ask"],
                put_ask=put_q["ask"],
                call_iv=call_iv,
                put_iv=put_iv,
                years_entry=years_entry,
                years_exit=years_exit,
                predicted_abs_move_p50=prediction["p50"],
                predicted_iv_change=predicted_iv_change,
                rate=rate,
                dividend_yield=dividend,
                costs_fraction=float(self.policy["option_gate"]["charges_and_slippage_fraction"]),
                scenario_count=int(self.policy["option_gate"]["scenario_count"]),
                seed=deterministic_seed([str(run_id), prediction["underlying"], structure]),
            )
        implied = entry / spot if entry and spot else None
        ratio = prediction["p75"] / implied if implied and prediction["p75"] else None
        decision, gate_reasons = choose_decision(
            structure_type=structure,
            forecast_implied_ratio=ratio,
            expected_return=scenario.expected_return if scenario else None,
            probability_profit=scenario.probability_profit if scenario else None,
            entropy=prediction["entropy"],
            combined_spread_pct=spread,
            data_status=data_status,
            policy=self.policy["option_gate"],
        )
        all_reasons = list(dict.fromkeys(reasons + gate_reasons))
        candidate_id = uuid.uuid4()
        conn.execute(
            """INSERT INTO fno_volatility.option_candidate(candidate_id,run_id,underlying,structure_type,expiry,
          call_token,call_symbol,call_strike,put_token,put_symbol,put_strike,lot_size,spot_price,futures_price,call_bid,call_ask,put_bid,put_ask,
          combined_entry_ask,combined_mark_bid,combined_spread_pct,implied_move_pct,call_iv,put_iv,predicted_iv_change,forecast_implied_ratio,
          expected_return_pct,probability_profit,pnl_p10,pnl_p50,pnl_p90,expected_shortfall_95,greek_edge_pct,quote_as_of,quote_source_as_of,
          quote_age_seconds,data_status,rejection_reasons,scenario_summary)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)""",
            (
                candidate_id,
                run_id,
                prediction["underlying"],
                structure,
                expiry,
                call["symbol_token"],
                call["tradingsymbol"],
                call["strike"],
                put["symbol_token"],
                put["tradingsymbol"],
                put["strike"],
                call["lotsize"],
                spot_q.get("ltp") if spot_q else None,
                future_q.get("ltp") if future_q else None,
                call_q.get("bid") if call_q else None,
                call_q.get("ask") if call_q else None,
                put_q.get("bid") if put_q else None,
                put_q.get("ask") if put_q else None,
                entry,
                bid,
                spread,
                implied,
                call_iv,
                put_iv,
                predicted_iv_change,
                ratio,
                scenario.expected_return if scenario else None,
                scenario.probability_profit if scenario else None,
                scenario.pnl_p10 if scenario else None,
                scenario.pnl_p50 if scenario else None,
                scenario.pnl_p90 if scenario else None,
                scenario.expected_shortfall_95 if scenario else None,
                scenario.greek_edge if scenario else None,
                as_of,
                source_as_of,
                age,
                data_status,
                json.dumps(all_reasons),
                json.dumps(
                    {
                        "decision": decision,
                        "model": "JOINT_RETURN_IV_MONTE_CARLO_PROXY_V1",
                        "scenario_count": self.policy["option_gate"]["scenario_count"],
                    }
                ),
            ),
        )
        return {
            "candidate_id": str(candidate_id),
            "structure": structure,
            "decision": decision,
            "reasons": all_reasons,
            "expected_return": scenario.expected_return if scenario else None,
            "probability_profit": scenario.probability_profit if scenario else None,
            "forecast_implied_ratio": ratio,
            "spread": spread,
            "data_status": data_status,
        }

    def _persist_empty_candidate(
        self, conn: Any, run_id: uuid.UUID, prediction: dict[str, Any], expiry: date | None, reason: str
    ) -> dict[str, Any]:
        return {
            "candidate_id": None,
            "structure": None,
            "decision": "NO_TRADE",
            "reasons": [reason],
            "expected_return": None,
            "probability_profit": None,
            "forecast_implied_ratio": None,
            "spread": None,
            "data_status": reason,
        }

    def _persist_signal(
        self, conn: Any, run_id: uuid.UUID, prediction: dict[str, Any], candidates: list[dict[str, Any]]
    ) -> dict[str, Any]:
        ordered = sorted(
            candidates,
            key=lambda value: (value["decision"] == "NO_TRADE", -(value["expected_return"] or -999)),
        )
        best = ordered[0]
        decision = best["decision"]
        reasons = best["reasons"] if decision == "NO_TRADE" else ["ALL_OPTION_VALUE_GATES_PASSED"]
        signal_id = uuid.uuid4()
        confidence = (
            "MEDIUM"
            if decision != "NO_TRADE"
            else "NOT_ESTIMABLE"
            if best["data_status"] != "FULL"
            else "LOW"
        )
        conn.execute(
            """INSERT INTO fno_volatility.trade_signal(signal_id,run_id,candidate_id,underlying,decision,confidence,rank,reason_codes)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)""",
            (
                signal_id,
                run_id,
                best["candidate_id"],
                prediction["underlying"],
                decision,
                confidence,
                prediction["rank"],
                json.dumps(reasons),
            ),
        )
        return {
            "signal_id": str(signal_id),
            "underlying": prediction["underlying"],
            "decision": decision,
            "confidence": confidence,
            "candidate": best,
        }

    def _start_run(
        self,
        conn: Any,
        trade_date: date,
        slot: str,
        stage: str,
        decision: datetime,
        execution: datetime,
        source_date: date,
    ) -> uuid.UUID:
        existing = conn.execute(
            "SELECT run_id FROM fno_volatility.signal_run WHERE strategy_id=%s AND strategy_version=%s AND trade_date=%s AND run_slot=%s AND stage=%s",
            (self.policy["strategy_id"], self.policy["version"], trade_date, slot, stage),
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM fno_volatility.trade_signal WHERE run_id=%s", (existing["run_id"],))
            conn.execute("DELETE FROM fno_volatility.option_candidate WHERE run_id=%s", (existing["run_id"],))
            conn.execute(
                "DELETE FROM fno_volatility.movement_prediction WHERE run_id=%s", (existing["run_id"],)
            )
            conn.execute(
                "DELETE FROM fno_volatility.universe_snapshot WHERE run_id=%s", (existing["run_id"],)
            )
            run_id = existing["run_id"]
            conn.execute(
                "UPDATE fno_volatility.signal_run SET status='RUNNING',decision_as_of=%s,execution_timestamp=%s,source_eod_date=%s,started_at=now(),completed_at=NULL,error_detail=NULL WHERE run_id=%s",
                (decision, execution, source_date, run_id),
            )
            return run_id
        run_id = uuid.uuid4()
        conn.execute(
            """INSERT INTO fno_volatility.signal_run(run_id,strategy_id,strategy_version,trade_date,run_slot,decision_as_of,execution_timestamp,stage,status,source_eod_date)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'RUNNING',%s)""",
            (
                run_id,
                self.policy["strategy_id"],
                self.policy["version"],
                trade_date,
                slot,
                decision,
                execution,
                stage,
                source_date,
            ),
        )
        return run_id

    def _insert_prediction(self, conn: Any, run_id: uuid.UUID, item: dict[str, Any]) -> None:
        conn.execute(
            """INSERT INTO fno_volatility.movement_prediction(run_id,underlying,source_trade_date,movement_rank,move_score_pre,move_score_live,predicted_abs_move_p50,predicted_abs_move_p75,predicted_abs_move_p90,probability_top_quintile,probability_up,direction_entropy,opening_gap_pct,opening_range_pct,opening_volume_pace,features,feature_availability,shortlisted,model_kind)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s)""",
            (
                run_id,
                item["underlying"],
                item["source_trade_date"],
                item["rank"],
                item["move_score_pre"],
                item["move_score_live"],
                item["p50"],
                item["p75"],
                item["p90"],
                item["prob_top"],
                item["prob_up"],
                item["entropy"],
                item["opening_gap"],
                item["opening_range"],
                item["volume_pace"],
                json.dumps(item["features"], default=str),
                json.dumps(item["availability"], default=str),
                item["shortlisted"],
                self.policy["model_kind"],
            ),
        )

    def _heartbeat(self, conn: Any, name: str, status: str, detail: dict[str, Any]) -> None:
        success = status == "COMPLETED"
        conn.execute(
            """INSERT INTO fno_volatility.service_heartbeat(service_name,status,detail,last_success_at,last_error_at)
          VALUES (%s,%s,%s::jsonb,CASE WHEN %s THEN now() END,CASE WHEN %s THEN NULL ELSE now() END)
          ON CONFLICT(service_name) DO UPDATE SET status=excluded.status,detail=excluded.detail,
          last_success_at=CASE WHEN %s THEN now() ELSE fno_volatility.service_heartbeat.last_success_at END,
          last_error_at=CASE WHEN %s THEN fno_volatility.service_heartbeat.last_error_at ELSE now() END,updated_at=now()""",
            (name, status, json.dumps(detail, default=str), success, success, success, success),
        )


def market_session_status(trade_date: date, as_of: datetime) -> str:
    local = as_of.astimezone(IST)
    if local.date() != trade_date or local.weekday() >= 5:
        return "CLOSED"
    if local.time() < time(9, 15):
        return "PREOPEN"
    if local.time() > time(15, 30):
        return "CLOSED"
    return "OPEN"


def finite(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def result_digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str, separators=(",", ":")).encode()
    ).hexdigest()
