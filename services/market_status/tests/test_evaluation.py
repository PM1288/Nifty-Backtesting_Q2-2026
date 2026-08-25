from datetime import UTC, datetime
from decimal import Decimal

import pytest

from market_status.evaluation import (
    EvaluationError,
    close_snapshot,
    index_snapshot,
    membership_delta,
    oiis_candidates,
    rank_movers,
)


def quote(**updates):
    row = {
        "ltp": Decimal("25050"),
        "close": Decimal("25000"),
        "open": Decimal("25025"),
        "high": Decimal("25100"),
        "low": Decimal("24950"),
    }
    row.update(updates)
    return row


@pytest.mark.parametrize(
    ("ltp", "expected_points", "expected_pct"),
    [("25100", "100", "0.4"), ("24900", "-100", "-0.4"), ("25000", "0", "0")],
)
def test_open_positive_negative_flat(ltp, expected_points, expected_pct):
    result = index_snapshot(quote(ltp=Decimal(ltp), open=Decimal("25000")))
    assert result["point_change"] == expected_points
    assert result["percentage_change"] == expected_pct


def test_gap_up_can_decline_from_open():
    result = index_snapshot(quote(ltp=Decimal("25025"), open=Decimal("25100")))
    assert Decimal(result["gap_points"]) > 0
    assert Decimal(result["move_from_open_points"]) < 0


def test_close_uses_previous_close_and_separate_open_to_close():
    result = close_snapshot(quote(ltp=Decimal("25050"), open=Decimal("25100"), high=Decimal("25200"), low=Decimal("24900")))
    assert result["daily_delta_points"] == "50"
    assert result["open_to_close_points"] == "-50"
    assert result["range_points"] == "300"
    assert result["finalisation_status"] == "FINAL"


def mover(symbol, current, previous="100", seconds=0):
    return {
        "symbol": symbol,
        "display_name": symbol,
        "symbol_token": f"T-{symbol}",
        "ltp": Decimal(current),
        "close": Decimal(previous),
        "ts": datetime(2026, 8, 11, 3, 50, seconds, tzinfo=UTC),
    }


def test_movers_rank_by_percentage_not_points_and_tie_by_symbol():
    gainers, losers = rank_movers(
        [mover("BIG", "1010", "1000"), mover("SMALLB", "102", "100"), mover("SMALLA", "102", "100"), mover("LOSS", "95", "100")],
        3,
    )
    assert [row["symbol"] for row in gainers] == ["SMALLA", "SMALLB", "BIG"]
    assert losers[0]["symbol"] == "LOSS"
    assert len(gainers) == len(losers) == 3


def candidate(symbol="ABC", direction="LONG", x="70.0001", o="70.0001", rank=1, **updates):
    row = {
        "symbol": symbol,
        "direction": direction,
        "xfactor_snapshot": Decimal(x) if x is not None else None,
        "ofactor": Decimal(o) if o is not None else None,
        "directional_edge": Decimal("8"),
        "opportunity_rank": rank,
        "reference_price": Decimal("100"),
        "canonical_status": "WATCH",
        "data_permission": "FULL",
        "reason_codes": [],
        "evidence": {},
        "universe_flags": {},
    }
    row.update(updates)
    return row


@pytest.mark.parametrize(
    "row",
    [candidate(x="70", o="80"), candidate(x="80", o="70"), candidate(x=None), candidate(o=None)],
)
def test_oiis_boundary_and_missing_scores_excluded(row):
    longs, shorts, _, _ = oiis_candidates([row], Decimal("70"), Decimal("70"), 3)
    assert not longs and not shorts


def test_oiis_strictly_above_boundary_included():
    longs, shorts, membership, _ = oiis_candidates(
        [candidate()], Decimal("70"), Decimal("70"), 3
    )
    assert [row["symbol"] for row in longs] == ["ABC"]
    assert not shorts
    assert membership == {"long": ["ABC"], "short": []}


def test_oiis_fixture_and_unavailable_rows_excluded():
    rows = [
        candidate("FIXTURE", universe_flags={"fixture": True}),
        candidate("BAD", reason_codes=["DATA_UNAVAILABLE"]),
        candidate("DENIED", data_permission="BLOCKED"),
    ]
    longs, shorts, _, _ = oiis_candidates(rows, Decimal("70"), Decimal("70"), 3)
    assert not longs and not shorts


def test_oiis_top_three_each_direction_and_canonical_rank():
    rows = [candidate(f"L{i}", rank=i) for i in range(1, 6)] + [
        candidate(f"S{i}", direction="SHORT", rank=i) for i in range(1, 6)
    ]
    longs, shorts, _, _ = oiis_candidates(rows, Decimal("70"), Decimal("70"), 3)
    assert [row["symbol"] for row in longs] == ["L1", "L2", "L3"]
    assert [row["symbol"] for row in shorts] == ["S1", "S2", "S3"]


def test_duplicate_and_direction_conflict_rejected():
    with pytest.raises(EvaluationError, match="OIIS_DUPLICATE_SYMBOL"):
        oiis_candidates([candidate(), candidate()], Decimal("70"), Decimal("70"), 3)
    with pytest.raises(EvaluationError, match="OIIS_DIRECTION_CONFLICT"):
        oiis_candidates([candidate(), candidate(direction="SHORT")], Decimal("70"), Decimal("70"), 3)


def test_order_and_score_only_changes_have_same_fingerprint():
    first = [candidate("AAA", rank=1), candidate("BBB", rank=2, x="75")]
    changed = [candidate("BBB", rank=1, x="99"), candidate("AAA", rank=2, o="98")]
    *_, first_fingerprint = oiis_candidates(first, Decimal("70"), Decimal("70"), 3)
    *_, changed_fingerprint = oiis_candidates(changed, Decimal("70"), Decimal("70"), 3)
    assert first_fingerprint == changed_fingerprint


def test_membership_delta_detects_direction_and_a_b_a():
    a = {"long": ["AAA"], "short": []}
    b = {"long": [], "short": ["AAA"]}
    assert membership_delta(a, b) == (["SHORT:AAA"], ["LONG:AAA"])
    assert membership_delta(b, a) == (["LONG:AAA"], ["SHORT:AAA"])
