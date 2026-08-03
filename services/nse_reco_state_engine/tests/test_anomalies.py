from nse_reco_state_aware_engine.core.anomalies import detect_single_stock_anomalies

TH = {
    "anomaly": {
        "single_stock": {
            "residual_10m_abs_pct": {"warn": 0.9, "severe": 1.5},
            "volume_ratio": {"warn": 4.0, "severe": 8.0},
            "vwap_dev_abs_pct": {"warn": 0.9, "severe": 1.4},
            "reversal_speed": {"warn": 3, "severe": 5},
        }
    }
}

def test_detect_single_stock():
    f = {
        "symbol": "ABC",
        "residual_ret_15m_pct": 1.0,
        "vwap_deviation_pct": 1.0,
        "volume_surprise_z": 4.0,
        "volume_ratio": 5.0,
        "vwap_cross_count": 4,
    }
    a = detect_single_stock_anomalies(f, {"anomaly": TH["anomaly"]})
    reasons = {x.reason for x in a}
    assert "residual_move_unusual" in reasons
    assert "volume_burst_unusual" in reasons
    assert "vwap_deviation_unusual" in reasons
    assert "reversal_speed_unusual" in reasons
