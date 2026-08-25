from datetime import date, timedelta

import pandas as pd

from rolling_monthly.rolling_window import evaluate_rolling_windows


def test_rolling_window_emits_transition_and_uses_next_session_entry() -> None:
    start = date(2026, 1, 1)
    rows = []
    for index in range(95):
        open_price = 100 + index * 0.1
        close_price = open_price + 0.2
        rows.append({"trade_date": start + timedelta(days=index), "symbol": "TEST", "open": open_price,
                     "high": close_price + 0.4, "low": open_price - 0.3, "close": close_price})
    # At index 59 the older 30-session block must be red while all recent
    # comparisons remain bullish. Only the false-to-true transition is emitted.
    rows[0]["open"] = 105
    rows[29]["close"] = 100
    result = evaluate_rolling_windows(pd.DataFrame(rows), {"TEST"}, rows[-1]["trade_date"], years=3)
    assert result.candidates
    first = result.candidates[0]
    assert first["entry_date"] > first["signal_date"]
    assert first["entry_price"] == rows[60]["open"]
    assert first["conditions"]["older_30_session_candle_red"] is True
    assert 1 <= first["observed_sessions"] <= 30
    assert len(result.evaluations) == 1
    assert result.evaluations[0]["evaluated_condition_count"] == 7
    assert result.evaluations[0]["selection_status"] in {"SELECTED", "QUALIFIED_CONTINUATION", "REJECTED"}


def test_rolling_window_does_not_emit_without_next_session() -> None:
    frame = pd.DataFrame([
        {"trade_date": date(2026, 1, 1) + timedelta(days=index), "symbol": "TEST", "open": 100,
         "high": 101, "low": 99, "close": 100.5}
        for index in range(60)
    ])
    assert evaluate_rolling_windows(frame, {"TEST"}, date(2026, 3, 1)).candidates == []
    evaluation = evaluate_rolling_windows(frame, {"TEST"}, date(2026, 3, 1)).evaluations[0]
    assert evaluation["selection_status"] == "INCOMPLETE"
    assert evaluation["rejection_reasons"]
