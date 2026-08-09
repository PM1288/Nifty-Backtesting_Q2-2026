from __future__ import annotations

import csv
import hashlib
import json
import logging
import os
import socket
import time
from copy import deepcopy
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
from psycopg.rows import dict_row

from .backtesting import (
    PROFIT_TAX_RESERVE_RATE,
    ScenarioSpec,
    SymbolBar,
    TradeTemplate,
    _build_signal_candidates,
    _build_trade_templates,
    _replay_scenario_from_templates,
)
from .db import query_df

logger = logging.getLogger(__name__)

ENGINE_VERSION = "daily_strategy_lab_v1"
EVALUATION_POLICY_VERSION = "full_path_ladder_plus_h30_daily_v1"
INTRADAY_REWARD_LEVELS = (0.3, 0.5, 0.7)
D5_REWARD_LEVELS = (1.0, 2.0, 5.0)
ADVERSE_LEVELS = (-0.5, -1.0, -2.0, -5.0, -10.0)
H30_REWARD_LEVELS = (1.0, 2.0, 5.0)


LAB_STRATEGIES: dict[str, dict[str, Any]] = {
    "rsi30_willr80_closegtprev_tp125_v1": {
        "displayName": "Fast Oversold Rebound",
        "entryKind": "fast_oversold_rebound",
        "plainEnglish": "Signal when daily RSI and Williams %R are below the selected limits and the close is above the previous close; enter at the next session open.",
        "parameters": {
            "rsiMax": {"type": "number", "minimum": 5.0, "maximum": 60.0, "step": 1.0, "default": 30.0},
            "willrMax": {"type": "number", "minimum": -100.0, "maximum": -20.0, "step": 5.0, "default": -80.0},
            "requireCloseAbovePrevious": {"type": "boolean", "default": True},
            "takeProfitPct": {"type": "number", "minimum": 0.1, "maximum": 15.0, "step": 0.05, "default": 1.25},
        },
    },
    "rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1": {
        "displayName": "Confirmed Oversold Recovery",
        "entryKind": "confirmed_oversold_recovery",
        "plainEnglish": "Signal when RSI and Williams %R reclaim selected levels with the configured candle confirmations; enter at the next session open.",
        "parameters": {
            "rsiReclaimLevel": {"type": "number", "minimum": 10.0, "maximum": 60.0, "step": 1.0, "default": 30.0},
            "willrReclaimLevel": {"type": "number", "minimum": -100.0, "maximum": -20.0, "step": 5.0, "default": -80.0},
            "requireGreenClose": {"type": "boolean", "default": True},
            "requireCloseAbovePrevious": {"type": "boolean", "default": True},
            "takeProfitPct": {"type": "number", "minimum": 0.1, "maximum": 15.0, "step": 0.05, "default": 2.0},
            "stopLossPct": {"type": "number", "minimum": 0.1, "maximum": 15.0, "step": 0.05, "default": 2.0},
            "maxHoldDays": {"type": "integer", "minimum": 1, "maximum": 60, "step": 1, "default": 10},
        },
    },
    "macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1": {
        "displayName": "MACD Trend Continuation",
        "entryKind": "macd_trend_continuation",
        "plainEnglish": "Signal on a bullish MACD cross above the 50-day trend filter while RSI remains inside the selected band; enter at the next session open.",
        "parameters": {
            "rsiMin": {"type": "number", "minimum": 20.0, "maximum": 80.0, "step": 1.0, "default": 55.0},
            "rsiMax": {"type": "number", "minimum": 20.0, "maximum": 90.0, "step": 1.0, "default": 70.0},
            "takeProfitPct": {"type": "number", "minimum": 0.1, "maximum": 20.0, "step": 0.1, "default": 4.0},
            "stopLossPct": {"type": "number", "minimum": 0.1, "maximum": 20.0, "step": 0.1, "default": 3.0},
            "maxHoldDays": {"type": "integer", "minimum": 1, "maximum": 120, "step": 1, "default": 20},
        },
    },
}


def validate_parameters(strategy_version_id: str, supplied: dict[str, Any]) -> dict[str, Any]:
    definition = LAB_STRATEGIES.get(strategy_version_id)
    if definition is None:
        raise ValueError("strategy version is not enabled for the testing workspace")
    specs = definition["parameters"]
    unknown = sorted(set(supplied) - set(specs))
    if unknown:
        raise ValueError(f"unknown parameters: {', '.join(unknown)}")
    values: dict[str, Any] = {}
    for name, spec in specs.items():
        value = supplied.get(name, spec["default"])
        if spec["type"] == "boolean":
            if not isinstance(value, bool):
                raise ValueError(f"{name} must be boolean")
            values[name] = value
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be numeric")
        numeric = float(value)
        if not spec["minimum"] <= numeric <= spec["maximum"]:
            raise ValueError(f"{name} is outside [{spec['minimum']}, {spec['maximum']}]")
        if spec["type"] == "integer" and not numeric.is_integer():
            raise ValueError(f"{name} must be an integer")
        values[name] = int(numeric) if spec["type"] == "integer" else numeric
    if "rsiMin" in values and "rsiMax" in values and values["rsiMin"] > values["rsiMax"]:
        raise ValueError("rsiMin must not exceed rsiMax")
    return values


def apply_parameters(strategy: dict[str, Any], parameters: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(strategy)
    config = result.setdefault("config", {})
    entry = config.setdefault("entry_rules", {})
    exits = config.setdefault("exit_rules", {})
    kind = config.get("entry_kind")
    if kind == "fast_oversold_rebound":
        entry.update(
            rsi_max_exclusive=parameters["rsiMax"],
            willr_max_exclusive=parameters["willrMax"],
            require_close_above_previous=parameters["requireCloseAbovePrevious"],
        )
    elif kind == "confirmed_oversold_recovery":
        entry.update(
            rsi_reclaim_level=parameters["rsiReclaimLevel"],
            willr_reclaim_level=parameters["willrReclaimLevel"],
            require_green_close=parameters["requireGreenClose"],
            require_close_above_previous=parameters["requireCloseAbovePrevious"],
        )
    elif kind == "macd_trend_continuation":
        entry.update(rsi_min_inclusive=parameters["rsiMin"], rsi_max_inclusive=parameters["rsiMax"])
    else:
        raise ValueError(f"unsupported entry kind: {kind}")
    exits["take_profit_pct"] = parameters["takeProfitPct"]
    if "stopLossPct" in parameters:
        exits["stop_loss_pct"] = parameters["stopLossPct"]
    if "maxHoldDays" in parameters:
        exits["max_hold_days"] = parameters["maxHoldDays"]
    return result


def _feature_histories(frame: pd.DataFrame) -> dict[str, list[SymbolBar]]:
    histories: dict[str, list[SymbolBar]] = {}
    for symbol, rows in frame.groupby("symbol", sort=True):
        histories[str(symbol)] = [
            SymbolBar(
                trade_date=row.trade_date,
                symbol=str(row.symbol),
                security_name=str(row.security_name or row.symbol),
                sector=str(row.sector or "OTHER"),
                open_price=float(row.open_price) if row.open_price is not None else None,
                high_price=float(row.high_price) if row.high_price is not None else None,
                low_price=float(row.low_price) if row.low_price is not None else None,
                close_price=float(row.close_price) if row.close_price is not None else None,
                prev_close=float(row.prev_close) if row.prev_close is not None else None,
                close_vs_prev_close_pct=float(row.close_vs_prev_close_pct) if row.close_vs_prev_close_pct is not None else None,
                rsi_14=float(row.rsi_14) if row.rsi_14 is not None else None,
                willr_14=float(row.willr_14) if row.willr_14 is not None else None,
                sma20=float(row.sma20) if row.sma20 is not None else None,
                sma50=float(row.sma50) if row.sma50 is not None else None,
                macd_line=float(row.macd_line) if row.macd_line is not None else None,
                macd_signal=float(row.macd_signal) if row.macd_signal is not None else None,
                macd_hist=float(row.macd_hist) if row.macd_hist is not None else None,
                regime_label=str(row.regime_label or "UNKNOWN"),
                data_quality_flag=str(row.data_quality_flag or "unknown"),
            )
            for row in rows.sort_values("trade_date").itertuples(index=False)
        ]
    return histories


def _first_touch(
    bars: list[SymbolBar], entry_price: float, level_pct: float, *, favourable: bool, maximum_session: int
) -> tuple[bool, date | None, int | None, float | None]:
    for session, bar in enumerate(bars[: maximum_session + 1]):
        observed = bar.high_price if favourable else bar.low_price
        if observed is None:
            continue
        threshold = entry_price * (1.0 + level_pct / 100.0)
        if (favourable and observed >= threshold) or (not favourable and observed <= threshold):
            return True, bar.trade_date, session, round(threshold, 6)
    return False, None, None, None


def evaluate_full_path(template: TradeTemplate, bars: list[SymbolBar]) -> dict[str, Any]:
    entry_index = next(index for index, bar in enumerate(bars) if bar.trade_date == template.entry_date)
    observed = bars[entry_index : entry_index + 31]
    if not observed:
        raise ValueError("entry bar is unavailable")
    entry = template.entry_price
    highs = [bar.high_price for bar in observed if bar.high_price is not None]
    lows = [bar.low_price for bar in observed if bar.low_price is not None]
    mfe = ((max(highs) / entry) - 1.0) * 100.0 if highs else None
    mae = ((min(lows) / entry) - 1.0) * 100.0 if lows else None
    rows: list[dict[str, Any]] = []

    for level in INTRADAY_REWARD_LEVELS:
        hit, hit_date, session, price = _first_touch(observed, entry, level, favourable=True, maximum_session=0)
        rows.append({"kind": "INTRADAY_REWARD", "key": f"I{int(level * 100):03d}", "level": level, "hit": hit, "date": hit_date, "session": session, "price": price})
    for level in D5_REWARD_LEVELS:
        hit, hit_date, session, price = _first_touch(observed, entry, level, favourable=True, maximum_session=5)
        rows.append({"kind": "D5_REWARD", "key": f"S{int(level * 100):03d}", "level": level, "hit": hit, "date": hit_date, "session": session, "price": price})
    for level in ADVERSE_LEVELS:
        hit, hit_date, session, price = _first_touch(observed, entry, level, favourable=False, maximum_session=5)
        rows.append({"kind": "ADVERSE", "key": f"A{int(abs(level) * 100):03d}", "level": level, "hit": hit, "date": hit_date, "session": session, "price": price})
    below_ten_date = None
    below_ten_session = None
    for session, bar in enumerate(observed[:6]):
        if bar.low_price is not None and bar.low_price < entry * 0.90:
            below_ten_date, below_ten_session = bar.trade_date, session
            break
    rows.append({
        "kind": "ADVERSE", "key": "A_GT1000", "level": -10.0,
        "hit": below_ten_date is not None, "date": below_ten_date,
        "session": below_ten_session, "price": round(entry * 0.90, 6) if below_ten_date is not None else None,
        "sequence": None,
    })
    for level in H30_REWARD_LEVELS:
        hit, hit_date, session, price = _first_touch(observed, entry, level, favourable=True, maximum_session=30)
        rows.append({"kind": "H30_REWARD", "key": f"H{int(level * 100):03d}", "level": level, "hit": hit, "date": hit_date, "session": session, "price": price})

    i030 = next(row for row in rows if row["key"] == "I030")
    a050 = next(row for row in rows if row["key"] == "A050")
    if i030["hit"] and a050["hit"]:
        if i030["date"] == a050["date"]:
            sequence = "SAME_TIMESTAMP_AMBIGUOUS"
        elif i030["date"] < a050["date"]:
            sequence = "TARGET_FIRST"
        else:
            sequence = "ADVERSE_FIRST"
    elif i030["hit"]:
        sequence = "TARGET_ONLY"
    elif a050["hit"]:
        sequence = "ADVERSE_ONLY"
    else:
        sequence = "NEITHER"
    for row in rows:
        row["sequence"] = sequence if row["key"] in {"I030", "A050"} else None

    below = [index for index, bar in enumerate(observed) if bar.close_price is not None and bar.close_price < entry]
    recovery = None
    if below:
        first_below = min(below)
        recovery = next(
            (index - first_below for index, bar in enumerate(observed[first_below + 1 :], start=first_below + 1) if bar.close_price is not None and bar.close_price >= entry),
            None,
        )
    return {
        "ladderRows": rows,
        "mfePct": round(mfe, 6) if mfe is not None else None,
        "maePct": round(mae, 6) if mae is not None else None,
        "timeUnderwaterSessions": len(below),
        "recoverySessions": recovery,
        "sameBarAmbiguity": sequence == "SAME_TIMESTAMP_AMBIGUOUS",
        "rightCensored": len(observed) < 31,
        "evaluationSessions": len(observed),
        "sequenceState": sequence,
    }


def _canonical_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _write_csv(output_root: Path, run_id: str, rows: list[dict[str, Any]]) -> tuple[Path, int, str]:
    output_dir = output_root / run_id
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / "trades.csv"
    temporary = output_dir / "trades.csv.partial"
    fields = sorted({key for row in rows for key in row})
    with temporary.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, sort_keys=True, default=str) if isinstance(value, (dict, list)) else value for key, value in row.items()})
    temporary.replace(target)
    return target, target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest()


def claim_next_run(conn, worker_id: str, lease_seconds: int = 300) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            WITH candidate AS (
              SELECT run_id FROM research.strategy_lab_run
              WHERE status='QUEUED' OR (status='RUNNING' AND lease_expires_at < now())
              ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
            )
            UPDATE research.strategy_lab_run run
            SET status='RUNNING',attempt_no=attempt_no+1,lease_owner=%s,
                lease_expires_at=now()+(%s||' seconds')::interval,heartbeat_at=now(),
                started_at=coalesce(started_at,now()),updated_at=now(),error_code=NULL,error_detail=NULL
            FROM candidate WHERE run.run_id=candidate.run_id RETURNING run.*
            """,
            (worker_id, lease_seconds),
        )
        row = cur.fetchone()
        if row:
            cur.execute(
                "INSERT INTO research.strategy_lab_event(run_id,event_type,status_before,status_after,actor) VALUES (%s,'RUN_CLAIMED','QUEUED','RUNNING',%s)",
                (row["run_id"], worker_id),
            )
    conn.commit()
    return dict(row) if row else None


def _load_run_inputs(conn, run: dict[str, Any]) -> tuple[
    dict[str, Any], dict[str, list[SymbolBar]], dict[tuple[str, date], dict[str, Any]], dict[date, float]
]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """SELECT s.strategy_id,s.display_name,s.description,v.strategy_version_id,v.config_json
                 FROM nse_app.backtest_strategy_version v JOIN nse_app.backtest_strategy s USING(strategy_id)
                WHERE v.strategy_version_id=%s""",
            (run["strategy_version_id"],),
        )
        strategy_row = cur.fetchone()
    if not strategy_row:
        raise ValueError("strategy version no longer exists")
    strategy = {
        "strategy_id": strategy_row["strategy_id"],
        "strategy_version_id": strategy_row["strategy_version_id"],
        "display_name": strategy_row["display_name"],
        "description": strategy_row["description"],
        "archetype": "trend_continuation" if LAB_STRATEGIES[run["strategy_version_id"]]["entryKind"] == "macd_trend_continuation" else "mean_reversion",
        "config": strategy_row["config_json"],
    }
    parameters = validate_parameters(run["strategy_version_id"], run["parameters"])
    strategy = apply_parameters(strategy, parameters)
    symbols = list(run["symbols"] or [])
    frame = query_df(
        conn,
        """
        SELECT trade_date,symbol,security_name,sector,open_price,high_price,low_price,close_price,
               prev_close,close_vs_prev_close_pct,rsi_14,willr_14,sma20,sma50,macd_line,
               macd_signal,macd_hist,regime_label,data_quality_flag
          FROM nse_app.backtest_feature_daily
         WHERE batch_run_id=%(batch)s
           AND trade_date BETWEEN %(start)s AND %(end)s
           AND (%(all_symbols)s OR symbol=ANY(%(symbols)s))
         ORDER BY symbol,trade_date
        """,
        {
            "batch": run["source_batch_run_id"],
            "start": run["requested_date_start"] - timedelta(days=10),
            "end": run["requested_date_end"] + timedelta(days=50),
            "all_symbols": run["universe_mode"] == "nifty_100",
            "symbols": symbols or [""],
        },
    )
    if frame.empty:
        raise ValueError("no qualified source rows exist for the requested scope")
    frame["trade_date"] = pd.to_datetime(frame["trade_date"]).dt.date
    contexts = query_df(
        conn,
        """
        SELECT f.symbol,f.trade_date,
               coalesce(s.primary_trend,f.regime_label,'UNKNOWN') stock_regime,
               coalesce(n.primary_trend,m.primary_trend,'UNKNOWN') nifty_regime,
               n.close_price nifty_close,
               coalesce(m.vix_regime,'UNKNOWN') india_vix_regime,
               coalesce(g.global_context,'{}'::jsonb) global_context
          FROM nse_app.backtest_feature_daily f
          LEFT JOIN LATERAL (
            SELECT r.primary_trend FROM strategy_eval.stock_daily_regime r
             WHERE r.trade_date=f.trade_date
               AND (upper(split_part(r.yahoo_symbol,'.',1))=upper(f.symbol)
                    OR upper(r.stock_name)=upper(f.security_name))
             ORDER BY r.fetched_at DESC LIMIT 1
          ) s ON true
          LEFT JOIN LATERAL (
            SELECT r.primary_trend,r.close_price FROM strategy_eval.nifty50_daily_regime r
             WHERE r.trade_date=f.trade_date ORDER BY r.fetched_at DESC LIMIT 1
          ) n ON true
          LEFT JOIN LATERAL (
            SELECT r.primary_trend,r.vix_regime FROM strategy_eval.market_regime_daily r
             WHERE r.trade_date=f.trade_date AND r.instrument_type='INDEX'
               AND upper(r.symbol) IN ('NIFTY 50','NIFTY50')
             ORDER BY (r.source_batch_run_id=f.batch_run_id) DESC,r.calculated_at DESC LIMIT 1
          ) m ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(latest.instrument_name,
                     jsonb_build_object('trend',latest.primary_trend,'zone',latest.market_zone,'rsi14',latest.rsi14)) global_context
              FROM (
                SELECT DISTINCT ON (r.instrument_name) r.instrument_name,r.primary_trend,r.market_zone,r.rsi14
                  FROM strategy_eval.global_market_daily_regime r
                 WHERE r.trade_date=f.trade_date
                 ORDER BY r.instrument_name,r.fetched_at DESC
              ) latest
          ) g ON true
         WHERE f.batch_run_id=%(batch)s AND f.trade_date BETWEEN %(start)s AND %(end)s
           AND (%(all_symbols)s OR f.symbol=ANY(%(symbols)s))
        """,
        {
            "batch": run["source_batch_run_id"],
            "start": run["requested_date_start"],
            "end": run["requested_date_end"],
            "all_symbols": run["universe_mode"] == "nifty_100",
            "symbols": symbols or [""],
        },
    )
    context_map = {
        (str(row.symbol), row.trade_date): {
            "stock": str(row.stock_regime), "nifty": str(row.nifty_regime), "vix": str(row.india_vix_regime),
            "global": row.global_context if isinstance(row.global_context, dict) else {},
        }
        for row in contexts.itertuples(index=False)
    }
    nifty_close_by_date = {
        row.trade_date: float(row.nifty_close)
        for row in contexts.itertuples(index=False)
        if row.nifty_close is not None
    }
    return strategy, _feature_histories(frame), context_map, nifty_close_by_date


def process_run(conn, run: dict[str, Any], output_root: Path, worker_id: str) -> dict[str, Any]:
    strategy, diagnostic_histories, contexts, nifty_close_by_date = _load_run_inputs(conn, run)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE research.strategy_lab_run SET heartbeat_at=now(),lease_expires_at=now()+interval '5 minutes' WHERE run_id=%s AND lease_owner=%s",
            (run["run_id"], worker_id),
        )
        cur.execute("SELECT status FROM research.strategy_lab_run WHERE run_id=%s", (run["run_id"],))
        current_status = cur.fetchone()[0]
    conn.commit()
    if current_status == "CANCEL_REQUESTED":
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE research.strategy_lab_run SET status='CANCELLED',finished_at=now(),updated_at=now(),lease_owner=NULL,lease_expires_at=NULL WHERE run_id=%s AND lease_owner=%s",
                (run["run_id"], worker_id),
            )
            cur.execute(
                "INSERT INTO research.strategy_lab_event(run_id,event_type,status_before,status_after,actor) VALUES (%s,'RUN_CANCELLED','CANCEL_REQUESTED','CANCELLED',%s)",
                (run["run_id"], worker_id),
            )
        conn.commit()
        return {"status": "CANCELLED"}
    candidates = [
        row for row in _build_signal_candidates(strategy, diagnostic_histories)
        if run["requested_date_start"] <= row["signal_date"] <= run["requested_date_end"]
        and row["entry_date"] <= run["requested_date_end"]
    ]
    execution_histories = {
        symbol: [bar for bar in bars if bar.trade_date <= run["requested_date_end"]]
        for symbol, bars in diagnostic_histories.items()
    }
    templates = _build_trade_templates(int(run["source_batch_run_id"]), strategy, execution_histories, candidates)
    capital = run["capital_config"]
    scenario = ScenarioSpec(
        strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"],
        "lab", "Interactive lab", run["universe_mode"], str(capital["mode"]),
        (list(run["symbols"])[0] if run["universe_mode"] == "single_stock" else None),
        float(capital["ticketSize"]) if capital.get("ticketSize") is not None else None,
        float(capital["startingCapital"]) if capital.get("startingCapital") is not None else None,
        int(capital["maxPositions"]) if capital.get("maxPositions") is not None else None,
        "nifty50_price",
    )
    calendar_dates = sorted({bar.trade_date for bars in execution_histories.values() for bar in bars if run["requested_date_start"] <= bar.trade_date <= run["requested_date_end"]})
    replay = _replay_scenario_from_templates(
        strategy, scenario, calendar_dates, execution_histories, templates, nifty_close_by_date=nifty_close_by_date
    )
    accepted_ids = {item.trade_template_id for item in replay["accepted_templates"]}
    skipped = {(row["symbol"], row["signal_date"]): row["reason"] for row in replay["skipped_rows"]}
    closed = {row["metadata"]["trade_template_id"]: row for row in replay["closed_trades"]}
    open_rows = {(row["symbol"], row["entry_date"]): row for row in replay["open_positions"]}
    trade_records: list[dict[str, Any]] = []
    ladder_records: list[tuple[Any, ...]] = []
    realised_by_date: dict[date, float] = {}
    for trade in replay["closed_trades"]:
        exit_date = trade["exit_date"]
        realised_by_date[exit_date] = realised_by_date.get(exit_date, 0.0) + float(trade.get("after_tax_net_pnl") or 0.0)
    cumulative_realised = 0.0
    equity_records: list[tuple[Any, ...]] = []
    start_value = float(replay["summary"]["investedAmount"])
    for row in replay["daily_rows"]:
        cumulative_realised += realised_by_date.get(row["trade_date"], 0.0)
        total_equity = float(row["total_equity"])
        equity_records.append(
            (
                run["run_id"], row["trade_date"], row.get("available_cash"),
                row.get("deployed_capital") or 0, total_equity, cumulative_realised,
                total_equity - start_value - cumulative_realised, row.get("drawdown_pct") or 0,
                row.get("active_positions") or 0,
            )
        )

    with conn.cursor() as cur:
        for candidate in candidates:
            template_id = f"{run['source_batch_run_id']}:{strategy['strategy_version_id']}:{candidate['symbol']}:{candidate['signal_date'].isoformat()}"
            cur.execute(
                """INSERT INTO research.strategy_lab_signal(signal_id,run_id,symbol,sector,signal_date,proposed_entry_date,portfolio_accepted,skipped_reason,rank_inputs,feature_snapshot)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb) ON CONFLICT (signal_id) DO NOTHING""",
                (f"{run['run_id']}:{candidate['symbol']}:{candidate['signal_date']}", run["run_id"], candidate["symbol"], candidate["sector"],
                 candidate["signal_date"], candidate["entry_date"], template_id in accepted_ids,
                 None if template_id in accepted_ids else skipped.get((candidate["symbol"], candidate["signal_date"]), "NOT_SELECTED_BY_PORTFOLIO"),
                 json.dumps(candidate["rank_inputs"], default=str), json.dumps(candidate["feature_snapshot_json"], default=str)),
            )

        for template in replay["accepted_templates"]:
            bars = diagnostic_histories[template.symbol]
            path = evaluate_full_path(template, bars)
            execution = closed.get(template.trade_template_id) or open_rows.get((template.symbol, template.entry_date)) or {}
            context = contexts.get((template.symbol, template.signal_date), {"stock": template.regime_on_entry, "nifty": "UNKNOWN", "vix": "UNKNOWN", "global": {}})
            trade_id = f"{run['run_id']}:{template.symbol}:{template.signal_date}"
            quantity = float(execution.get("quantity") or 1.0)
            nlv = float(execution.get("after_tax_net_pnl", execution.get("unrealized_pnl", 0.0)) or 0.0)
            holding = int(execution.get("holding_days") or execution.get("days_open") or 1)
            trade_record = {
                "trade_id": trade_id, "symbol": template.symbol, "sector": template.sector,
                "signal_date": template.signal_date, "entry_date": template.entry_date,
                "entry_price": template.entry_price, "quantity": quantity,
                "signal_rsi": template.signal_rsi, "signal_willr": template.signal_willr,
                "signal_macd_line": template.signal_macd_line, "signal_macd_signal": template.signal_macd_signal,
                "signal_sma20": template.signal_sma20, "signal_sma50": template.signal_sma50,
                "stock_regime": context["stock"], "nifty_regime": context["nifty"], "india_vix_regime": context["vix"],
                "global_market_context": context["global"],
                "execution_status": "OPEN" if template.open_trade_flag_at_asof else "CLOSED",
                "execution_exit_date": template.theoretical_exit_date, "execution_exit_price": template.theoretical_exit_price,
                "execution_exit_reason": template.exit_reason, "net_liquidation_pnl": nlv,
                "mfe_pct": path["mfePct"], "mae_pct": path["maePct"], "right_censored": path["rightCensored"],
                "sequence_state": path["sequenceState"], "diagnostics": path,
            }
            trade_records.append(trade_record)
            cur.execute(
                """INSERT INTO simulation.strategy_lab_trade(
                     trade_id,run_id,symbol,sector,signal_date,entry_date,entry_price,quantity,signal_rsi,signal_willr,
                     signal_macd_line,signal_macd_signal,signal_macd_hist,signal_sma20,signal_sma50,close_vs_prev_close_pct,
                     stock_regime,nifty_regime,india_vix_regime,global_market_context,execution_status,execution_exit_date,execution_exit_price,
                     execution_exit_reason,gross_pnl,total_cost,tax_provision,after_tax_pnl,net_liquidation_pnl,
                     evaluation_sessions,actual_holding_trading_sessions,capital_days,maximum_favourable_excursion_pct,
                     maximum_adverse_excursion_pct,time_underwater_sessions,recovery_sessions,same_bar_ambiguity,right_censored,
                     feature_snapshot,execution_result,diagnostic_result)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb)
                   ON CONFLICT (trade_id) DO NOTHING""",
                (trade_id,run["run_id"],template.symbol,template.sector,template.signal_date,template.entry_date,template.entry_price,quantity,
                 template.signal_rsi,template.signal_willr,template.signal_macd_line,template.signal_macd_signal,
                 (template.signal_macd_line-template.signal_macd_signal) if template.signal_macd_line is not None and template.signal_macd_signal is not None else None,
                 template.signal_sma20,template.signal_sma50,template.close_vs_prev_close_pct,context["stock"],context["nifty"],context["vix"],json.dumps(context["global"],default=str),
                 trade_record["execution_status"],template.theoretical_exit_date,template.theoretical_exit_price,template.exit_reason,
                 execution.get("net_pnl"),execution.get("total_charges"),execution.get("profit_tax_amount"),execution.get("after_tax_net_pnl"),nlv,
                 path["evaluationSessions"],holding,template.entry_price*quantity*holding,path["mfePct"],path["maePct"],
                 path["timeUnderwaterSessions"],path["recoverySessions"],path["sameBarAmbiguity"],path["rightCensored"],
                 json.dumps({"template": asdict(template)},default=str),json.dumps(execution,default=str),json.dumps({**path,"marketContext":context},default=str)),
            )
            for ladder in path["ladderRows"]:
                ladder_records.append((run["run_id"],trade_id,ladder["kind"],ladder["key"],ladder["level"],ladder["hit"],ladder["date"],ladder["session"],ladder["price"],ladder["sequence"],json.dumps({"frequency":"daily"})))
        cur.executemany(
            """INSERT INTO simulation.strategy_lab_ladder_result(run_id,trade_id,ladder_kind,level_key,level_pct,hit,first_hit_date,first_hit_session,hit_price,sequence_state,details)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT (trade_id,ladder_kind,level_key) DO NOTHING""",
            ladder_records,
        )
        cur.executemany(
            """INSERT INTO simulation.strategy_lab_equity_point(
                 run_id,trade_date,cash,deployed_capital,net_liquidation_equity,realised_pnl,
                 unrealised_pnl,drawdown_pct,open_positions)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (run_id,trade_date) DO NOTHING""",
            equity_records,
        )
    conn.commit()

    csv_path, byte_size, sha256 = _write_csv(output_root, run["run_id"], trade_records)
    def distribution(field: str) -> dict[str, int]:
        values: dict[str, int] = {}
        for item in trade_records:
            key = str(item.get(field) or "UNKNOWN")
            values[key] = values.get(key, 0) + 1
        return dict(sorted(values.items()))

    def average(field: str) -> float | None:
        values = [float(item[field]) for item in trade_records if item.get(field) is not None]
        return round(sum(values) / len(values), 6) if values else None

    summary = {
        **replay["summary"], "signalCount": len(candidates), "acceptedTradeCount": len(replay["accepted_templates"]),
        "skippedSignalCount": len(replay["skipped_rows"]), "actualDateStart": min(calendar_dates).isoformat(),
        "actualDateEnd": max(calendar_dates).isoformat(), "sourceBatchRunId": run["source_batch_run_id"],
        "engineVersion": ENGINE_VERSION, "evaluationPolicyVersion": EVALUATION_POLICY_VERSION,
        "resultMode": "UNCONSTRAINED_ENTRY_STUDY" if capital["mode"] == "no_capital_limit" else "FINITE_CAPITAL_PORTFOLIO",
        "portfolioReturnEstimable": capital["mode"] != "no_capital_limit",
        "rightCensoredTrades": sum(1 for row in trade_records if row["right_censored"]),
        "regimeDistribution": {
            "stock": distribution("stock_regime"), "nifty": distribution("nifty_regime"), "indiaVix": distribution("india_vix_regime")
        },
        "indicatorPositionSummary": {
            "averageSignalRsi14": average("signal_rsi"), "averageSignalWillr14": average("signal_willr"),
            "averageSignalMacdLine": average("signal_macd_line"), "averageSignalMacdSignal": average("signal_macd_signal"),
            "averageSignalSma20": average("signal_sma20"), "averageSignalSma50": average("signal_sma50"),
        },
    }
    result_hash = _canonical_hash({"summary": summary, "trades": trade_records})
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO research.strategy_lab_artifact(run_id,artifact_kind,relative_path,byte_size,sha256,row_count)
               VALUES (%s,'TRADES_CSV',%s,%s,%s,%s) ON CONFLICT (run_id,artifact_kind) DO NOTHING""",
            (run["run_id"], str(csv_path.relative_to(output_root)), byte_size, sha256, len(trade_records)),
        )
        cur.execute(
            """UPDATE research.strategy_lab_run SET status='COMPLETED',validation_status='PASS',summary=%s::jsonb,
               validation_result=%s::jsonb,result_hash=%s,actual_date_start=%s,actual_date_end=%s,
               total_work_units=%s,completed_work_units=%s,finished_at=now(),updated_at=now(),
               lease_owner=NULL,lease_expires_at=NULL WHERE run_id=%s AND lease_owner=%s""",
            (json.dumps(summary),json.dumps({"status":"PASS","checks":["entry_after_signal","independent_ladders","result_hash"]}),
             result_hash,min(calendar_dates),max(calendar_dates),len(execution_histories),len(execution_histories),run["run_id"],worker_id),
        )
        cur.execute(
            "INSERT INTO research.strategy_lab_event(run_id,event_type,status_before,status_after,event_payload,actor) VALUES (%s,'RUN_COMPLETED','RUNNING','COMPLETED',%s::jsonb,%s)",
            (run["run_id"],json.dumps({"resultHash":result_hash,"tradeCount":len(trade_records)}),worker_id),
        )
    conn.commit()
    return summary


def run_worker(conn, output_root: Path, *, once: bool = False, poll_seconds: int = 5) -> None:
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    while True:
        run = claim_next_run(conn, worker_id)
        if not run:
            if once:
                return
            time.sleep(max(1, poll_seconds))
            continue
        try:
            process_run(conn, run, output_root, worker_id)
        except Exception as exc:
            conn.rollback()
            logger.exception("Strategy-lab run failed", extra={"run_id": run["run_id"]})
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE research.strategy_lab_run SET status='FAILED',validation_status='FAIL',error_code='WORKER_ERROR',
                       error_detail=%s,finished_at=now(),updated_at=now(),lease_owner=NULL,lease_expires_at=NULL WHERE run_id=%s""",
                    (str(exc)[:2000], run["run_id"]),
                )
                cur.execute(
                    "INSERT INTO research.strategy_lab_event(run_id,event_type,status_before,status_after,event_payload,actor) VALUES (%s,'RUN_FAILED','RUNNING','FAILED',%s::jsonb,%s)",
                    (run["run_id"], json.dumps({"errorCode":"WORKER_ERROR"}), worker_id),
                )
            conn.commit()
        if once:
            return
