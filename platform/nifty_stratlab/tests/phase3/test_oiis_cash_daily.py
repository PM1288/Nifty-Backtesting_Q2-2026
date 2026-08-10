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


def test_strong_breakout_uses_one_setup_but_does_not_manufacture_reward_risk() -> None:
    result = evaluate_feature(feature(open_price=103.0, low_price=101.0, sma20=102.0))
    assert result["xfactor"]["setup_id"] == "BREAKOUT_ACCEPTANCE"
    assert result["xfactor"]["setup_valid"]
    assert result["xfactor"]["reward_risk"] is None
    assert "REWARD_RISK_NOT_CALCULATED" in result["xfactor"]["hard_gates"]


def test_extension_hard_gate_overrides_score() -> None:
    result = evaluate_feature(feature(close_price=115.0, high_price=116.0, sma20=98.0, atr14=5.0, prior_high_20=110.0))
    assert "EXCESSIVE_EXTENSION" in result["xfactor"]["hard_gates"]
    assert result["xfactor"]["decision"] == "DO_NOT_CHASE"


def test_extension_is_session_move_not_sma20_distance() -> None:
    cases = [
        ("TITAN",4930.0,5090.0,98.19285714285719,1.6294),
        ("SHRIRAMFIN",1115.0,1137.8,32.70714285714287,0.6971),
        ("GRASIM",3324.0,3380.5,74.36428571428574,0.7598),
        ("SBIN",1108.0,1071.0,21.771428571428544,1.6995),
    ]
    for symbol,session_open,close,atr,expected in cases:
        result = evaluate_feature(feature(
            symbol=symbol,open_price=session_open,session_open_price=session_open,
            close_price=close,high_price=max(session_open,close)+1,
            low_price=min(session_open,close)-1,atr14=atr,is_intraday_snapshot=True,
            session_volume=1000,session_bar_coverage=1.0,
            session_latest_bar_age_minutes=0,session_data_status="FULL",
        ))
        assert result["xfactor"]["move_atr"] == pytest.approx(expected,abs=0.0001)


def test_sbin_separates_bullish_structure_from_bearish_session() -> None:
    result = evaluate_feature(feature(
        symbol="SBIN",open_price=1108.0,session_open_price=1108.0,
        high_price=1113.1,low_price=1071.0,close_price=1071.0,prev_close=1097.2,
        close_location=0.0,return_1d_pct=-2.388,return_5d_pct=2.0,
        return_21d_pct=8.0,return_63d_pct=15.0,sma20=1038.705,sma50=1027.69,
        atr14=21.7714285714,is_intraday_snapshot=True,session_volume=155177,
        session_bar_coverage=1.0,session_latest_bar_age_minutes=0,
        session_data_status="FULL",session_vwap=1090.0,
    ))
    assert result["structural_direction"] == "LONG"
    assert result["session_direction"] == "SHORT"
    assert result["direction"] == "SHORT"
    assert result["direction_state"] == "COUNTER_TREND_SHORT"


def test_incomplete_or_zero_volume_session_fails_data_quality_closed() -> None:
    result = evaluate_feature(feature(
        is_intraday_snapshot=True,session_volume=0,session_bar_coverage=0.45,
        session_latest_bar_age_minutes=185,session_data_status="DATA_INSUFFICIENT",
    ))
    assert result["dq"]["permission"] == "DATA_INSUFFICIENT"
    assert result["dq"]["score"] <= 49
    assert "SESSION_VOLUME_MISSING_OR_ZERO" in result["dq"]["session_failures"]


def test_triggered_setup_cannot_be_rejected_as_no_valid_setup() -> None:
    result = evaluate_feature(feature(open_price=103.0,low_price=101.0,sma20=102.0))
    assert result["xfactor"]["setup_state"] == "TRIGGERED"
    assert result["xfactor"]["setup_valid"]
    assert "NO_VALID_SETUP" not in result["xfactor"]["hard_gates"]


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
