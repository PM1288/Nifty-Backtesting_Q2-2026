from oiss_v1.engine import (
    assign_status,
    data_quality,
    extension_bucket,
    horizon_state,
    market_regime_score,
    position_size,
    sector_score,
    tqs,
)

LIMITS = {"fresh_max": 0.5, "acceptable_max": 1, "moderate_max": 1.5, "extended_max": 2}
THRESHOLDS = {
    "ofactor_actionable": 75,
    "xfactor_actionable": 75,
    "tqs_actionable": 78,
    "ofactor_candidate": 65,
    "minimum_rr": 1.5,
}


def test_data_quality_boundaries_and_critical_floor():
    values = {
        "freshness": 100,
        "completeness": 100,
        "consistency": 100,
        "coverage": 100,
        "source_integrity": 100,
    }
    assert data_quality(values, {"price": 90})["grade"] == "A"
    assert data_quality(values, {"price": 89.99})["grade"] == "B"
    assert data_quality(values, {"price": 79.99})["state"] == "INTELLIGENCE_ONLY"
    assert data_quality(values, {"price": 49.99})["state"] == "DATA_INSUFFICIENT"


def test_regime_boundaries():
    assert (
        market_regime_score(
            {"nifty": 85, "bank_nifty": 85, "breadth": 85, "vix": 85, "futures": 85, "gap": 85}
        )["state"]
        == "STRONG BULLISH"
    )
    assert (
        market_regime_score({"nifty": 0, "bank_nifty": 0, "breadth": 0, "vix": 0, "futures": 0, "gap": 0})[
            "state"
        ]
        == "NEUTRAL / MIXED"
    )


def test_extension_and_tqs_boundaries():
    assert extension_bucket(2.0000, LIMITS) == ("EXTENDED", -15)
    assert extension_bucket(2.0001, LIMITS) == ("EXTREME", -30)
    assert tqs(80, 80, 0) == 80
    assert tqs(100, 100, -30) == 70


def test_sector_and_horizon_boundaries():
    assert (
        sector_score({"relative_strength": 70, "breadth": 70, "money_flow": 70, "participation": 70})["state"]
        == "LEADING"
    )
    assert horizon_state("H4", 85, "LONG", "A", False) == "H4 QUALIFIED"
    assert horizon_state("H4", 84.99, "LONG", "A", False) == "H4 WATCH"
    assert horizon_state("BTST", 90, "SHORT", "A", False) == "—"


def test_status_gates_override_profitability_scores():
    actionable = assign_status(
        direction="LONG",
        ofactor=80,
        xfactor=80,
        score=80,
        extension="FRESH",
        dq_grade="A",
        trigger=True,
        rr=2,
        hard_gates=[],
        thresholds=THRESHOLDS,
    )
    assert actionable.status == "BUY NOW"
    assert (
        assign_status(
            direction="LONG",
            ofactor=95,
            xfactor=95,
            score=95,
            extension="EXTREME",
            dq_grade="A",
            trigger=True,
            rr=3,
            hard_gates=[],
            thresholds=THRESHOLDS,
        ).status
        == "NO CHASE"
    )
    assert (
        assign_status(
            direction="SHORT",
            ofactor=90,
            xfactor=90,
            score=90,
            extension="FRESH",
            dq_grade="A",
            trigger=False,
            rr=2,
            hard_gates=[],
            thresholds=THRESHOLDS,
        ).status
        == "WAIT FOR FAILED BOUNCE"
    )


def test_position_sizing_uses_verified_lot_and_both_caps():
    result = position_size(1_000_000, 0.005, 100, 98, 100, 20_000, 100_000, 3)
    assert result["risk_based_lots"] == 25
    assert result["margin_based_lots"] == 5
    assert result["final_lots"] == 3
    assert position_size(100_000, 0.001, 100, 95, 100, 50_000, 100_000, 3)["final_lots"] == 0
