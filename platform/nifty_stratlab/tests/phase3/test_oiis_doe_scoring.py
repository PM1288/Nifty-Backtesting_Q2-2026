from dataclasses import replace

import pytest

from nifty_stratlab.oiis.engine import (
    OFACTOR_WEIGHTS,
    XFACTOR_WEIGHTS,
    OIISFeature,
    evaluate_feature,
    normalise_weights,
    weighted_score,
)


@pytest.fixture
def feature() -> OIISFeature:
    return OIISFeature(
        symbol="AAA", trade_date="2026-01-05", open_price=100, high_price=105,
        low_price=99, close_price=104, prev_close=100, volume_ratio_20=1.5,
        delivery_ratio_20=1.2, turnover_percentile=0.8, close_location=0.83,
        return_1d_pct=4, return_5d_pct=5, return_21d_pct=8, return_63d_pct=15,
        nifty_return_21d_pct=3, sector_return_21d_pct=4, rsi_14=65,
        sma20=100, sma50=95, atr14=2, prior_high_20=103, prior_low_20=90,
        stock_trend="UP", stock_zone="BULL", nifty_trend="UP", nifty_zone="BULL",
        bank_nifty_trend="UP", bank_nifty_zone="BULL", vix_regime="NORMAL",
    )


def test_exact_weighted_aggregations_and_penalty_reconciliation(feature: OIISFeature) -> None:
    result = evaluate_feature(feature)
    for layer in (result["ofactor_long"], result["ofactor_short"]):
        assert layer["raw_score"] == weighted_score(layer["components"], layer["weights"])
        assert layer["final_score"] == pytest.approx(max(0, min(100, layer["raw_score"] - layer["penalty_total"])))
        assert layer["score_reconciliation_residual"] == 0
    xfactor = result["xfactor"]
    assert xfactor["raw_score"] == weighted_score(xfactor["components"], xfactor["weights"])
    assert xfactor["final_score"] == xfactor["score"]
    assert xfactor["score_reconciliation_residual"] == 0


def test_long_and_short_are_computed_independently(feature: OIISFeature) -> None:
    result = evaluate_feature(feature)
    assert result["ofactor_short"]["final_score"] != 100 - result["ofactor_long"]["final_score"]
    reversed_result = evaluate_feature(replace(feature, return_21d_pct=-8, return_63d_pct=-15))
    assert reversed_result["ofactor_short"]["final_score"] != result["ofactor_short"]["final_score"]


def test_ablation_renormalises_only_declared_layer() -> None:
    weights = dict(OFACTOR_WEIGHTS)
    weights["market_regime_support"] = 0
    remaining = sum(weights.values())
    ablated = {key: (0 if key == "market_regime_support" else value * 100 / remaining) for key, value in weights.items()}
    assert sum(ablated.values()) == pytest.approx(100)
    assert ablated["market_regime_support"] == 0
    assert normalise_weights(XFACTOR_WEIGHTS) == XFACTOR_WEIGHTS


def test_neutral_score_sensitivity_keeps_original_weight(feature: OIISFeature) -> None:
    result = evaluate_feature(feature, {"neutral_components": ["market_regime_support", "setup_integrity"]})
    assert result["ofactor_long"]["components"]["market_regime_support"] == 50
    assert result["ofactor_long"]["weights"]["market_regime_support"] == OFACTOR_WEIGHTS["market_regime_support"]
    assert result["xfactor"]["components"]["setup_integrity"] == 50
    assert result["xfactor"]["weights"]["setup_integrity"] == XFACTOR_WEIGHTS["setup_integrity"]
