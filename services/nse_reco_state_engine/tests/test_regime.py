from nse_reco_state_aware_engine.core.regime import classify_regime

TH = {
    "regime": {
        "breadth_up_pct": {"broad": 60, "narrow": 50},
        "breadth_above_vwap_pct": {"broad": 60},
        "dispersion_pctile": {"high": 75, "low": 35},
        "realized_vol_pctile": {"high": 75, "low": 35},
        "opening_gap_abs_pct": {"significant": 0.4},
        "first15_range_expansion_pct": {"strong": 18},
    }
}


def test_broad_bullish_expansion():
    r = classify_regime(
        index_ret_from_open_pct=0.8,
        opening_gap_pct=0.2,
        first15_range_expansion_pct=10,
        breadth_up_pct=72,
        breadth_above_vwap_pct=68,
        dispersion_pctile=40,
        realized_vol_pctile=45,
        thresholds=TH,
    )
    assert r.regime == "broad_bullish_expansion"
    assert r.direction == "up"
    assert r.accent_token == "green"


def test_high_vol_chop():
    r = classify_regime(
        index_ret_from_open_pct=0.1,
        opening_gap_pct=0.1,
        first15_range_expansion_pct=25,
        breadth_up_pct=49,
        breadth_above_vwap_pct=49,
        dispersion_pctile=90,
        realized_vol_pctile=85,
        thresholds=TH,
    )
    assert r.regime == "high_volatility_chop"
