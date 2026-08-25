from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from market_status.models import build_envelope


ROOT = Path(__file__).resolve().parents[3]
DESTINATION = ROOT / "examples" / "market_status"
AS_OF = datetime(2026, 8, 11, 3, 46, 5, tzinfo=UTC)


def envelope(name, event_type, payload, coverage=1, expected=1):
    return build_envelope(
        event_type=event_type,
        trade_date=AS_OF.date(),
        data_as_of=AS_OF,
        dedupe_key=f"sample:{name}:2026-08-11",
        source_provider="canonical-test-fixture",
        source_mode="DATABASE",
        coverage_count=coverage,
        expected_count=expected,
        max_age_seconds=10,
        payload=payload,
    ).model_dump(by_alias=True, mode="json")


def open_payload(level, change, pct):
    return {
        "index_symbol": "NIFTY50", "index_name": "NIFTY 50", "current_level": level,
        "previous_close": "25000", "point_change": change, "percentage_change": pct,
        "session_open": "25020", "gap_points": "20", "gap_percentage": "0.08",
        "move_from_open_points": str(float(level) - 25020),
        "move_from_open_percentage": str((float(level) - 25020) * 100 / 25020),
        "session_high": "25100", "session_low": "24950", "data_as_of": AS_OF.isoformat(),
        "source": "canonical-test-fixture"
    }


def candidate(symbol, direction, rank):
    return {"rank": rank, "symbol": symbol, "direction": direction, "xfactor": "76.1", "ofactor": "74.8"}


samples = {
    "market-open-positive.json": envelope("open-positive", "market.open.snapshot.v1", open_payload("25100", "100", "0.4")),
    "market-open-negative.json": envelope("open-negative", "market.open.snapshot.v1", open_payload("24900", "-100", "-0.4")),
    "market-open-flat.json": envelope("open-flat", "market.open.snapshot.v1", open_payload("25000", "0", "0")),
    "market-open-without-breadth.json": envelope("open-no-breadth", "market.open.snapshot.v1", open_payload("25050", "50", "0.2")),
    "market-movers.json": envelope("movers", "market.movers.snapshot.v1", {
        "index_symbol": "NIFTY50",
        "gainers": [{"rank": i, "symbol": symbol, "current_price": price, "previous_close": "100", "change_points": change, "change_percentage": change, "quote_time": AS_OF.isoformat()} for i, (symbol, price, change) in enumerate((("AAA", "103", "3"), ("BBB", "102", "2"), ("CCC", "101", "1")), 1)],
        "losers": [{"rank": i, "symbol": symbol, "current_price": price, "previous_close": "100", "change_points": change, "change_percentage": change, "quote_time": AS_OF.isoformat()} for i, (symbol, price, change) in enumerate((("XXX", "97", "-3"), ("YYY", "98", "-2"), ("ZZZ", "99", "-1")), 1)],
        "universe_count": 50, "fresh_quote_count": 50, "data_as_of": AS_OF.isoformat(),
        "ranking_basis": "PREVIOUS_OFFICIAL_CLOSE"
    }, 50, 50),
    "oiis-long-only.json": envelope("oiis-long", "market.oiis.candidates.changed.v1", {
        "source_run_id": "c962bb6d-e558-48f0-a772-4254bed83cea", "source_run_slot": "OPEN_0930",
        "source_run_completed_at": AS_OF.isoformat(), "scoring_rule_version": "OIIS:2.0",
        "trade_date": "2026-08-11", "long_candidates": [candidate("AAA", "LONG", 1)],
        "short_candidates": [], "added_memberships": ["LONG:AAA"], "removed_memberships": [],
        "first_qualifying_scan_of_day": True, "data_as_of": AS_OF.isoformat()
    }),
    "oiis-short-only.json": envelope("oiis-short", "market.oiis.candidates.changed.v1", {
        "source_run_id": "b3416397-e5fb-4531-82dd-6fb53f0cd6fa", "source_run_slot": "RUN_1000",
        "source_run_completed_at": AS_OF.isoformat(), "scoring_rule_version": "OIIS:2.0",
        "trade_date": "2026-08-11", "long_candidates": [], "short_candidates": [candidate("BBB", "SHORT", 1)],
        "added_memberships": ["SHORT:BBB"], "removed_memberships": [],
        "first_qualifying_scan_of_day": True, "data_as_of": AS_OF.isoformat()
    }),
    "oiis-both-directions.json": envelope("oiis-both", "market.oiis.candidates.changed.v1", {
        "source_run_id": "05201494-7d1e-4453-8d51-f51344cd8cbc", "source_run_slot": "RUN_1030",
        "source_run_completed_at": AS_OF.isoformat(), "scoring_rule_version": "OIIS:2.0",
        "trade_date": "2026-08-11", "long_candidates": [candidate("AAA", "LONG", 1)],
        "short_candidates": [candidate("BBB", "SHORT", 1)],
        "added_memberships": ["LONG:AAA", "SHORT:BBB"], "removed_memberships": [],
        "first_qualifying_scan_of_day": False, "data_as_of": AS_OF.isoformat()
    }),
    "market-close-final.json": envelope("close", "market.close.snapshot.v1", {
        "index_symbol": "NIFTY50", "final_close": "25100", "previous_close": "25000",
        "daily_delta_points": "100", "daily_delta_percentage": "0.4", "session_open": "25050",
        "open_to_close_points": "50", "open_to_close_percentage": "0.1996007984031936",
        "session_high": "25200", "session_low": "24900", "range_points": "300",
        "range_percentage": "1.2", "finalisation_status": "FINAL", "data_as_of": AS_OF.isoformat()
    })
}


DESTINATION.mkdir(parents=True, exist_ok=True)
for name, payload in samples.items():
    (DESTINATION / name).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"wrote {len(samples)} samples to {DESTINATION}")
