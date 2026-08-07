from datetime import date, timedelta
from decimal import Decimal

from nifty_stratlab.evaluation.horizon_ranking import rank_h30
from nifty_stratlab.evaluation.long_horizon_opportunity import HorizonDailyBar, evaluate_long_horizon


def bars(count=30, maximum=20, maximum_close="120"):
    result = []
    for i in range(count):
        close = Decimal(maximum_close) if i == maximum else Decimal("100") + Decimal(i) / 10
        result.append(HorizonDailyBar(i, date(2025, 1, 1) + timedelta(days=i), close, close + 1, close - 1, close, Decimal(200+i), Decimal(300+i)))
    return result


def evaluate(source):
    return evaluate_long_horizon(entry_path_id="00000000-0000-0000-0000-000000000001", run_id="00000000-0000-0000-0000-000000000002", strategy_version_id="TEST", symbol="RELIANCE", entry_price=Decimal("100"), entry_date=date(2025, 1, 1), daily_bars=source)


def test_scans_all_30_and_uses_official_close_not_high():
    source = bars()
    source[2] = HorizonDailyBar(2, source[2].trade_date, Decimal("101"), Decimal("999"), Decimal("99"), Decimal("101"), Decimal("202"), Decimal("302"))
    result = evaluate(source)
    assert result["sessions_observed"] == 30
    assert result["max_close_session_index"] == 20
    assert result["max_close_price"] == 120


def test_evaluator_has_no_exit_input_and_continues_beyond_ladders():
    result = evaluate(bars(maximum=27, maximum_close="130"))
    assert result["max_close_session_index"] == 27
    assert result["outcome_label"] == "HYPOTHETICAL_MAX_CLOSE_OPPORTUNITY_NOT_REALISED_PNL"


def test_tie_uses_earliest_and_d5_is_separate():
    source = bars(maximum=18, maximum_close="120")
    source[22] = HorizonDailyBar(22, source[22].trade_date, Decimal("120"), Decimal("121"), Decimal("119"), Decimal("120"), Decimal("222"), Decimal("322"))
    result = evaluate(source)
    assert result["max_close_session_index"] == 18 and result["max_close_tie_count"] == 2
    assert result["swing_d5_max_close_price"] < result["max_close_price"]


def test_partial_and_gap_never_rank():
    partial = evaluate(bars(count=24, maximum=20))
    assert partial["coverage_status"] == "RIGHT_CENSORED" and not partial["rankable_flag"]
    gap = evaluate([bar for bar in bars() if bar.session_index != 9])
    assert gap["coverage_status"] == "DATA_GAP_H30" and 9 in gap["missing_session_indices"]


def test_risk_time_giveback_and_hash_are_deterministic():
    source = bars(maximum=10, maximum_close="120")
    first, second = evaluate(source), evaluate(source)
    assert first["observation_hash"] == second["observation_hash"]
    assert first["mae_before_max_close_pct"] < 0
    assert first["giveback_from_max_to_d29_pct"] < 0
    assert len(first["checkpoints"]) == 30


def test_one_stock_ranking_is_correctly_blocked_not_promoted():
    ranking = rank_h30([evaluate(bars())])
    assert ranking["status"] == "PROVISIONAL_BLOCKED"
    assert ranking["final_score"] is None
    assert "MINIMUM_100_MATURE_ENTRIES_NOT_MET" in ranking["hard_gate_blockers"]
