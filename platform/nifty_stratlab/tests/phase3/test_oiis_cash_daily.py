import pytest
from nifty_stratlab.oiis.engine import OFACTOR_WEIGHTS, XFACTOR_WEIGHTS, OIISFeature, evaluate_feature, normalise_weights


def feature(**changes) -> OIISFeature:
    values = dict(
        symbol="RELIANCE", trade_date="2026-01-15", open_price=100.0, high_price=106.0,
        low_price=99.0, close_price=105.0, prev_close=100.0, volume_ratio_20=1.8,
        delivery_ratio_20=1.4, turnover_percentile=0.9, close_location=0.86,
        return_1d_pct=5.0, return_5d_pct=8.0, return_21d_pct=14.0, return_63d_pct=22.0,
        nifty_return_21d_pct=3.0, sector_return_21d_pct=6.0, rsi_14=65.0,
        sma20=98.0, sma50=92.0, atr14=5.0, prior_high_20=104.0, prior_low_20=85.0,
        stock_trend="UPWARD", stock_zone="UPWARD_LOW_NORMAL_VOL", nifty_trend="UPWARD",
        nifty_zone="UPWARD_LOW_NORMAL_VOL", bank_nifty_trend="UPWARD",
        bank_nifty_zone="UPWARD_LOW_NORMAL_VOL", vix_regime="NORMAL",
    )
    values.update(changes)
    return OIISFeature(**values)


def test_canonical_weights_reconcile() -> None:
    assert sum(OFACTOR_WEIGHTS.values()) == 100
    assert sum(XFACTOR_WEIGHTS.values()) == 100


def test_long_and_short_are_calculated_independently() -> None:
    result = evaluate_feature(feature())
    assert result["ofactor_long"]["final_score"] > result["ofactor_short"]["final_score"]
    assert result["ofactor_short"]["final_score"] != 100 - result["ofactor_long"]["final_score"]


def test_strong_breakout_can_be_enterable() -> None:
    result = evaluate_feature(feature(open_price=103.0, low_price=101.0, sma20=102.0))
    assert result["xfactor"]["setup_id"] == "BREAKOUT_ACCEPTANCE"
    assert result["xfactor"]["decision"] in {"ENTERABLE_TIER_A", "ENTERABLE_TIER_B"}


def test_extension_hard_gate_overrides_score() -> None:
    result = evaluate_feature(feature(close_price=115.0, high_price=116.0, sma20=98.0, atr14=5.0, prior_high_20=110.0))
    assert "EXCESSIVE_EXTENSION" in result["xfactor"]["hard_gates"]
    assert result["xfactor"]["decision"] == "DO_NOT_CHASE"


def test_missing_mandatory_indicator_fails_closed() -> None:
    result = evaluate_feature(feature(rsi_14=None))
    assert result["dq"]["permission"] == "DATA_INSUFFICIENT"
    assert result["xfactor"]["decision"] == "DATA_INSUFFICIENT"


def test_component_mixture_weights_are_exposed_and_change_score() -> None:
    baseline = evaluate_feature(feature())
    weights = dict(baseline["ofactor_long"]["weights"])
    weights["momentum_quality"] = 0.0
    scale = 100.0 / sum(weights.values())
    weights = {key: value * scale for key, value in weights.items()}
    treated = evaluate_feature(feature(), {"ofactor_weights": weights})
    assert treated["ofactor_long"]["weights"]["momentum_quality"] == 0.0
    assert set(treated["ofactor_long"]["weighted_contributions"]) == set(weights)
    assert treated["ofactor_long"]["final_score"] != baseline["ofactor_long"]["final_score"]


def test_fraction_weights_normalise_and_invalid_mixture_fails() -> None:
    normalised = normalise_weights({"a": 0.4, "b": 0.6})
    assert normalised == {"a": 40.0, "b": 60.0}
    with pytest.raises(ValueError):
        normalise_weights({"a": 0.4, "b": 0.5})
