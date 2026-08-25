from __future__ import annotations

import pandas as pd

from rolling_monthly.absolute_first_session import (
    RESEARCH_NOTIONAL_PER_TRADE,
    STRATEGY_VERSION,
    evaluate_absolute_first_sessions,
)


def frame(first_open: float = 111.0, fill_low: float = 109.0) -> pd.DataFrame:
    rows = [
        ("2025-12-22", 96, 100, 95, 98),
        ("2025-12-26", 98, 102, 97, 101),
        ("2026-01-02", 100, 102, 88, 90),
        ("2026-01-30", 91, 93, 79, 80),
        ("2026-02-02", 82, 91, 81, 90),
        ("2026-02-20", 96, 102, 94, 100),
        ("2026-02-23", 100, 106, 99, 103),
        ("2026-02-27", 103, 112, 102, 110),
        ("2026-03-02", first_open, 114, 110.5, 113),
        ("2026-03-03", 113, 115, fill_low, 112),
        ("2026-03-31", 117, 121, 115, 120),
    ]
    return pd.DataFrame([
        {"trade_date": date, "symbol": "TEST", "company_name": "Test Ltd", "open": open_,
         "high": high, "low": low, "close": close, "volume": 1000,
         "source": "YAHOO_FINANCE_SPLIT_ADJUSTED_OHLC", "source_priority": 0}
        for date, open_, high, low, close in rows
    ])


def evaluate(data: pd.DataFrame, source_end: str = "2026-04-01"):
    return evaluate_absolute_first_sessions(
        data, {"TEST"}, {"TEST": "Test Sector"}, list(pd.to_datetime(data.trade_date)),
        "2026-03", "2026-03", source_end,
    )


def test_non_significant_gap_blind_buys_first_session_open() -> None:
    result = evaluate(frame(first_open=110.10))
    assert result.runs[0]["strategy_version"] == STRATEGY_VERSION
    assert result.runs[0]["eligible_setup_count"] == 1
    assert len(result.candidates) == 2
    for candidate in result.candidates:
        assert candidate["entry_mode"] == "FIRST_SESSION_OPEN"
        assert candidate["entry_status"] == "ENTERED"
        assert candidate["entry_date"].isoformat() == "2026-03-02"
        assert candidate["entry_price"] == 110.10
        assert candidate["path_end_price"] == 120
        assert round(candidate["profit_per_share"], 6) == 9.9
        assert candidate["max_profit_price"] == 121
        assert candidate["max_drawdown_price"] == 109
        assert candidate["quantity_10000"] == int(RESEARCH_NOTIONAL_PER_TRADE // 110.10)
        assert round(candidate["end_pnl_10000"], 6) == round(candidate["quantity_10000"] * 9.9, 6)


def test_significant_gap_waits_for_first_fill() -> None:
    result = evaluate(frame(first_open=111.20, fill_low=109.0))
    by_threshold = {float(row["gap_threshold_pct"]): row for row in result.candidates}
    for threshold in (0.5, 1.0):
        candidate = by_threshold[threshold]
        assert candidate["entry_mode"] == "WAIT_FOR_GAP_FILL"
        assert candidate["entry_status"] == "ENTERED"
        assert candidate["entry_date"].isoformat() == "2026-03-03"
        assert candidate["entry_price"] == 110
        assert candidate["data_quality"]["gap_fill_day_extremes_excluded"] is True
        assert candidate["max_profit_price"] == 121
        assert candidate["max_drawdown_price"] == 110


def test_gap_threshold_scenarios_can_diverge() -> None:
    # 0.75% gap: significant for 0.50%, but not for 1.00%.
    result = evaluate(frame(first_open=110.825, fill_low=109.0))
    by_threshold = {float(row["gap_threshold_pct"]): row for row in result.candidates}
    assert by_threshold[0.5]["entry_mode"] == "WAIT_FOR_GAP_FILL"
    assert by_threshold[1.0]["entry_mode"] == "FIRST_SESSION_OPEN"


def test_unfilled_significant_gap_is_retained_but_not_counted_as_trade() -> None:
    data = frame(first_open=111.20, fill_low=110.5)
    result = evaluate(data)
    for candidate in result.candidates:
        assert candidate["entry_status"] == "NOT_ENTERED_GAP_UNFILLED"
        assert candidate["entry_date"] is None
        assert candidate["entry_price"] is None
        assert candidate["end_return_pct"] is None
        assert candidate["quantity_10000"] == 0


def test_current_month_is_developing() -> None:
    result = evaluate(frame(first_open=110.10), "2026-03-03")
    assert result.runs[0]["maturity_state"] == "DEVELOPING"
    assert all(row["evaluation_status"] == "DEVELOPING" for row in result.candidates)


def test_rejects_monthly_or_weekly_failure() -> None:
    data = frame(first_open=110.10)
    data.loc[data.trade_date == "2026-02-27", "close"] = 99
    result = evaluate(data)
    assert result.runs[0]["eligible_setup_count"] == 0
    assert result.candidates == []
