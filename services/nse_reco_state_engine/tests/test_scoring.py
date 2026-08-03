from nse_reco_state_aware_engine.core.scoring import infer_signal, score_action

TH = {
    "signal": {
        "residual_ret_15m_pct": {"strong_up": 0.35, "strong_down": -0.35},
        "residual_ret_30m_pct": {"strong_up": 0.55, "strong_down": -0.55},
        "time_above_vwap_pct": {"strong": 65, "weak": 40},
        "vwap_deviation_abs_pct": {"extreme": 0.80},
        "volume_surprise_z": {"burst": 2.5, "elevated": 1.2},
        "range_efficiency": {"trend": 0.65, "noisy": 0.40},
        "close_location": {"strong": 0.75, "weak": 0.25},
    },
    "weights": {
        "base_score": 50,
        "regime_fit_weight": 1.0,
        "signal_quality_weight": 0.9,
        "historical_edge_weight": 0.8,
        "risk_penalty_weight": 1.0,
        "anomaly_penalty_weight": 1.0,
        "scorecard_min_samples": {"low": 30, "medium": 100},
    },
    "actions": {"buy_now": 72, "wait_for_pullback": 62, "watch_only": 52, "avoid_despite_strength": 45, "force_anomaly_review_on_severe": True},
}

def test_infer_breakout_continuation():
    f = {
        "residual_ret_15m_pct": 0.4,
        "residual_ret_30m_pct": 0.8,
        "residual_ret_5m_pct": 0.1,
        "time_above_vwap_pct": 80,
        "volume_surprise_z": 1.5,
        "range_efficiency": 0.75,
        "close_location": 0.85,
        "vwap_deviation_pct": 0.3,
    }
    s = infer_signal(f, TH, event_count=0)
    assert s.signal_family == "breakout_continuation"
    assert 0 <= s.signal_quality <= 100

def test_score_action_anomaly_override():
    f = {
        "residual_ret_30m_pct": 0.8,
        "residual_ret_15m_pct": 0.4,
        "residual_ret_5m_pct": 0.1,
        "time_above_vwap_pct": 80,
        "volume_surprise_z": 1.5,
        "range_efficiency": 0.75,
        "close_location": 0.85,
        "vwap_deviation_pct": 0.3,
    }
    s = infer_signal(f, TH, event_count=0)
    final, action, accent, arrow = score_action(
        regime="broad_bullish_expansion",
        direction="up",
        signal=s,
        historical_edge_pts=5.0,
        risk_penalty_pts=3.0,
        anomaly_penalty_pts=30.0,
        thresholds=TH,
    )
    assert action == "anomaly_review_required"
