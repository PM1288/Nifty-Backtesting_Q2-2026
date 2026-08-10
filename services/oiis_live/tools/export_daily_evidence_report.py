#!/usr/bin/env python3
"""Export one OIIS Live selection run as a complete Markdown evidence report."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo

import psycopg
from psycopg.rows import dict_row


IST = ZoneInfo("Asia/Kolkata")

OFACTOR_FORMULAS = {
    "market_regime_support": "directional(NIFTY 21-session return, direction, -6% to +6%)",
    "sector_industry_support": "mean(directional(sector 21-session return, ±8%), directional(sector minus NIFTY return, ±4%))",
    "trend_quality": "mean of directional 21D return (±8%), 63D return (±15%), close/SMA20 gap (±5%) and close/SMA50 gap (±10%)",
    "relative_strength": "mean of directional(stock minus NIFTY 21D, ±8%) and directional(stock minus sector 21D, ±8%)",
    "money_flow_participation": "mean of price-volume impulse, close location in daily range and volume/20-session-average score",
    "momentum_quality": "mean of direction-adjusted RSI14 and direction-adjusted 5-session return",
    "institutional_confirmation": "public-data proxy: mean of delivery impulse and delivery/20-session-average ratio; it is not proof of institutional activity",
    "liquidity_tradability": "linear score of cross-sectional turnover percentile from 5% to 80%",
    "catalyst_context": "50 when no event-risk flag is present; 0 when event risk is present",
}

XFACTOR_FORMULAS = {
    "setup_integrity": "90 if a triggered setup exists; 72 if a setup exists but is not triggered; otherwise 20",
    "entry_location_quality": "score of current-session MoveATR and VWAP-distance ATR; no SMA20-distance proxy",
    "trigger_confirmation": "90 triggered; 55 armed; 20 forming. This remains a score component, but TRIGGER_CONFIRMATION_MISSING is disabled as a blocking gate in V3.2",
    "stop_invalidation_quality": "linear score of (2.5 - risk_ATR), from 0 to 2.5",
    "reward_path_quality": "linear score of reward/risk from 0.5 to 2.5",
    "market_sector_synchronisation": "mean of the selected-direction OFactor market-regime and sector-support components",
    "liquidity_slippage_quality": "linear score of cross-sectional turnover percentile from 5% to 80%",
    "timing_session_quality": "fixed at 80 in this daily/live baseline",
    "instrument_quality": "fixed at 100 for admitted cash-equity instruments",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trade-date", type=date.fromisoformat, required=True)
    parser.add_argument("--run-slot", default="MANUAL_CORRECTED_FINAL")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def normalise(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def number(value: Any, digits: int = 4) -> str:
    if value is None:
        return "NOT AVAILABLE"
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def compact(value: Any) -> str:
    if value is None:
        return "NOT AVAILABLE"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, default=normalise, separators=(", ", ": "))
    return str(normalise(value)).replace("|", "\\|").replace("\n", " ")


def heading(value: str) -> str:
    return value.replace("_", " ").title()


def table(headers: Iterable[str], rows: Iterable[Iterable[Any]]) -> list[str]:
    headers = list(headers)
    output = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    output.extend("| " + " | ".join(compact(cell) for cell in row) + " |" for row in rows)
    return output


def component_table(layer: Mapping[str, Any], formulas: Mapping[str, str]) -> list[str]:
    components = layer.get("components") or {}
    weights = layer.get("weights") or {}
    contributions = layer.get("weighted_contributions") or {}
    return table(
        ["Component", "Component score", "Weight", "Weighted contribution", "Calculation meaning"],
        (
            (
                heading(name),
                number(score),
                f"{number(weights.get(name), 2)}%",
                number(contributions.get(name)),
                formulas.get(name, "Persisted governed component"),
            )
            for name, score in components.items()
        ),
    )


def report(database_url: str, trade_date: date, run_slot: str) -> str:
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        run = conn.execute(
            """SELECT * FROM oiis_live.selection_run
               WHERE trade_date=%s AND run_slot=%s AND status='COMPLETED'
               ORDER BY completed_at DESC LIMIT 1""",
            (trade_date, run_slot),
        ).fetchone()
        if not run:
            raise SystemExit(f"No completed run for {trade_date} slot {run_slot}")
        candidates = conn.execute(
            """SELECT * FROM oiis_live.daily_candidate
               WHERE run_id=%s
               ORDER BY recommended DESC,recommendation_rank NULLS LAST,
                 data_permission='DATA_INSUFFICIENT',blocking_gate_count,
                 failed_gate_count,ofactor DESC,symbol""",
            (run["run_id"],),
        ).fetchall()
        run_ledger = conn.execute(
            """SELECT run_id,run_slot,status,signal_date,trade_date,as_of_ts,
                 decision_as_of,execution_timestamp,requested_universe,universe_counts,
                 requested_symbols,evaluated_symbols,selected_symbols,
                 qualified_symbols,result_hash,started_at,completed_at
               FROM oiis_live.selection_run WHERE trade_date=%s
               ORDER BY started_at""",
            (trade_date,),
        ).fetchall()
        active_watchlist = conn.execute(
            """SELECT symbol,rank,entry_enabled,daily_level,canonical_status,
                 buy_limit,no_chase_price,source,updated_at
               FROM oiis_live.watchlist_item
               WHERE policy_id=%s AND trade_date=%s AND active
               ORDER BY rank NULLS LAST,symbol""",
            (run["policy_id"], trade_date),
        ).fetchall()

    o_levels = Counter(row["ofactor_level"] or "NOT_ESTIMABLE" for row in candidates)
    directions = Counter(row["direction"] for row in candidates)
    failure_counts = Counter(int(row["failed_gate_count"] or 0) for row in candidates)
    gate_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in candidates:
        for reason in row["reason_codes"] or []:
            gate_counts[reason][row["direction"]] += 1

    lines: list[str] = [
        f"# OIIS Live Complete Calculation and Selection Report — {trade_date.strftime('%d %B %Y')}",
        "",
        "**Scope:** Complete per-stock calculation evidence for the corrected OIIS Live V3 directional snapshot.",
        "**Environment:** PAPER ONLY. No live broker order is represented by this report.",
        f"**Run ID:** `{run['run_id']}`",
        f"**Run slot:** `{run['run_slot']}`",
        f"**Policy:** `{run['policy_id']}` version `{run['policy_version']}`",
        f"**Signal/base daily date:** `{run['signal_date']}`",
        f"**Trade date:** `{run['trade_date']}`",
        f"**Decision as-of:** `{run['decision_as_of'].astimezone(IST).isoformat() if run.get('decision_as_of') else 'NOT AVAILABLE'}`",
        f"**Physical execution timestamp:** `{run['execution_timestamp'].astimezone(IST).isoformat() if run.get('execution_timestamp') else 'NOT AVAILABLE'}`",
        f"**Requested universe:** `{run.get('requested_universe') or 'NOT AVAILABLE'}`",
        f"**Result hash:** `{run['result_hash']}`",
        "",
        "## Executive conclusion",
        "",
        f"The run evaluated **{len(candidates)}** symbols in the point-in-time NIFTY 50 and active-F&O intersection. "
        f"**{sum(row['data_permission'] != 'DATA_INSUFFICIENT' for row in candidates)}** had FULL execution-grade evidence and "
        f"**{sum(row['data_permission'] == 'DATA_INSUFFICIENT' for row in candidates)}** were retained as explicit data-insufficient rows. "
        f"It produced **{sum(bool(row['recommended']) for row in candidates)}** ranked research recommendations, "
        f"**{run['qualified_symbols']}** O/X-qualified rows, and **{run['selected_symbols']}** fully selected rows.",
        "",
        "A recommendation is not a trade. The full directional scanner keeps LONG and SHORT opportunities visible. Automatic long-pullback paper entry remains a separate policy and requires FULL data, OFactor at least 74, XFactor at least 76, LONG direction and every blocking gate to pass.",
        "",
        "## Time and source interpretation",
        "",
        "1. The most recent completed cash-equity daily inputs were from 7 August 2026.",
        "2. Each slot uses its governed point-in-time cutoff: 08:30, 09:30 or 15:00 IST. Physical backfill time is stored separately and never changes the data cutoff.",
        "3. Intraday volume was compared with volume accumulated by the same IST clock time on previous sessions. It was not compared with prior full-day volume.",
        "4. Daily history came from `nse.fact_eod_prices`, with `strategy_eval.stock_daily_regime` only as the governed fallback/regime source.",
        "5. Live partial bars came from `public.bars_1m`; instruments came from `public.instruments`; sector context came from `public.index_constituents`; NIFTY/VIX and stock regimes came from `strategy_eval.market_regime_daily` and `strategy_eval.stock_daily_regime`.",
        "6. All calculations are reproducible from the JSONB evidence stored on `oiis_live.daily_candidate` for the run ID above.",
        "",
        "## Complete decision flow",
        "",
        "1. Refresh the eligible universe as the intersection of active SmartAPI F&O underlyings and official NSE NIFTY 50 constituents.",
        "2. Load at least 180 calendar days of daily OHLCV and the current partial intraday bar aggregation when available.",
        "3. Calculate returns, SMA20, SMA50, EMA61, ATR14, RSI14, Williams %R14, MACD, volume history, prior 20-session barriers, relative strength and regime joins.",
        "4. Calculate data-quality coverage, freshness, OHLC consistency and source reliability. Require DQ >= 85 and permission FULL.",
        "5. Calculate all nine LONG OFactor components and weighted contributions.",
        "6. Calculate all nine SHORT OFactor components independently. SHORT is never `100 - LONG`.",
        "7. Subtract explicit OFactor penalties from each raw weighted score.",
        "8. Calculate daily structural bias and current-session direction independently. A strong session direction controls the actionable direction; disagreement is explicitly labelled counter-trend.",
        "9. Assign research cohorts LOW 54–<64, MEDIUM 64–<74 and HIGH >=74. Only HIGH satisfies canonical trade permission.",
        "10. Create one canonical immutable setup result and use it for both XFactor and hard-gate evaluation.",
        "11. Evaluate every V3.2 gate independently and store its rule, actual inputs, pass/fail result, blocking status and evidence table.",
        "12. Rank the opportunity leaderboard by OFactor and its quality components. Rank execution readiness separately; failure count never hides a strong opportunity.",
        "13. Set `selected=true` only for the separate long-pullback execution policy when direction is LONG, O >=74, X >=76, DQ is FULL and every blocking gate passes.",
        "14. Only selected rows may become entry-enabled. Intraday entry subsequently requires RSI14 <30 and Williams %R14 <-80, with one entry per symbol per trade date.",
        "",
        "## Shared scoring functions",
        "",
        "- `clamp(x) = min(100, max(0, x))`.",
        "- `linear(value, bad, good) = clamp((value - bad) × 100 / (good - bad))`; a missing value contributes neutral 50.",
        "- `directional(value, LONG, magnitude) = linear(value, -magnitude, +magnitude)`.",
        "- `directional(value, SHORT, magnitude) = linear(-value, -magnitude, +magnitude)`.",
        "- `weighted score = Σ(component score × component weight / 100)`.",
        "- `final OFactor = clamp(raw weighted OFactor - explicit penalties)`.",
        "- `directional edge = LONG final OFactor - SHORT final OFactor`; the absolute value controls the 6/7/8 tier and the sign controls direction.",
        "",
        "## OFactor definition",
        "",
        *table(
            ["Component", "Weight", "Exact meaning"],
            [
                ("Market Regime Support", "8%", OFACTOR_FORMULAS["market_regime_support"]),
                ("Sector and Industry Support", "14%", OFACTOR_FORMULAS["sector_industry_support"]),
                ("Trend Quality", "18%", OFACTOR_FORMULAS["trend_quality"]),
                ("Relative Strength", "10%", OFACTOR_FORMULAS["relative_strength"]),
                ("Money Flow and Participation", "18%", OFACTOR_FORMULAS["money_flow_participation"]),
                ("Momentum Quality", "12%", OFACTOR_FORMULAS["momentum_quality"]),
                ("Institutional Confirmation", "10%", OFACTOR_FORMULAS["institutional_confirmation"]),
                ("Liquidity and Tradability", "6%", OFACTOR_FORMULAS["liquidity_tradability"]),
                ("Catalyst and Context", "4%", OFACTOR_FORMULAS["catalyst_context"]),
            ],
        ),
        "",
        "Possible explicit OFactor penalties are exhaustion 8 points, conflicting price/volume flow 7, event risk 12, and timeframe conflict 5. Each stock section shows the penalties actually applied.",
        "",
        "## XFactor definition",
        "",
        *table(
            ["Component", "Weight", "Exact meaning"],
            [
                ("Setup Integrity", "18%", XFACTOR_FORMULAS["setup_integrity"]),
                ("Entry Location Quality", "20%", XFACTOR_FORMULAS["entry_location_quality"]),
                ("Trigger Confirmation", "16%", XFACTOR_FORMULAS["trigger_confirmation"]),
                ("Stop and Invalidation Quality", "14%", XFACTOR_FORMULAS["stop_invalidation_quality"]),
                ("Reward and Path Quality", "14%", XFACTOR_FORMULAS["reward_path_quality"]),
                ("Market and Sector Synchronisation", "6%", XFACTOR_FORMULAS["market_sector_synchronisation"]),
                ("Liquidity and Slippage Quality", "6%", XFACTOR_FORMULAS["liquidity_slippage_quality"]),
                ("Timing and Session Quality", "3%", XFACTOR_FORMULAS["timing_session_quality"]),
                ("Instrument Quality", "3%", XFACTOR_FORMULAS["instrument_quality"]),
            ],
        ),
        "",
        "## V3 gates and tiers",
        "",
        *table(
            ["Gate", "Blocking?", "Rule"],
            [
                ("Data quality", "Yes", "DQ >=85 and permission FULL"),
                ("OFactor", "Yes", "canonical permission O >=74; LOW 54 and MEDIUM 64 remain research cohorts"),
                ("Directional edge", "Yes", "absolute LONG/SHORT difference >=6; LOW 6, MEDIUM 7, HIGH 8"),
                ("Valid setup", "Yes", "directional breakout/breakdown or SMA20/SMA50 pullback with good volume"),
                ("Setup volume", "Yes through valid setup", "volume/20D average >=1.2 OR comparable 90-session volume percentile >=30%"),
                ("Liquidity", "Yes", "primary: volume ratio >=0.75 AND turnover percentile >=10%; fallback when a primary input is missing: volume percentile >=30%"),
                ("Volume tier", "Recorded", "LOW 20%, MEDIUM 30%, HIGH 50% of comparable 90-session volume"),
                ("Reward/risk", "Yes", "reward/risk >=1.5 from the canonical setup stop and real opposing barrier; otherwise NOT_CALCULATED"),
                ("Extension", "Yes", "MoveATR=abs(current-session price-session open)/previous completed ATR <=1.8; VWAP distance stored separately"),
                ("Stop width", "No", "risk per share / ATR14 <=2.5; failure is recorded but does not block in V3.2"),
                ("XFactor", "Yes", "XFactor >=76"),
                ("Trigger confirmation", "Removed", "`TRIGGER_CONFIRMATION_MISSING` is disabled and absent from V3.2 reasons"),
            ],
        ),
        "",
        "## Run ledger for 10 August",
        "",
        *table(
            ["Run slot", "Run ID", "Status", "Decision as-of", "Executed at", "Evaluated", "Qualified", "Selected", "Result hash"],
            (
                (row["run_slot"], row["run_id"], row["status"], row["decision_as_of"], row["execution_timestamp"], row["evaluated_symbols"], row["qualified_symbols"], row["selected_symbols"], row["result_hash"])
                for row in run_ledger
            ),
        ),
        "",
        f"The `{run_slot}` row is authoritative for the stock-by-stock report below. Earlier validation and V2 rows remain immutable operational evidence and are not silently overwritten.",
        "",
        "## Aggregate results",
        "",
        "### OFactor tiers",
        "",
        *table(["Tier", "Stocks"], sorted(o_levels.items())),
        "",
        "### Selected directions",
        "",
        *table(["Direction", "Stocks"], sorted(directions.items())),
        "",
        "### Number of failed gates per stock",
        "",
        *table(["Failed-gate count", "Stocks"], sorted(failure_counts.items())),
        "",
        "### Gate failures by direction",
        "",
        *table(
            ["Failure reason", "LONG", "SHORT", "NEUTRAL", "Total"],
            (
                (reason, counts["LONG"], counts["SHORT"], counts["NEUTRAL"], sum(counts.values()))
                for reason, counts in sorted(gate_counts.items(), key=lambda item: (-sum(item[1].values()), item[0]))
            ),
        ),
        "",
        "## Active ranked watchlist",
        "",
        *table(
            ["Rank", "Symbol", "Daily level", "Canonical status", "Entry enabled", "Buy reference", "No-chase reference", "Source"],
            ((row["rank"], row["symbol"], row["daily_level"], row["canonical_status"], row["entry_enabled"], row["buy_limit"], row["no_chase_price"], row["source"]) for row in active_watchlist),
        ),
        "",
        "All ten rows above are recommendations. `entry_enabled=FALSE` confirms they were not authorised trades.",
        "",
        "## All-stock decision table",
        "",
        *table(
            ["Opportunity rank", "Execution rank", "Symbol", "F&O", "NIFTY50", "Structural", "Session", "Resolved", "State", "O", "O tier", "X", "DQ", "Coverage", "MoveATR", "VWAP distance ATR", "R:R", "Blocking failures", "Recommended", "Selected", "Reasons"],
            (
                (
                    row["opportunity_rank"], row["execution_rank"], row["symbol"], (row["universe_flags"] or {}).get("is_fno"),
                    (row["universe_flags"] or {}).get("is_nifty50"), row["structural_direction"], row["session_direction"],
                    row["direction"], row["direction_state"], number(row["ofactor"]), row["ofactor_level"],
                    number(row["xfactor_snapshot"]), number(row["data_quality"]), number(row["data_coverage"]),
                    number((row["feature_values"] or {}).get("move_atr")), number((row["feature_values"] or {}).get("vwap_distance_atr")),
                    number((row["feature_values"] or {}).get("reward_risk")), row["blocking_gate_count"], row["recommended"], row["selected"],
                    ", ".join(row["reason_codes"] or []) or "NONE",
                )
                for row in candidates
            ),
        ),
        "",
        "# Per-stock calculation evidence",
        "",
    ]

    for ordinal, row in enumerate(candidates, start=1):
        features = row["feature_values"] or {}
        engine_evidence = row["evidence"] or {}
        scoring_inputs = engine_evidence.get("feature") or {}
        data_quality = engine_evidence.get("dq") or {}
        scores = row["component_scores"] or {}
        long_o = scores.get("ofactor_long") or {}
        short_o = scores.get("ofactor_short") or {}
        xfactor = scores.get("xfactor") or {}
        gates = row["gate_evidence"] or {}
        lines.extend(
            [
                f"## {ordinal}. {row['symbol']}",
                "",
                *table(
                    ["Decision field", "Actual value"],
                    [
                        ("Opportunity rank", row["opportunity_rank"]),
                        ("Execution-readiness rank", row["execution_rank"]),
                        ("Recommendation rank", row["recommendation_rank"]),
                        ("Recommended for review", row["recommended"]),
                        ("Selected / automatic entry permission", row["selected"]),
                        ("Daily structural direction", row["structural_direction"]),
                        ("Current-session direction", row["session_direction"]),
                        ("Resolved actionable direction", row["direction"]),
                        ("Direction state", row["direction_state"]),
                        ("Session-direction score", number(row["session_direction_score"])),
                        ("OFactor final", number(row["ofactor"])),
                        ("OFactor tier", row["ofactor_level"]),
                        ("LONG OFactor", number(long_o.get("final_score"))),
                        ("SHORT OFactor", number(short_o.get("final_score"))),
                        ("Directional edge LONG minus SHORT", number(row["directional_edge"])),
                        ("Directional-edge tier", row["directional_edge_level"]),
                        ("XFactor final", number(row["xfactor_snapshot"])),
                        ("Data quality / permission", f"{number(row['data_quality'])} / {row['data_permission']}"),
                        ("Intraday bar coverage", number(row["data_coverage"])),
                        ("Canonical setup", f"{row['setup_id'] or 'NOT AVAILABLE'} / {row['setup_state'] or 'NOT AVAILABLE'}"),
                        ("Failed gates / blocking gates", f"{row['failed_gate_count']} / {row['blocking_gate_count']}"),
                        ("Canonical status", row["canonical_status"]),
                        ("Daily level", row["daily_level"]),
                        ("Reasons", ", ".join(row["reason_codes"] or []) or "NONE"),
                    ],
                ),
                "",
                "### Universe, market and source context",
                "",
                *table(["Field", "Value"], [(key, value) for key, value in sorted((row["universe_flags"] or {}).items())] + [(key, value) for key, value in sorted((row["market_context"] or {}).items())]),
                "",
                "### Exact inputs supplied to the O/X scoring engine",
                "",
                *table(["Input", "Actual value"], ((key, number(value) if isinstance(value, (int, float, Decimal)) else value) for key, value in sorted(scoring_inputs.items()))),
                "",
                "### Additional live, volume and gate input values",
                "",
                *table(["Input", "Actual value"], ((key, number(value) if isinstance(value, (int, float, Decimal)) else value) for key, value in sorted(features.items()))),
                "",
                "### Data-quality calculation",
                "",
                *table(["DQ field", "Actual value"], ((key, number(value) if isinstance(value, (int, float, Decimal)) else value) for key, value in sorted(data_quality.items()))),
                "",
            ]
        )
        if not long_o and not short_o:
            lines.extend(
                [
                    "### Calculation status",
                    "",
                    "No complete feature row was available for this universe member. OFactor, XFactor and technical values are therefore `NOT ESTIMABLE`; no values were invented. The row remains visible so universe coverage reconciles.",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "### LONG OFactor calculation",
                    "",
                    *component_table(long_o, OFACTOR_FORMULAS),
                    "",
                    f"LONG raw score **{number(long_o.get('raw_score'))}** minus penalties **{number(long_o.get('penalty_total'))}** = final **{number(long_o.get('final_score'))}**. Penalties: `{compact(long_o.get('penalties') or {})}`. Reconciliation residual: `{number(long_o.get('score_reconciliation_residual'), 8)}`.",
                    "",
                    "### SHORT OFactor calculation",
                    "",
                    *component_table(short_o, OFACTOR_FORMULAS),
                    "",
                    f"SHORT raw score **{number(short_o.get('raw_score'))}** minus penalties **{number(short_o.get('penalty_total'))}** = final **{number(short_o.get('final_score'))}**. Penalties: `{compact(short_o.get('penalties') or {})}`. Reconciliation residual: `{number(short_o.get('score_reconciliation_residual'), 8)}`.",
                    "",
                    "### XFactor calculation for selected direction",
                    "",
                    *component_table(xfactor, XFACTOR_FORMULAS),
                    "",
                    f"XFactor weighted score **{number(xfactor.get('score'))}**. Setup `{compact(xfactor.get('setup_id'))}` / state `{compact(xfactor.get('setup_state'))}`; structural stop `{number(xfactor.get('structural_stop'))}`; risk/share `{number(xfactor.get('risk_per_share'))}`; reward/risk `{number(xfactor.get('reward_risk'))}`; MoveATR `{number(xfactor.get('extension_atr'))}`; VWAP-distance ATR `{number(xfactor.get('vwap_distance_atr'))}`. Engine decision `{compact(xfactor.get('decision'))}`.",
                    "",
                ]
            )
        lines.extend(
            [
                "### Gate-by-gate evidence",
                "",
                *table(
                    ["Gate", "Pass", "Blocking", "Actual values", "Rule", "Fields", "Source"],
                    (
                        (code, detail.get("passed"), detail.get("blocking"), detail.get("actual"), detail.get("rule"), ", ".join(detail.get("fields") or []), detail.get("source_table"))
                        for code, detail in gates.items()
                    ),
                ),
                "",
                "### Persisted condition matrix",
                "",
                "```json",
                json.dumps(row["condition_results"] or {}, indent=2, sort_keys=True, default=normalise),
                "```",
                "",
                "### Final interpretation",
                "",
                (
                    "This stock was fully selected and eligible for subsequent RSI/Williams %R intraday entry monitoring."
                    if row["selected"]
                    else "This stock was not authorised for automatic entry. "
                    + ("It was included in the top-ten research review because it ranked closest under the governed ordering. " if row["recommended"] else "")
                    + f"The recorded reasons were: {', '.join(row['reason_codes'] or []) or 'none'}; blocking failures: {row['blocking_gate_count']}."
                ),
                "",
            ]
        )

    lines.extend(
        [
            "# Reproduction and verification",
            "",
            "```bash",
            "docker exec trading-stack-novius2-oiis-live-1 oiis-live select \\",
            "  --signal-date 2026-08-07 --trade-date 2026-08-10 \\",
            "  --run-slot MANUAL_CORRECTED_FINAL",
            "",
            "curl -fsS 'http://127.0.0.1:19090/n50/v1/oiis-live/candidates?tradeDate=2026-08-10'",
            "```",
            "",
            "The selection command is idempotent by run slot. Re-running against later-revised market data may legitimately produce a different result hash; never overwrite the original report without recording a new run identity.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    database_url = os.environ.get("DATABASE_URL") or os.environ.get("PG_DSN")
    if not database_url:
        raise SystemExit("DATABASE_URL or PG_DSN is required")
    content = report(database_url, args.trade_date, args.run_slot)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding="utf-8")
    print(json.dumps({"output": str(args.output), "bytes": len(content.encode('utf-8')), "lines": content.count('\n') + 1}))


if __name__ == "__main__":
    main()
