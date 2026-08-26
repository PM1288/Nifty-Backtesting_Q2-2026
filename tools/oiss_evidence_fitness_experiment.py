#!/usr/bin/env python3
"""Offline, non-mutating OISS evidence fitness experiment.

Reads the immutable OISS handoff CSVs plus an optional point-in-time one-minute
bar export. It never connects to, writes to, or updates production tables.
"""

from __future__ import annotations

import argparse
import bisect
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from scipy.stats import spearmanr


IST = ZoneInfo("Asia/Kolkata")
ACTIONABLE = {"BUY NOW", "SELL NOW"}
DEVELOPING = {"WAIT FOR PULLBACK", "WAIT FOR BREAKOUT", "WAIT FOR FAILED BOUNCE", "WATCH", "SCALE IN"}
HORIZONS = ("BTST", "STBT", "H2", "H3", "H4")


def jload(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def number(value: Any) -> float | None:
    if value in (None, "", "null", "None"):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def integer(value: Any) -> int | None:
    parsed = number(value)
    return int(parsed) if parsed is not None else None


def dt(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00").replace("+00", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("UTC"))


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def pct_return(entry: float, value: float, direction: str) -> float:
    if direction == "SHORT":
        return 100.0 * (entry / value - 1.0)
    return 100.0 * (value / entry - 1.0)


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str] | None = None) -> tuple[int, list[str]]:
    materialized = list(rows)
    if fields is None:
        fields = []
        seen = set()
        for row in materialized:
            for field in row:
                if field not in seen:
                    seen.add(field)
                    fields.append(field)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(materialized)
    return len(materialized), fields


def median(values: Iterable[float | None]) -> float | None:
    clean = [value for value in values if value is not None and math.isfinite(value)]
    return statistics.median(clean) if clean else None


def mean(values: Iterable[float | None]) -> float | None:
    clean = [value for value in values if value is not None and math.isfinite(value)]
    return statistics.fmean(clean) if clean else None


def state(value: Any, *, stale: bool = False, unsafe: bool = False) -> str:
    if unsafe:
        return "UNSAFE_FOR_HISTORICAL_REPLAY"
    if value in (None, "", [], {}):
        return "MISSING"
    return "STALE" if stale else "AVAILABLE"


@dataclass
class Bars:
    timestamps: list[datetime]
    opens: list[float]
    highs: list[float]
    lows: list[float]
    closes: list[float]
    volumes: list[int]


def load_bars(path: Path) -> dict[str, Bars]:
    staged: dict[str, dict[str, list[Any]]] = defaultdict(lambda: defaultdict(list))
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            prices = {name: number(row.get(name)) for name in ("open", "high", "low", "close")}
            if any(value is None or value <= 0 for value in prices.values()):
                continue
            symbol = row["symbol"].upper()
            staged[symbol]["timestamps"].append(dt(row["ts"]))
            for name in ("open", "high", "low", "close"):
                staged[symbol][f"{name}s"].append(prices[name])
            staged[symbol]["volumes"].append(int(row.get("volume") or 0))
    result: dict[str, Bars] = {}
    for symbol, values in staged.items():
        order = sorted(range(len(values["timestamps"])), key=values["timestamps"].__getitem__)
        result[symbol] = Bars(**{key: [values[key][i] for i in order] for key in Bars.__annotations__})
    return result


def load_outcomes(path: Path) -> dict[str, dict[str, Any]]:
    outcomes = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            returns = jload(row.get("returns"), {})
            extrema = jload(row.get("extrema"), {})
            outcomes[row["candidate_id"]] = {
                "outcome_state": row.get("outcome_state"),
                "observed_through": row.get("observed_through"),
                **{f"return_{key.lower()}": number(returns.get(key)) for key in ("D1", "D2", "D3", "D4", "D5")},
                "mfe_d5": number(extrema.get("MFE_PCT")),
                "mae_d5": number(extrema.get("MAE_PCT")),
            }
    return outcomes


def load_decisions(path: Path, outcomes: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    decisions: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            snapshot = jload(row.get("feature_snapshot"), {})
            feature = snapshot.get("feature") or {}
            source = snapshot.get("source_evidence") or {}
            xdetail = source.get("xfactor") or snapshot.get("xfactor_components") or {}
            if "components" not in xdetail and isinstance(source.get("xfactor"), dict):
                xdetail = source["xfactor"]
            entry = jload(row.get("entry_plan"), {})
            option = jload(row.get("option_selection"), {})
            sizing = jload(row.get("position_sizing"), {})
            horizons = jload(row.get("horizon_scores"), {})
            rejection = jload(row.get("rejection"), {})
            hard_gates = xdetail.get("hard_gates") or rejection.get("failed_gate") or []
            if isinstance(hard_gates, str):
                hard_gates = [hard_gates]
            as_of = dt(row.get("as_of") or row.get("scan_timestamp"))
            quote_at = dt(option.get("quote_as_of"))
            quote_age_minutes = (as_of - quote_at).total_seconds() / 60 if as_of and quote_at else None
            record = {
                "candidate_id": row["candidate_id"],
                "run_id": row["run_id"],
                "run_date": row["run_date"],
                "scan_timestamp": row["scan_timestamp"],
                "scan_sequence": integer(row.get("scan_sequence")),
                "as_of": as_of,
                "symbol": row["symbol"].upper(),
                "company_name": row.get("company_name"),
                "sector": row.get("sector") or "UNCLASSIFIED",
                "direction": row.get("direction") or "LONG",
                "run_dq": row.get("run_data_quality_grade"),
                "candidate_dq": row.get("data_quality_grade"),
                "candidate_dq_score": number(row.get("data_quality_score")),
                "ofactor": number(row.get("ofactor")),
                "xfactor": number(row.get("xfactor")),
                "tqs": number(row.get("tqs")),
                "extension_atr": number(row.get("extension_atr")),
                "extension_state": row.get("extension_state"),
                "canonical_status": row.get("canonical_status"),
                "selected": row.get("selected", "").lower() in {"true", "t", "1"},
                "setup": entry.get("setup"),
                "trigger": entry.get("trigger"),
                "setup_valid": bool(entry.get("setup") and entry.get("stop") is not None),
                "hard_gates": hard_gates,
                "source_rr": number(xdetail.get("reward_risk")),
                "synthetic_rr_1": number(entry.get("rr_1")),
                "entry": number(entry.get("entry_zone_high")),
                "entry_low": number(entry.get("entry_zone_low")),
                "stop": number(entry.get("stop")),
                "target_1": number(entry.get("target_1")),
                "target_2": number(entry.get("target_2")),
                "option_state": option.get("state"),
                "option_moneyness": option.get("moneyness"),
                "option_spread_pct": number(option.get("spread_pct")),
                "option_quote_age_minutes": quote_age_minutes,
                "option_delta": number(option.get("delta")),
                "option_premium": number(option.get("premium")),
                "option_bid": number(option.get("bid")),
                "option_ask": number(option.get("ask")),
                "option_oi": integer(option.get("open_interest")),
                "option_volume": integer(option.get("volume")),
                "option_lot_size": integer(option.get("lot_size") or sizing.get("verified_option_lot_size")),
                "position_state": sizing.get("state"),
                "final_lots": integer(sizing.get("final_lots")),
                "risk_per_unit": number(sizing.get("risk_per_unit")),
                "risk_per_lot": number(sizing.get("risk_per_lot")),
                "option_capital_per_lot": number(sizing.get("option_capital_per_lot")),
                "close": number(feature.get("close_price")),
                "high": number(feature.get("high_price")),
                "low": number(feature.get("low_price")),
                "open": number(feature.get("open_price")),
                "prev_close": number(feature.get("prev_close")),
                "atr14": number(feature.get("atr14")),
                "vwap": number(feature.get("session_vwap")),
                "prior_high_20": number(feature.get("prior_high_20")),
                "prior_low_20": number(feature.get("prior_low_20")),
                "close_location": number(feature.get("close_location")),
                "return_1d": number(feature.get("return_1d_pct")),
                "return_5d": number(feature.get("return_5d_pct")),
                "return_21d": number(feature.get("return_21d_pct")),
                "return_63d": number(feature.get("return_63d_pct")),
                "sector_return_21d": number(feature.get("sector_return_21d_pct")),
                "nifty_return_21d": number(feature.get("nifty_return_21d_pct")),
                "volume_ratio_20": number(feature.get("volume_ratio_20")),
                "rsi14": number(feature.get("rsi_14")),
                "nifty_trend": feature.get("nifty_trend"),
                "banknifty_trend": feature.get("bank_nifty_trend"),
                "vix_regime": feature.get("vix_regime"),
                "session_bar_coverage": number(feature.get("session_bar_coverage")),
                "session_bar_age_minutes": number(feature.get("session_latest_bar_age_minutes")),
                "source_reliability": number(feature.get("source_reliability")),
                "horizons": horizons,
                **outcomes.get(row["candidate_id"], {}),
            }
            decisions.append(record)
    decisions.sort(key=lambda item: (item["as_of"] or datetime.min.replace(tzinfo=ZoneInfo("UTC")), item["symbol"]))
    return decisions


def minute_path(record: dict[str, Any], bars_by_symbol: dict[str, Bars]) -> dict[str, Any]:
    base = {
        "candidate_id": record["candidate_id"], "run_id": record["run_id"], "symbol": record["symbol"],
        "direction": record["direction"], "decision_timestamp": record["scan_timestamp"],
        "entry": record["entry"], "stop": record["stop"], "target_1": record["target_1"], "target_2": record["target_2"],
        "path_basis": "DECISION_TIMESTAMP_USING_PLANNED_ENTRY_NOT_FILL_PRICE",
        "entry_touch_observed": None, "entry_touch_time": None, "bars_observed": None,
        "return_15m": None, "return_30m": None, "return_60m": None, "return_eod": None,
        "mfe_15m": None, "mae_15m": None, "mfe_30m": None, "mae_30m": None,
        "mfe_60m": None, "mae_60m": None, "mfe_eod": None, "mae_eod": None,
        "time_to_mfe_minutes": None, "time_to_mae_minutes": None,
        "target_1_hit_time": None, "stop_hit_time": None, "event_order": None, "same_bar_ambiguous": None,
    }
    bars = bars_by_symbol.get(record["symbol"])
    start = record["as_of"]
    entry = record["entry"]
    if not bars or not start or not entry or entry <= 0:
        return {**base, "path_state": "DATA_INSUFFICIENT"}
    idx = bisect.bisect_right(bars.timestamps, start)
    if idx >= len(bars.timestamps):
        return {**base, "path_state": "DATA_INSUFFICIENT"}
    local_day = start.astimezone(IST).date()
    end = datetime.combine(local_day, datetime.min.time(), IST).replace(hour=15, minute=30).astimezone(start.tzinfo)
    last = bisect.bisect_right(bars.timestamps, end)
    if last <= idx:
        return {**base, "path_state": "DATA_INSUFFICIENT"}
    result: dict[str, Any] = {**base, "path_state": "AVAILABLE", "bars_observed": last - idx}
    touch = next((i for i in range(idx, last) if bars.lows[i] <= entry <= bars.highs[i]), None)
    result["entry_touch_observed"] = touch is not None
    result["entry_touch_time"] = bars.timestamps[touch].isoformat() if touch is not None else None
    for minutes in (15, 30, 60):
        cutoff = start + timedelta(minutes=minutes)
        point = bisect.bisect_right(bars.timestamps, cutoff, idx, last) - 1
        result[f"return_{minutes}m"] = pct_return(entry, bars.closes[point], record["direction"]) if point >= idx else None
        segment_end = min(last, point + 1) if point >= idx else idx
        if segment_end > idx:
            highs, lows = bars.highs[idx:segment_end], bars.lows[idx:segment_end]
            if record["direction"] == "SHORT":
                result[f"mfe_{minutes}m"] = 100 * (entry / min(lows) - 1)
                result[f"mae_{minutes}m"] = 100 * (entry / max(highs) - 1)
            else:
                result[f"mfe_{minutes}m"] = 100 * (max(highs) / entry - 1)
                result[f"mae_{minutes}m"] = 100 * (min(lows) / entry - 1)
    result["return_eod"] = pct_return(entry, bars.closes[last - 1], record["direction"])
    highs, lows = bars.highs[idx:last], bars.lows[idx:last]
    if record["direction"] == "SHORT":
        mfe_i = min(range(idx, last), key=bars.lows.__getitem__)
        mae_i = max(range(idx, last), key=bars.highs.__getitem__)
        result["mfe_eod"] = 100 * (entry / bars.lows[mfe_i] - 1)
        result["mae_eod"] = 100 * (entry / bars.highs[mae_i] - 1)
        target_hit = lambda i, target: bars.lows[i] <= target
        stop_hit = lambda i: record["stop"] is not None and bars.highs[i] >= record["stop"]
    else:
        mfe_i = max(range(idx, last), key=bars.highs.__getitem__)
        mae_i = min(range(idx, last), key=bars.lows.__getitem__)
        result["mfe_eod"] = 100 * (bars.highs[mfe_i] / entry - 1)
        result["mae_eod"] = 100 * (bars.lows[mae_i] / entry - 1)
        target_hit = lambda i, target: bars.highs[i] >= target
        stop_hit = lambda i: record["stop"] is not None and bars.lows[i] <= record["stop"]
    result["time_to_mfe_minutes"] = round((bars.timestamps[mfe_i] - start).total_seconds() / 60, 2)
    result["time_to_mae_minutes"] = round((bars.timestamps[mae_i] - start).total_seconds() / 60, 2)
    events: list[tuple[datetime, str]] = []
    for i in range(idx, last):
        if record["target_1"] is not None and target_hit(i, record["target_1"]):
            events.append((bars.timestamps[i], "TARGET_1")); break
    for i in range(idx, last):
        if stop_hit(i):
            events.append((bars.timestamps[i], "STOP")); break
    events.sort()
    result["target_1_hit_time"] = next((when.isoformat() for when, name in events if name == "TARGET_1"), None)
    result["stop_hit_time"] = next((when.isoformat() for when, name in events if name == "STOP"), None)
    result["event_order"] = events[0][1] if events else "NONE"
    result["same_bar_ambiguous"] = bool(events and len(events) == 2 and events[0][0] == events[1][0])
    return result


def gate_analysis(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    gates = [
        ("candidate_dq_ab", lambda r: r["candidate_dq"] in {"A", "B"}),
        ("ofactor_ge_75", lambda r: (r["ofactor"] or -math.inf) >= 75),
        ("xfactor_ge_75", lambda r: (r["xfactor"] or -math.inf) >= 75),
        ("tqs_ge_78", lambda r: (r["tqs"] or -math.inf) >= 78),
        ("not_extreme", lambda r: r["extension_state"] != "EXTREME"),
        ("valid_triggered_setup", lambda r: r["setup_valid"] and str(r["trigger"]).upper() == "TRIGGERED"),
        ("rr_available", lambda r: r["source_rr"] is not None),
        ("rr_ge_1_5", lambda r: r["source_rr"] is not None and r["source_rr"] >= 1.5),
        ("option_selected", lambda r: r["option_state"] == "SELECTED"),
        ("option_spread_le_3pct", lambda r: r["option_spread_pct"] is not None and r["option_spread_pct"] <= 0.03),
        ("final_lots_ge_1", lambda r: (r["final_lots"] or 0) >= 1),
    ]
    rows, survivors = [], records
    for name, predicate in gates:
        survivors = [record for record in survivors if predicate(record)]
        rows.append({"stage": name, "rows_remaining": len(survivors), "pct_all": round(100 * len(survivors) / len(records), 4)})
    attribution = []
    overlap_counts: Counter[tuple[str, str]] = Counter()
    for record in records:
        failures = [name for name, predicate in gates if not predicate(record)]
        attribution.append({
            "candidate_id": record["candidate_id"], "run_id": record["run_id"], "symbol": record["symbol"],
            "as_of": record["scan_timestamp"], "canonical_status": record["canonical_status"],
            "signal_state": record["canonical_status"],
            "execution_state": "EXECUTABLE" if not failures[6:] else "REJECTED_EXECUTION_GATES",
            "diagnostic_final_state": record["canonical_status"] if record["canonical_status"] not in ACTIONABLE or not failures else "NO TRADE",
            "first_failed_gate": failures[0] if failures else "NONE", "all_failed_gates": "|".join(failures),
            **{name: predicate(record) for name, predicate in gates},
        })
        for left in failures:
            for right in failures:
                overlap_counts[(left, right)] += 1
    overlap = [{"gate_a": left, "gate_b": right, "rows": count} for (left, right), count in sorted(overlap_counts.items())]
    return rows, attribution, overlap


def consistency_anomalies(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anomalies = []
    for r in records:
        found: list[tuple[str, str, str]] = []
        if r["canonical_status"] in ACTIONABLE and (r["final_lots"] or 0) < 1:
            found.append(("BUY_NOW_ZERO_LOTS", "P0", f"final_lots={r['final_lots']} position_state={r['position_state']}"))
        if r["canonical_status"] in ACTIONABLE and r["run_dq"] not in {"A", "B"}:
            found.append(("ACTIONABLE_IN_FAILED_RUN_DQ", "P0", f"run_dq={r['run_dq']} candidate_dq={r['candidate_dq']}"))
        if r["canonical_status"] in ACTIONABLE and (r["option_state"] != "SELECTED" or (r["option_spread_pct"] or math.inf) > 0.03):
            found.append(("ACTIONABLE_OPTION_GATE_FAILURE", "P0", f"option={r['option_state']} spread={r['option_spread_pct']}"))
        if r.get("outcome_state") == "MATURE_D5" and (any(r.get(f"return_d{i}") is None for i in range(1, 6)) or r.get("mfe_d5") is None or r.get("mae_d5") is None):
            found.append(("MATURE_D5_INCOMPLETE", "P0", "one or more D1-D5/extrema fields are missing"))
        if r["option_state"] == "SELECTED" and r["option_spread_pct"] is not None and r["option_spread_pct"] > 0.03:
            found.append(("SELECTED_OPTION_SPREAD_GT_3PCT", "P0", f"spread_ratio={r['option_spread_pct']:.6f}"))
        if r["option_state"] == "SELECTED" and r["risk_per_unit"] is not None and r["option_premium"] is not None and r["risk_per_unit"] > r["option_premium"]:
            found.append(("OPTION_RISK_EXCEEDS_PREMIUM_PER_UNIT", "P0", f"risk_per_unit={r['risk_per_unit']} premium={r['option_premium']}"))
        for horizon in HORIZONS:
            item = r["horizons"].get(horizon) or {}
            if "QUALIFIED" in str(item.get("state")) and any(value is None for value in (item.get("inputs") or {}).values()):
                found.append(("QUALIFIED_HORIZON_MISSING_INPUT", "P0", horizon))
        for code, severity, detail in found:
            anomalies.append({"anomaly": code, "severity": severity, "candidate_id": r["candidate_id"], "run_id": r["run_id"], "symbol": r["symbol"], "as_of": r["scan_timestamp"], "status": r["canonical_status"], "detail": detail})
    return anomalies


def structural_rr(records: list[dict[str, Any]], minute_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for r in records:
        entry, stop = r["entry"], r["stop"]
        risk = abs(entry - stop) if entry is not None and stop is not None else None
        if r["direction"] == "SHORT":
            candidates = [value for value in (r["prior_low_20"], r["low"]) if value is not None and entry is not None and value < entry]
            obstacle = max(candidates) if candidates else None
        else:
            candidates = [value for value in (r["prior_high_20"], r["high"]) if value is not None and entry is not None and value > entry]
            obstacle = min(candidates) if candidates else None
        rr_value = abs(obstacle - entry) / risk if obstacle is not None and risk and risk > 0 else None
        minute = minute_by_id.get(r["candidate_id"], {})
        rows.append({
            "candidate_id": r["candidate_id"], "run_id": r["run_id"], "symbol": r["symbol"], "as_of": r["scan_timestamp"],
            "direction": r["direction"], "status": r["canonical_status"], "setup": r["setup"], "entry": entry, "stop": stop,
            "risk_per_share": risk, "synthetic_target_rr": r["synthetic_rr_1"], "source_xfactor_rr": r["source_rr"],
            "structural_obstacle": obstacle, "structural_rr": rr_value, "structural_rr_state": "AVAILABLE" if rr_value is not None else "DATA_INSUFFICIENT",
            **{key: minute.get(key) for key in ("return_15m", "return_30m", "return_60m", "return_eod", "mfe_eod", "mae_eod", "event_order")},
        })
    return rows


def availability_rows(records: list[dict[str, Any]], minute_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for r in records:
        option_stale = r["option_quote_age_minutes"] is not None and r["option_quote_age_minutes"] > 15
        path = minute_by_id.get(r["candidate_id"], {})
        horizon_available = sum(value is not None for value in (r["return_5d"], r["return_21d"], r["return_63d"], r["sector_return_21d"], r["volume_ratio_20"], r["close_location"], r["xfactor"]))
        rows.append({
            "candidate_id": r["candidate_id"], "run_id": r["run_id"], "symbol": r["symbol"], "as_of": r["scan_timestamp"],
            "stock_snapshot": state(r["close"]),
            "session_vwap": state(r["vwap"], stale=(r["session_bar_age_minutes"] or 0) > 15),
            "nifty_trend": state(r["nifty_trend"]), "banknifty_trend": state(r["banknifty_trend"]), "vix_regime": state(r["vix_regime"]),
            "sector_relative_strength_inputs": state(r["sector_return_21d"] if r["nifty_return_21d"] is not None else None),
            "structural_levels": state(r["prior_high_20"] if r["prior_low_20"] is not None else None),
            "structural_stop": state(r["stop"]), "source_reward_risk": state(r["source_rr"]),
            "option_selection": state(r["option_state"] if r["option_state"] == "SELECTED" else None, stale=option_stale),
            "minute_forward_path": state(path.get("bars_observed")),
            "daily_forward_path": state(r.get("observed_through")),
            "event_publication_time": state(None, unsafe=True),
            "horizon_research_component_count": horizon_available,
            "horizon_research_components": "AVAILABLE" if horizon_available >= 5 else "PARTIAL" if horizon_available else "MISSING",
        })
    return rows


def episode_rows(records: list[dict[str, Any]], minute_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[(record["symbol"], record["run_date"])].append(record)
    episodes = []
    for (symbol, day), rows in sorted(grouped.items()):
        rows.sort(key=lambda item: item["as_of"])
        active: list[dict[str, Any]] = []
        family = None
        direction = None
        def flush() -> None:
            nonlocal active, family, direction
            if not active:
                return
            first, last = active[0], active[-1]
            minute = minute_by_id.get(first["candidate_id"], {})
            episodes.append({
                "opportunity_episode_id": f"{day}:{symbol}:{len([e for e in episodes if e['symbol']==symbol and e['run_date']==day])+1}",
                "run_date": day, "symbol": symbol, "direction": direction, "episode_family": family,
                "started_at": first["scan_timestamp"], "ended_at": last["scan_timestamp"], "scan_count": len(active),
                "first_candidate_id": first["candidate_id"], "last_candidate_id": last["candidate_id"],
                "status_path": " > ".join(dict.fromkeys(item["canonical_status"] for item in active)),
                "max_ofactor": max(item["ofactor"] or -math.inf for item in active), "max_xfactor": max(item["xfactor"] or -math.inf for item in active),
                "max_tqs": max(item["tqs"] or -math.inf for item in active), "first_final_lots": first["final_lots"],
                **{key: minute.get(key) for key in ("return_15m", "return_30m", "return_60m", "return_eod", "mfe_eod", "mae_eod", "event_order")},
                **{f"return_d{i}": first.get(f"return_d{i}") for i in range(1, 6)},
            })
            active, family, direction = [], None, None
        for row in rows:
            current_family = "ACTIONABLE" if row["canonical_status"] in ACTIONABLE else "DEVELOPING" if row["canonical_status"] in DEVELOPING else "NO_CHASE" if row["canonical_status"] == "NO CHASE" else None
            if current_family is None:
                flush(); continue
            if active and (current_family != family or row["direction"] != direction or (row["as_of"] - active[-1]["as_of"]).total_seconds() > 45 * 60):
                flush()
            if not active:
                family, direction = current_family, row["direction"]
            active.append(row)
        flush()
    return episodes


def option_integrity(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for r in records:
        if r["option_state"] != "SELECTED":
            continue
        premium_risk_cap = (r["option_premium"] or 0) * (r["option_lot_size"] or 0)
        rows.append({
            "candidate_id": r["candidate_id"], "run_id": r["run_id"], "symbol": r["symbol"], "as_of": r["scan_timestamp"],
            "status": r["canonical_status"], "moneyness": r["option_moneyness"], "spread_ratio": r["option_spread_pct"],
            "spread_pct_display": r["option_spread_pct"] * 100 if r["option_spread_pct"] is not None else None,
            "spread_gate_3pct": r["option_spread_pct"] is not None and r["option_spread_pct"] <= 0.03,
            "quote_age_minutes": r["option_quote_age_minutes"], "quote_gate_15m": r["option_quote_age_minutes"] is not None and r["option_quote_age_minutes"] <= 15,
            "abs_delta": abs(r["option_delta"]) if r["option_delta"] is not None else None,
            "delta_025_065": r["option_delta"] is not None and 0.25 <= abs(r["option_delta"]) <= 0.65,
            "delta_035_065": r["option_delta"] is not None and 0.35 <= abs(r["option_delta"]) <= 0.65,
            "delta_045_065": r["option_delta"] is not None and 0.45 <= abs(r["option_delta"]) <= 0.65,
            "premium": r["option_premium"], "bid": r["option_bid"], "ask": r["option_ask"], "oi": r["option_oi"], "volume": r["option_volume"],
            "lot_size": r["option_lot_size"], "premium_per_lot": premium_risk_cap, "exported_risk_per_unit": r["risk_per_unit"],
            "exported_risk_per_lot": r["risk_per_lot"], "risk_per_unit_exceeds_premium": r["risk_per_unit"] is not None and r["option_premium"] is not None and r["risk_per_unit"] > r["option_premium"],
            "risk_per_lot_exceeds_full_premium": r["risk_per_lot"] is not None and r["risk_per_lot"] > premium_risk_cap,
        })
    return rows


def horizon_coverage(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for r in records:
        extension_quality = 100 if r["extension_state"] in {"FRESH", "ACCEPTABLE"} else 70 if r["extension_state"] == "MODERATE" else 35 if r["extension_state"] == "EXTENDED" else 0
        sector_relative = clamp(50 + 5 * ((r["sector_return_21d"] or 0) - (r["nifty_return_21d"] or 0))) if r["sector_return_21d"] is not None and r["nifty_return_21d"] is not None else None
        momentum = clamp(50 + 5 * (r["return_5d"] or 0)) if r["return_5d"] is not None else None
        liquidity = clamp(50 * (r["volume_ratio_20"] or 0)) if r["volume_ratio_20"] is not None else None
        close_long = clamp(100 * r["close_location"]) if r["close_location"] is not None else None
        close_quality = (100 - close_long if r["direction"] == "SHORT" else close_long) if close_long is not None else None
        components = {
            "BTST": {"close": close_quality, "sector": sector_relative, "oi": None, "momentum": momentum, "liquidity": liquidity, "extension": extension_quality},
            "STBT": {"close": close_quality, "sector": sector_relative, "oi": None, "momentum": momentum, "liquidity": liquidity, "extension": extension_quality},
            "H2": {"relative": momentum, "sector": sector_relative, "catalyst": None, "oi": None, "runway": extension_quality, "execution": r["xfactor"]},
            "H3": {"relative": momentum, "flow": None, "sector": sector_relative, "regime": None, "extension": extension_quality},
            "H4": {"weekly": clamp(50 + 2 * (r["return_21d"] or 0)) if r["return_21d"] is not None else None, "sector": sector_relative, "institutional": None, "trend": momentum, "risk": r["xfactor"]},
        }
        for horizon, values in components.items():
            available = {key: value for key, value in values.items() if value is not None}
            provisional = mean(available.values())
            rows.append({
                "candidate_id": r["candidate_id"], "run_id": r["run_id"], "symbol": r["symbol"], "as_of": r["scan_timestamp"], "direction": r["direction"],
                "horizon": horizon, "production_state": (r["horizons"].get(horizon) or {}).get("state"),
                "available_component_count": len(available), "required_component_count": len(values), "coverage_pct": round(100 * len(available) / len(values), 2),
                "available_components": "|".join(available), "missing_components": "|".join(key for key, value in values.items() if value is None),
                "engineering_only_available_component_score": provisional,
                "qualification_state": "DATA_INSUFFICIENT" if len(available) < len(values) else "RESEARCH_SCORE_COMPLETE",
            })
    return rows


def sector_reconstruction(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        grouped[(r["run_id"], r["sector"])].append(r)
    rows = []
    for (run_id, sector), items in grouped.items():
        rel_values = [(r["sector_return_21d"] - r["nifty_return_21d"]) for r in items if r["sector_return_21d"] is not None and r["nifty_return_21d"] is not None]
        breadth_values = [1.0 if (r["return_21d"] or 0) > (r["nifty_return_21d"] or 0) else 0.0 for r in items if r["return_21d"] is not None and r["nifty_return_21d"] is not None]
        signed_volume = [math.copysign(min(r["volume_ratio_20"], 2.0), r["return_5d"] or 0) for r in items if r["volume_ratio_20"] is not None and r["return_5d"] is not None and r["return_5d"] != 0]
        persistence = [1.0 if (r["return_5d"] or 0) * (r["return_21d"] or 0) > 0 else 0.0 for r in items if r["return_5d"] is not None and r["return_21d"] is not None]
        relative = clamp(50 + 5 * mean(rel_values)) if rel_values else None
        breadth = 100 * mean(breadth_values) if breadth_values else None
        money_flow = clamp(50 + 25 * mean(signed_volume)) if signed_volume else None
        participation = clamp(50 * mean(r["volume_ratio_20"] for r in items if r["volume_ratio_20"] is not None)) if any(r["volume_ratio_20"] is not None for r in items) else None
        persistence_score = 100 * mean(persistence) if persistence else None
        complete = all(value is not None for value in (relative, breadth, money_flow, participation))
        score = 0.30 * relative + 0.25 * breadth + 0.25 * money_flow + 0.20 * participation if complete else None
        rows.append({"run_id": run_id, "as_of": items[0]["scan_timestamp"], "sector": sector, "sample_size": len(items), "relative_strength": relative, "breadth": breadth, "money_flow_proxy": money_flow, "participation_proxy": participation, "persistence_proxy": persistence_score, "engineering_score": score, "state": "ENGINEERING_ONLY_COMPLETE" if complete else "PARTIAL", "formula_note": "Provisional adapter diagnostic; not OISS production formula"})
    return rows


def load_daily_bars(path: Path) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if not path.exists():
        return result
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            values = {name: number(row.get(name)) for name in ("open", "high", "low", "close")}
            if any(value is None or value <= 0 for value in values.values()):
                continue
            result[row["symbol"].upper()].append({"date": datetime.fromisoformat(row["trade_date"]).date(), **values})
    for rows in result.values():
        rows.sort(key=lambda item: item["date"])
    return result


def market_and_levels(records: list[dict[str, Any]], index_1m: dict[str, Bars], index_1d: dict[str, list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_run: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_run[record["run_id"]].append(record)
    market_rows, level_rows = [], []
    for run_id, items in sorted(by_run.items(), key=lambda item: item[1][0]["as_of"]):
        scan = items[0]["as_of"]
        if scan is None:
            continue
        local_day = scan.astimezone(IST).date()
        index_facts: dict[str, dict[str, Any]] = {}
        for symbol in ("NIFTY", "BANKNIFTY", "INDIA VIX"):
            bars = index_1m.get(symbol)
            daily = index_1d.get(symbol, [])
            previous = next((row for row in reversed(daily) if row["date"] < local_day), None)
            if not bars:
                index_facts[symbol] = {}; continue
            start = datetime.combine(local_day, datetime.min.time(), IST).replace(hour=9, minute=15).astimezone(scan.tzinfo)
            left = bisect.bisect_left(bars.timestamps, start)
            right = bisect.bisect_right(bars.timestamps, scan)
            if right <= left:
                index_facts[symbol] = {}; continue
            weights = bars.volumes[left:right]
            vwap = sum(p * w for p, w in zip(bars.closes[left:right], weights)) / sum(weights) if sum(weights) > 0 else statistics.fmean(bars.closes[left:right])
            current = bars.closes[right - 1]
            session_open = bars.opens[left]
            previous_close = previous["close"] if previous else None
            change_pct = 100 * (current / previous_close - 1) if previous_close else None
            pivot = (previous["high"] + previous["low"] + previous["close"]) / 3 if previous else None
            facts = {
                "current": current, "session_open": session_open, "previous_close": previous_close, "change_pct": change_pct,
                "vwap": vwap, "session_high": max(bars.highs[left:right]), "session_low": min(bars.lows[left:right]),
                "support_1": 2 * pivot - previous["high"] if pivot else None,
                "support_2": pivot - (previous["high"] - previous["low"]) if pivot else None,
                "resistance_1": 2 * pivot - previous["low"] if pivot else None,
                "resistance_2": pivot + (previous["high"] - previous["low"]) if pivot else None,
                "source_max_event_time": bars.timestamps[right - 1].isoformat(),
            }
            index_facts[symbol] = facts
            level_rows.append({"run_id": run_id, "as_of": scan.isoformat(), "index": symbol, **facts, "level_method": "ENGINEERING_ONLY_PRIOR_SESSION_CLASSIC_PIVOT", "production_state": "NOT_PERSISTED_IN_OISS"})
        nifty, bank, vix = index_facts.get("NIFTY", {}), index_facts.get("BANKNIFTY", {}), index_facts.get("INDIA VIX", {})
        def trend_score(facts: dict[str, Any]) -> float | None:
            if facts.get("current") is None or facts.get("vwap") is None or facts.get("previous_close") is None: return None
            return clamp(50 * (1 if facts["current"] >= facts["vwap"] else -1) + 50 * (1 if facts["current"] >= facts["previous_close"] else -1), -100, 100)
        nifty_score, bank_score = trend_score(nifty), trend_score(bank)
        breadth_values = [r["return_1d"] for r in items if r["return_1d"] is not None]
        breadth_score = 200 * sum(value > 0 for value in breadth_values) / len(breadth_values) - 100 if breadth_values else None
        vix_score = clamp(-10 * vix["change_pct"], -100, 100) if vix.get("change_pct") is not None else None
        gap_pct = 100 * (nifty["session_open"] / nifty["previous_close"] - 1) if nifty.get("previous_close") else None
        gap_acceptance = clamp(100 - abs(gap_pct) * 50, -100, 100) if gap_pct is not None else None
        components = {"nifty": (nifty_score, .30), "banknifty": (bank_score, .20), "breadth": (breadth_score, .20), "vix": (vix_score, .10), "futures_participation": (None, .15), "gap_acceptance": (gap_acceptance, .05)}
        available_weight = sum(weight for value, weight in components.values() if value is not None)
        score = sum(value * weight for value, weight in components.values() if value is not None) / available_weight if available_weight else None
        classification = "DATA_INSUFFICIENT" if score is None else "STRONG BULLISH" if score >= 70 else "MILD BULLISH" if score >= 30 else "STRONG BEARISH" if score <= -70 else "MILD BEARISH" if score <= -30 else "NEUTRAL / MIXED"
        market_rows.append({
            "run_id": run_id, "as_of": scan.isoformat(), "nifty_score": nifty_score, "banknifty_score": bank_score, "breadth_score": breadth_score,
            "vix_environment_score": vix_score, "futures_participation_score": None, "gap_acceptance_score": gap_acceptance,
            "available_weight": available_weight, "engineering_only_regime_score": score, "engineering_only_classification": classification,
            "production_state": "INCOMPLETE_NOT_PERSISTED", "missing_components": "futures_participation",
        })
    return market_rows, level_rows


def run_provenance(handoff_dir: Path) -> list[dict[str, Any]]:
    path = handoff_dir / "OISS_HISTORICAL_RUNS_2026-08-11_TO_2026-08-25.csv"
    rows = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows.append({
                "run_id": row["run_id"], "run_date": row["run_date"], "scan_timestamp": row["scan_timestamp"],
                "data_quality_grade": row["data_quality_grade"], "code_commit": row["code_commit"], "build_version": row["build_version"],
                "commit_known": row["code_commit"] not in {"", "UNKNOWN"}, "build_digest_known": row["build_version"] not in {"", "source", "UNKNOWN"},
                "formula_version": row["formula_version"], "config_version": row["config_version"], "status": row["status"],
            })
    return rows


def no_chase_diagnostic(records: list[dict[str, Any]], episodes: list[dict[str, Any]], minute_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    enriched = []
    for record in records:
        row = dict(record); row.update(minute_by_id.get(record["candidate_id"], {})); enriched.append(row)
    populations = {
        "RAW_SCAN_OBSERVATIONS": enriched,
        "FIRST_SYMBOL_DAY": enriched,
        "OPPORTUNITY_EPISODES": episodes,
    }
    rows = []
    for name, population in populations.items():
        for cohort in ("NO_CHASE", "ACTIONABLE", "ALL_OTHER"):
            if name == "OPPORTUNITY_EPISODES":
                selected = [r for r in population if (r["episode_family"] == cohort if cohort != "ALL_OTHER" else r["episode_family"] not in {"NO_CHASE", "ACTIONABLE"})]
            else:
                selected = [r for r in population if ((r["canonical_status"] == "NO CHASE") if cohort == "NO_CHASE" else (r["canonical_status"] in ACTIONABLE) if cohort == "ACTIONABLE" else (r["canonical_status"] != "NO CHASE" and r["canonical_status"] not in ACTIONABLE))]
                if name == "FIRST_SYMBOL_DAY":
                    selected = list({(r["symbol"], r["run_date"]): r for r in reversed(selected)}.values())
            rows.append({"population": name, "cohort": cohort, "observations": len(selected), "symbols": len({r['symbol'] for r in selected}), "average_15m": mean(r.get("return_15m") for r in selected), "average_eod": mean(r.get("return_eod") for r in selected), "average_d1": mean(r.get("return_d1") for r in selected), "average_d5": mean(r.get("return_d5") for r in selected), "average_mfe_eod": mean(r.get("mfe_eod") for r in selected), "average_mae_eod": mean(r.get("mae_eod") for r in selected)})
    return rows


def score_discrimination(records: list[dict[str, Any]], episodes: list[dict[str, Any]], minute_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    enriched = []
    for r in records:
        merged = dict(r)
        merged.update(minute_by_id.get(r["candidate_id"], {}))
        enriched.append(merged)
    populations = {
        "RAW_SCAN_OBSERVATIONS": enriched,
        "FIRST_SYMBOL_DAY": list({(r["symbol"], r["run_date"]): r for r in reversed(enriched)}.values()),
        "OPPORTUNITY_EPISODES": episodes,
    }
    metrics = ("ofactor", "xfactor", "tqs", "extension_atr", "candidate_dq_score")
    outcomes = ("return_15m", "return_30m", "return_60m", "return_eod", "return_d1", "return_d5", "mfe_eod", "mae_eod")
    rows = []
    for population_name, population in populations.items():
        for metric in metrics:
            for outcome in outcomes:
                pairs = [(number(r.get(metric if population_name != "OPPORTUNITY_EPISODES" else f"max_{metric}")), number(r.get(outcome))) for r in population]
                pairs = [(x, y) for x, y in pairs if x is not None and y is not None]
                if len(pairs) < 3:
                    continue
                x = np.array([pair[0] for pair in pairs]); y = np.array([pair[1] for pair in pairs])
                corr = spearmanr(x, y).statistic if len(set(x)) > 1 and len(set(y)) > 1 else None
                edges = np.quantile(x, np.linspace(0, 1, 11))
                for decile in range(1, 11):
                    low, high = edges[decile - 1], edges[decile]
                    mask = (x >= low) & (x <= high if decile == 10 else x < high)
                    values = y[mask]
                    if not len(values): continue
                    rows.append({"population": population_name, "metric": metric, "outcome": outcome, "spearman": corr, "decile": decile, "metric_low": low, "metric_high": high, "sample_size": len(values), "average_outcome": float(np.mean(values)), "median_outcome": float(np.median(values))})
    return rows


def threshold_sensitivity(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for o in (70, 72.5, 75, 77.5, 80):
        for x in (70, 72.5, 75, 77.5, 80):
            for t in (74, 76, 78, 80, 82):
                selected = [e for e in episodes if e["episode_family"] == "ACTIONABLE" and (e["max_ofactor"] or 0) >= o and (e["max_xfactor"] or 0) >= x and (e["max_tqs"] or 0) >= t]
                rows.append({"ofactor_threshold": o, "xfactor_threshold": x, "tqs_threshold": t, "episode_count": len(selected), "symbol_count": len({e['symbol'] for e in selected}), "average_eod": mean(e.get("return_eod") for e in selected), "average_d5": mean(e.get("return_d5") for e in selected), "average_mfe_eod": mean(e.get("mfe_eod") for e in selected), "average_mae_eod": mean(e.get("mae_eod") for e in selected), "warning": "SENSITIVITY_ONLY_NOT_OPTIMIZATION"})
    return rows


def chart_bar(path: Path, title: str, labels: list[str], values: list[float], ylabel: str, color: str = "#315ea8") -> None:
    fig, ax = plt.subplots(figsize=(11, 5.5))
    bars = ax.bar(range(len(values)), values, color=color)
    ax.set_title(title, loc="left", weight="bold"); ax.set_ylabel(ylabel)
    ax.set_xticks(range(len(labels)), labels, rotation=35, ha="right")
    ax.grid(axis="y", alpha=.2)
    for bar, value in zip(bars, values): ax.text(bar.get_x() + bar.get_width()/2, bar.get_height(), f"{value:,.1f}", ha="center", va="bottom", fontsize=8)
    fig.tight_layout(); fig.savefig(path, dpi=180); plt.close(fig)


def charts(output: Path, funnel: list[dict[str, Any]], availability: list[dict[str, Any]], anomalies: list[dict[str, Any]], options: list[dict[str, Any]], discrimination: list[dict[str, Any]]) -> None:
    chart_dir = output / "charts"; chart_dir.mkdir(exist_ok=True)
    chart_bar(chart_dir / "01_gate_funnel.png", "OISS gate funnel", [r["stage"] for r in funnel], [r["rows_remaining"] for r in funnel], "Rows remaining")
    availability_fields = [key for key in availability[0] if key not in {"candidate_id", "run_id", "symbol", "as_of", "horizon_research_component_count", "horizon_research_components"}]
    available_pct = [100 * sum(r[field] == "AVAILABLE" for r in availability) / len(availability) for field in availability_fields]
    chart_bar(chart_dir / "02_data_availability.png", "Point-in-time data availability", availability_fields, available_pct, "Available rows (%)", "#257a5a")
    counts = Counter(row["anomaly"] for row in anomalies)
    chart_bar(chart_dir / "03_consistency_anomalies.png", "Status and execution consistency anomalies", list(counts), list(counts.values()), "Rows", "#bd3b4d")
    spreads = [row["spread_pct_display"] for row in options if row["spread_pct_display"] is not None]
    fig, ax = plt.subplots(figsize=(9, 5)); ax.hist(spreads, bins=60, color="#6d52bd", alpha=.85); ax.axvline(3, color="#bd3b4d", linestyle="--", label="Documented 3% gate"); ax.set_title("Selected option spread distribution", loc="left", weight="bold"); ax.set_xlabel("Spread (%)"); ax.set_ylabel("Selected contracts"); ax.legend(); fig.tight_layout(); fig.savefig(chart_dir / "04_option_spreads.png", dpi=180); plt.close(fig)
    d5 = [r for r in discrimination if r["population"] == "FIRST_SYMBOL_DAY" and r["metric"] == "tqs" and r["outcome"] == "return_d5"]
    if d5: chart_bar(chart_dir / "05_tqs_d5_deciles.png", "TQS versus D5 by decile (first symbol/day)", [f"D{r['decile']}\nn={r['sample_size']}" for r in d5], [r["average_outcome"] for r in d5], "Average D5 return (%)", "#2e6f9e")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handoff-dir", type=Path, required=True)
    parser.add_argument("--bars-1m", type=Path, required=True)
    parser.add_argument("--index-bars-1m", type=Path)
    parser.add_argument("--index-bars-1d", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    outcomes = load_outcomes(args.handoff_dir / "OISS_BACKTEST_OUTCOMES_2026-08-11_TO_2026-08-25.csv")
    records = load_decisions(args.handoff_dir / "OISS_BACKTEST_DECISIONS_2026-08-11_TO_2026-08-25.csv", outcomes)
    bars = load_bars(args.bars_1m)
    index_bars = load_bars(args.index_bars_1m) if args.index_bars_1m else {}
    index_daily = load_daily_bars(args.index_bars_1d) if args.index_bars_1d else {}
    minute = [minute_path(record, bars) for record in records]
    minute_by_id = {row["candidate_id"]: row for row in minute}
    funnel, gate_rows, overlap = gate_analysis(records)
    anomalies = consistency_anomalies(records)
    availability = availability_rows(records, minute_by_id)
    episodes = episode_rows(records, minute_by_id)
    rr_rows = structural_rr(records, minute_by_id)
    option_rows = option_integrity(records)
    horizon_rows = horizon_coverage(records)
    sector_rows = sector_reconstruction(records)
    market_rows, index_levels = market_and_levels(records, index_bars, index_daily)
    discrimination = score_discrimination(records, episodes, minute_by_id)
    sensitivity = threshold_sensitivity(episodes)
    provenance = run_provenance(args.handoff_dir)
    no_chase = no_chase_diagnostic(records, episodes, minute_by_id)
    outputs = {
        "01_data_availability.csv": availability,
        "02_gate_funnel.csv": funnel,
        "02_gate_attribution.csv": gate_rows,
        "03_gate_overlap_matrix.csv": overlap,
        "04_status_consistency_anomalies.csv": anomalies,
        "05_opportunity_episodes.csv": episodes,
        "06_minute_path_outcomes.csv": minute,
        "07_structural_rr_diagnostic.csv": rr_rows,
        "08_option_selection_integrity.csv": option_rows,
        "09_horizon_component_coverage.csv": horizon_rows,
        "10_score_discrimination.csv": discrimination,
        "11_sector_rotation_reconstructed.csv": sector_rows,
        "12_market_regime_reconstructed.csv": market_rows,
        "13_critical_index_levels_reconstructed.csv": index_levels,
        "14_threshold_sensitivity.csv": sensitivity,
        "15_run_provenance_audit.csv": provenance,
        "16_no_chase_diagnostic.csv": no_chase,
    }
    manifest = []
    for name, rows in outputs.items():
        path = args.output / name
        count, fields = write_csv(path, rows)
        manifest.append({"file": name, "rows": count, "columns": len(fields), "bytes": path.stat().st_size, "sha256": sha256(path)})
    minute_table = pa.Table.from_pylist(minute)
    parquet_path = args.output / "06_minute_path_outcomes.parquet"
    pq.write_table(minute_table, parquet_path, compression="zstd")
    manifest.append({"file": parquet_path.name, "rows": len(minute), "columns": len(minute_table.column_names), "bytes": parquet_path.stat().st_size, "sha256": sha256(parquet_path)})
    charts(args.output, funnel, availability, anomalies, option_rows, discrimination)
    for path in sorted((args.output / "charts").glob("*.png")):
        manifest.append({"file": f"charts/{path.name}", "rows": None, "columns": None, "bytes": path.stat().st_size, "sha256": sha256(path)})
    summary = {
        "decision_observations": len(records), "outcome_records": len(outcomes), "symbols": len({r['symbol'] for r in records}),
        "minute_symbols_loaded": len(bars), "minute_paths_available": sum(r.get("path_state") == "AVAILABLE" for r in minute),
        "actionable_scan_observations": sum(r["canonical_status"] in ACTIONABLE for r in records),
        "actionable_episodes": sum(r["episode_family"] == "ACTIONABLE" for r in episodes),
        "anomalies": dict(Counter(r["anomaly"] for r in anomalies)),
        "selected_options": len(option_rows), "selected_spread_over_3pct": sum(not r["spread_gate_3pct"] for r in option_rows),
        "selected_otm": sum(r["moneyness"] == "OTM" for r in option_rows),
        "run_dq": dict(Counter(r["run_dq"] for r in records)), "candidate_dq": dict(Counter(r["candidate_dq"] for r in records)),
    }
    summary_path = args.output / "SUMMARY.json"
    summary_path.write_text(json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8")
    validation = {"csv": {}, "parquet": {}, "status": "PASS"}
    for name, expected_rows in ((name, len(rows)) for name, rows in outputs.items()):
        with (args.output / name).open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            actual = 0
            malformed = 0
            for row in reader:
                actual += 1
                malformed += int(None in row)
        validation["csv"][name] = {"expected_rows": expected_rows, "actual_rows": actual, "columns": len(reader.fieldnames or []), "malformed_rows": malformed}
        if actual != expected_rows or malformed:
            validation["status"] = "FAIL"
    parquet_check = pq.read_table(parquet_path)
    validation["parquet"] = {"rows": parquet_check.num_rows, "columns": parquet_check.num_columns, "compression": "zstd"}
    if parquet_check.num_rows != len(minute):
        validation["status"] = "FAIL"
    validation_path = args.output / "VALIDATION.json"
    validation_path.write_text(json.dumps(validation, indent=2) + "\n", encoding="utf-8")
    manifest.extend([
        {"file": summary_path.name, "rows": None, "columns": None, "bytes": summary_path.stat().st_size, "sha256": sha256(summary_path)},
        {"file": validation_path.name, "rows": None, "columns": None, "bytes": validation_path.stat().st_size, "sha256": sha256(validation_path)},
    ])
    raw_paths = [args.bars_1m, args.index_bars_1m, args.index_bars_1d]
    coverage_path = args.bars_1m.parent / "DB_SOURCE_COVERAGE.csv"
    if coverage_path.exists():
        raw_paths.append(coverage_path)
    for path in (path for path in raw_paths if path and path.exists()):
        with path.open("rb") as handle:
            rows = max(0, sum(1 for _ in handle) - 1)
        manifest.append({"file": f"raw/{path.name}", "rows": rows, "columns": None, "bytes": path.stat().st_size, "sha256": sha256(path)})
    write_csv(args.output / "MANIFEST.csv", manifest)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
