from datetime import date, datetime, timedelta
from decimal import Decimal

from nifty_stratlab.evaluation.full_path_ladder import LadderBar, evaluate_full_path


D0 = date(2026, 1, 5)
T0 = datetime(2026, 1, 5, 9, 16)


def b(day: int, minute: int, high: str, low: str, close: str = "100", open_: str = "100") -> LadderBar:
    return LadderBar(T0 + timedelta(days=day, minutes=minute), D0 + timedelta(days=day),
                     Decimal(open_), Decimal(high), Decimal(low), Decimal(close))


def run(bars):
    return evaluate_full_path(entry_path_id="p1", symbol="AAA", entry_price=Decimal("100"), quantity=2000, bars=bars)


def events(result, key):
    return {row["level_id"]: row for row in result[key]}


def six_days(last_high="100", last_low="100"):
    return [b(i, 0, last_high if i == 5 else "100", last_low if i == 5 else "100") for i in range(6)]


def test_one_d0_bar_reaches_all_intraday_targets() -> None:
    result = run([b(0, 0, "100.8", "100")] + six_days()[1:])
    reward = events(result, "reward_events")
    assert all(reward[level]["hit_flag"] for level in ("I030", "I050", "I070"))


def test_intraday_targets_can_hit_on_different_bars() -> None:
    result = run([b(0, 0, "100.35", "100"), b(0, 1, "100.55", "100"), b(0, 2, "100.75", "100")] + six_days()[1:])
    reward = events(result, "reward_events")
    assert len({reward[level]["first_touch_ts"] for level in ("I030", "I050", "I070")}) == 3


def test_reward_then_later_adverse_both_persist() -> None:
    result = run([b(0, 0, "100.4", "100"), b(1, 0, "100", "98.5")] + six_days()[2:])
    assert events(result, "reward_events")["I030"]["hit_flag"]
    assert events(result, "adverse_events")["A100"]["hit_flag"]


def test_same_bar_reward_and_adverse_is_ambiguous() -> None:
    result = run([b(0, 0, "100.8", "98.8")] + six_days()[1:])
    assert events(result, "reward_events")["I070"]["same_bar_order_ambiguous"]
    assert events(result, "adverse_events")["A100"]["sequence"] == "SAME_BAR_ORDER_UNKNOWN"


def test_swing_levels_record_d1_d3_d5() -> None:
    rows = six_days()
    rows[1] = b(1, 0, "101.1", "100")
    rows[3] = b(3, 0, "102.1", "100")
    rows[5] = b(5, 0, "105.1", "100")
    reward = events(run(rows), "reward_events")
    assert (reward["S100"]["first_touch_stage"], reward["S200"]["first_touch_stage"], reward["S500"]["first_touch_stage"]) == ("D+1", "D+3", "D+5")


def test_d6_target_does_not_rewrite_d5() -> None:
    result = run(six_days() + [b(6, 0, "106", "100")])
    assert not events(result, "reward_events")["S500"]["hit_flag"]
    assert result["extended_capital_lock"]["bars_evaluated"] == 1


def test_one_bar_crosses_multiple_adverse_levels() -> None:
    adverse = events(run([b(0, 0, "100", "97.5")] + six_days()[1:]), "adverse_events")
    assert all(adverse[level]["hit_flag"] for level in ("A050", "A100", "A200"))


def test_below_minus_ten_sets_all_adverse_levels() -> None:
    adverse = events(run([b(0, 0, "100", "89.5")] + six_days()[1:]), "adverse_events")
    assert all(event["hit_flag"] for event in adverse.values())


def test_no_target_keeps_six_unhit_reward_rows_and_checkpoints() -> None:
    result = run(six_days())
    assert len(result["reward_events"]) == 6
    assert not any(row["hit_flag"] for row in result["reward_events"])
    assert len(result["checkpoints"]) == 6


def test_tick_rounds_up() -> None:
    reward = events(run(six_days()), "reward_events")
    assert reward["I030"]["tick_price"] == 100.3


def test_partial_d5_is_warning() -> None:
    result = run([b(0, 0, "100", "100"), b(1, 0, "100", "100")])
    assert result["coverage_status"] == "WARN_PARTIAL_D5"
    assert result["sessions_evaluated"] == 2


def test_all_cumulative_invariants_pass() -> None:
    result = run([b(0, 0, "101", "89")] + six_days()[1:])
    assert all(result["invariant_checks"].values())
