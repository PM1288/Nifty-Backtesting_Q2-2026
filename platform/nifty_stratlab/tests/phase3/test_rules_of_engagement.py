from nifty_stratlab.evaluation.roe import classify_result_type, classify_trend, evaluate_rankability


def test_trend_transition_is_not_mislabeled_sideways() -> None:
    assert classify_trend(0.2, bullish=1.0, bearish=-1.0, sideways_abs=0.5) == "SIDEWAYS"
    assert classify_trend(0.8, bullish=1.0, bearish=-1.0, sideways_abs=0.5) == "TRANSITION"
    assert classify_trend(1.2, bullish=1.0, bearish=-1.0, sideways_abs=0.5) == "UPWARD"


def test_target_only_strategy_is_opportunity_scan_and_not_rankable() -> None:
    config = {"exit_rules": {"take_profit_pct": 1.25}}
    assert classify_result_type(config, "capital_16l", "nifty_100") == "OPPORTUNITY_SCAN"
    decision = evaluate_rankability(config, {"universe_membership": "Current members only"}, capital_mode="capital_16l", universe_mode="nifty_100", closed_trades=1000)
    assert decision.rankability_status == "NOT_RANKABLE"
    assert decision.rating == "NR"
    assert decision.gates["loss_exit_defined"]["status"] == "FAIL"


def test_controlled_portfolio_is_true_backtest_but_still_fail_closed() -> None:
    config = {"exit_rules": {"take_profit_pct": 2, "stop_loss_pct": 2, "max_hold_days": 10}}
    decision = evaluate_rankability(config, {}, capital_mode="capital_16l", universe_mode="nifty_100", closed_trades=500)
    assert decision.result_type == "TRUE_BACKTEST_PORTFOLIO"
    assert decision.rankability_status == "NOT_RANKABLE"
    assert decision.gates["out_of_sample_evidence"]["status"] == "FAIL"
