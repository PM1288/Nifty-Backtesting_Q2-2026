from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

import pandas as pd


STRATEGY_VERSION = "absolute_monthly_closure_bullish_long_v1"
RESEARCH_NOTIONAL_PER_TRADE = 100_000.0


def _finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _month_period(value: Any) -> pd.Period:
    return pd.Timestamp(value).to_period("M")


def _complete(observed: set[pd.Timestamp], expected: set[pd.Timestamp]) -> bool:
    return bool(expected) and expected.issubset(observed)


@dataclass(frozen=True)
class AbsoluteMonthResult:
    runs: list[dict[str, Any]]
    candidates: list[dict[str, Any]]


def evaluate_absolute_months(
    frame: pd.DataFrame,
    universe: set[str],
    sectors: dict[str, str],
    expected_sessions: list[Any],
    first_evaluation_month: str,
    last_evaluation_month: str,
    source_end_date: Any,
) -> AbsoluteMonthResult:
    """Evaluate the first seven-condition LONG signal in each calendar month.

    The research entry is the signal-session close because that is the explicit
    requested model. Same-session high/low are excluded from post-entry MFE/MAE
    because their ordering relative to the close is unknowable from daily OHLC.
    """
    required = {"trade_date", "symbol", "open", "high", "low", "close", "volume", "source", "source_priority"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"absolute-month frame missing columns: {sorted(missing)}")
    work = frame.copy()
    work["trade_date"] = pd.to_datetime(work["trade_date"]).dt.normalize()
    work = work[work.symbol.isin(universe)].sort_values(["symbol", "trade_date", "source_priority"])
    work = work.drop_duplicates(["symbol", "trade_date"], keep="first")
    sessions = pd.DatetimeIndex(pd.to_datetime(expected_sessions)).normalize().unique().sort_values()
    sessions_by_month: dict[pd.Period, set[pd.Timestamp]] = {}
    sessions_by_week: dict[pd.Period, set[pd.Timestamp]] = {}
    for session in sessions:
        sessions_by_month.setdefault(session.to_period("M"), set()).add(session)
        sessions_by_week.setdefault(session.to_period("W-SUN"), set()).add(session)
    months = pd.period_range(first_evaluation_month, last_evaluation_month, freq="M")
    source_end = pd.Timestamp(source_end_date).normalize()
    runs: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    grouped = {symbol: rows.reset_index(drop=True) for symbol, rows in work.groupby("symbol")}
    company_names = {
        symbol: next(
            (str(value) for value in rows.get("company_name", pd.Series(dtype=str)).dropna() if str(value) != symbol),
            symbol,
        )
        for symbol, rows in grouped.items()
    }

    for month in months:
        run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{STRATEGY_VERSION}:{month}"))
        expected_month = sessions_by_month.get(month, set())
        recorded_month_end = max(expected_month) if expected_month else month.end_time.normalize()
        projected_business_month_end = pd.offsets.BMonthEnd().rollforward(month.start_time).normalize()
        expected_month_end = max(recorded_month_end, projected_business_month_end) if source_end.to_period("M") == month else recorded_month_end
        is_matured = source_end.to_period("M") > month or source_end >= expected_month_end
        evaluated = 0
        incomplete = 0
        month_candidates: list[dict[str, Any]] = []
        for symbol in sorted(universe):
            rows = grouped.get(symbol)
            if rows is None or rows.empty:
                incomplete += 1
                continue
            # Corporate actions and mixed adjusted/raw providers must never be
            # interpreted as economic P&L. Yahoo split-adjusted OHLC is primary;
            # this conservative boundary check quarantines any unresolved scale
            # discontinuity before the scanner or outcome path can consume it.
            relevant_rows = rows[
                rows.trade_date.dt.to_period("M").isin([month - 2, month - 1, month])
            ]
            close_ratio = relevant_rows.close.astype(float).div(
                relevant_rows.close.astype(float).shift(1)
            )
            if close_ratio.dropna().lt(2 / 3).any() or close_ratio.dropna().gt(1.5).any():
                incomplete += 1
                continue
            observed = set(pd.DatetimeIndex(rows.trade_date))
            first_observed = min(observed)
            m1, m2 = month - 1, month - 2
            needed_months = sessions_by_month.get(m1, set()) | sessions_by_month.get(m2, set())
            relevant_needed = {value for value in needed_months if value >= first_observed}
            if not _complete(observed, relevant_needed):
                incomplete += 1
                continue
            month_rows = rows[rows.trade_date.dt.to_period("M").eq(month)]
            if month_rows.empty:
                incomplete += 1
                continue
            evaluated += 1
            monthly = rows.assign(period=rows.trade_date.dt.to_period("M")).groupby("period", observed=True).agg(
                month_open=("open", "first"), month_close=("close", "last")
            )
            monthly["monthly_ema9"] = monthly.month_close.ewm(span=9, adjust=False, min_periods=9).mean()
            if m1 not in monthly.index or m2 not in monthly.index:
                incomplete += 1
                continue
            m1_open, m1_close = float(monthly.loc[m1, "month_open"]), float(monthly.loc[m1, "month_close"])
            m2_open, m2_close = float(monthly.loc[m2, "month_open"]), float(monthly.loc[m2, "month_close"])
            monthly_ema9 = float(monthly.loc[m1, "monthly_ema9"]) if _finite(monthly.loc[m1, "monthly_ema9"]) else None
            candle_body = m1_close - m1_open
            candle_above_ema9_pct = None if monthly_ema9 is None or candle_body <= 0 else max(
                0.0, min(100.0, 100.0 * (m1_close - max(m1_open, monthly_ema9)) / candle_body)
            )
            selected: dict[str, Any] | None = None
            for row_index, row in month_rows.iterrows():
                day = pd.Timestamp(row.trade_date)
                week = day.to_period("W-SUN")
                previous_week = week - 1
                expected_current_week = {value for value in sessions_by_week.get(week, set()) if value <= day}
                expected_previous_week = sessions_by_week.get(previous_week, set())
                previous_rows = rows[rows.trade_date.lt(day)]
                current_week_rows = rows[rows.trade_date.dt.to_period("W-SUN").eq(week) & rows.trade_date.le(day)]
                previous_week_rows = rows[rows.trade_date.dt.to_period("W-SUN").eq(previous_week)]
                if previous_rows.empty or current_week_rows.empty or previous_week_rows.empty:
                    continue
                if not _complete(observed, expected_current_week) or not _complete(observed, expected_previous_week):
                    continue
                previous_day = previous_rows.iloc[-1]
                w0_open = float(current_week_rows.iloc[0].open)
                w1_open = float(previous_week_rows.iloc[0].open)
                w1_close = float(previous_week_rows.iloc[-1].close)
                values = [m2_open, m2_close, m1_open, m1_close, w0_open, w1_open, w1_close,
                          previous_day.open, previous_day.close, row.open, row.close]
                if not all(_finite(value) for value in values):
                    continue
                checks = [
                    m2_close < m2_open,
                    m1_close > m1_open,
                    m1_close > m2_open,
                    float(row.close) > w0_open,
                    float(row.close) > w1_open,
                    float(row.close) > float(previous_day.open),
                    float(row.close) > float(row.open),
                ]
                if all(checks):
                    selected = {
                        "row": row,
                        "previous_day": previous_day,
                        "w0_open": w0_open,
                        "w1_open": w1_open,
                        "w1_close": w1_close,
                        "checks": checks,
                    }
                    break
            if selected is None:
                continue

            row = selected["row"]
            signal_date = pd.Timestamp(row.trade_date)
            entry_price = float(row.close)
            path = month_rows[month_rows.trade_date.gt(signal_date) & month_rows.trade_date.le(expected_month_end)]
            observed_expected = {value for value in expected_month if signal_date < value <= min(source_end, expected_month_end)}
            path_complete = observed_expected.issubset(observed)
            if path.empty:
                path_end_date = signal_date
                path_end_price = entry_price
                max_profit_price = entry_price
                max_drawdown_price = entry_price
                max_profit_date = None
                max_drawdown_date = None
            else:
                final_row = path.iloc[-1]
                path_end_date = pd.Timestamp(final_row.trade_date)
                path_end_price = float(final_row.close)
                max_profit_row = path.loc[path.high.astype(float).idxmax()]
                max_drawdown_row = path.loc[path.low.astype(float).idxmin()]
                max_profit_price = max(entry_price, float(max_profit_row.high))
                max_drawdown_price = min(entry_price, float(max_drawdown_row.low))
                max_profit_date = pd.Timestamp(max_profit_row.trade_date).date() if max_profit_price > entry_price else None
                max_drawdown_date = pd.Timestamp(max_drawdown_row.trade_date).date() if max_drawdown_price < entry_price else None
            evaluation_status = "MATURED" if is_matured and path_complete else "DEVELOPING" if not is_matured and path_complete else "INCOMPLETE"
            conditions = [
                {"code": "M2_RED", "label": "Two months ago close < open", "left": m2_close, "operator": "<", "right": m2_open, "pass": True},
                {"code": "M1_GREEN", "label": "Previous month close > open", "left": m1_close, "operator": ">", "right": m1_open, "pass": True},
                {"code": "M1_ABOVE_M2_OPEN", "label": "Previous month close > two-month open", "left": m1_close, "operator": ">", "right": m2_open, "pass": True},
                {"code": "W0_GREEN_ASOF", "label": "Week close as-of signal > week open", "left": float(row.close), "operator": ">", "right": selected["w0_open"], "pass": True},
                {"code": "W0_ABOVE_W1_OPEN", "label": "Week close as-of signal > previous-week open", "left": float(row.close), "operator": ">", "right": selected["w1_open"], "pass": True},
                {"code": "D0_ABOVE_D1_OPEN", "label": "Signal close > previous-day open", "left": float(row.close), "operator": ">", "right": float(selected["previous_day"].open), "pass": True},
                {"code": "D0_GREEN", "label": "Signal close > signal-day open", "left": float(row.close), "operator": ">", "right": float(row.open), "pass": True},
                {"code": "M1_CLOSE_ABOVE_EMA9", "label": "Previous-month close > monthly EMA9 (informational)", "left": m1_close, "operator": ">", "right": monthly_ema9, "pass": monthly_ema9 is not None and m1_close > monthly_ema9, "informational": True},
                {"code": "M1_CANDLE_70_ABOVE_EMA9", "label": "At least 70% of previous-month bullish body is above EMA9 (informational)", "left": candle_above_ema9_pct, "operator": ">=", "right": 70.0, "pass": candle_above_ema9_pct is not None and candle_above_ema9_pct >= 70.0, "informational": True},
            ]
            candidate_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{STRATEGY_VERSION}:{month}:{symbol}"))
            month_candidates.append({
                "candidate_id": candidate_id, "run_id": run_id, "strategy_version": STRATEGY_VERSION,
                "evaluation_month": month.start_time.date(), "symbol": symbol, "company_name": company_names.get(symbol, symbol),
                "sector": sectors.get(symbol), "signal_date": signal_date.date(), "entry_date": signal_date.date(),
                "entry_price": entry_price, "evaluation_end_date": path_end_date.date(),
                "evaluation_status": evaluation_status, "observed_post_entry_sessions": len(path),
                "month_two_open": m2_open, "month_two_close": m2_close,
                "month_one_open": m1_open, "month_one_close": m1_close,
                "monthly_ema9": monthly_ema9,
                "monthly_close_above_ema9": monthly_ema9 is not None and m1_close > monthly_ema9,
                "monthly_candle_above_ema9_pct": candle_above_ema9_pct,
                "current_week_open": selected["w0_open"], "current_week_close_asof": float(row.close),
                "previous_week_open": selected["w1_open"], "previous_week_close": selected["w1_close"],
                "previous_day_open": float(selected["previous_day"].open),
                "previous_day_close": float(selected["previous_day"].close),
                "signal_day_open": float(row.open), "signal_day_close": float(row.close),
                "conditions": conditions, "path_end_price": path_end_price,
                "end_return_pct": (path_end_price / entry_price - 1) * 100,
                "max_profit_price": max_profit_price, "max_profit_pct": (max_profit_price / entry_price - 1) * 100,
                "max_profit_date": max_profit_date, "max_drawdown_price": max_drawdown_price,
                "max_drawdown_pct": (max_drawdown_price / entry_price - 1) * 100,
                "max_drawdown_date": max_drawdown_date, "profit_per_share": path_end_price - entry_price,
                "max_profit_per_share": max_profit_price - entry_price,
                "max_drawdown_per_share": max_drawdown_price - entry_price,
                "source_provenance": {"entry": str(row.source), "path_sources": sorted(set(path.source.astype(str))) if not path.empty else [],
                                      "adjustment_policy": "YAHOO_SPLIT_ADJUSTED_OHLC_PRIMARY_WITH_NSE_SMARTAPI_LATEST_FALLBACK"},
                "data_quality": {"status": evaluation_status, "path_complete": path_complete,
                                 "same_day_extremes_excluded": True, "current_fno_membership_applied_retrospectively": True},
            })
        candidates.extend(month_candidates)
        matured = all(candidate["evaluation_status"] == "MATURED" for candidate in month_candidates) and is_matured
        run_state = "MATURED" if matured else "DEVELOPING" if not is_matured else "INCOMPLETE"
        runs.append({
            "run_id": run_id, "evaluation_month": month.start_time.date(), "strategy_version": STRATEGY_VERSION,
            "status": "COMPLETED", "maturity_state": run_state, "universe_size": len(universe),
            "evaluated_symbol_count": evaluated, "qualified_count": len(month_candidates),
            "incomplete_symbol_count": incomplete, "source_start_date": min(work.trade_date).date(),
            "source_end_date": source_end.date(),
            "methodology": {"anchor": "ABSOLUTE_CALENDAR_MONTH", "side": "LONG", "entry": "SIGNAL_SESSION_CLOSE",
                            "exit": "FINAL_EXCHANGE_SESSION_CLOSE_IN_SAME_CALENDAR_MONTH",
                            "signal_selection": "FIRST_QUALIFYING_SESSION_PER_SYMBOL_PER_MONTH",
                            "post_entry_extremes": "NEXT_SESSION_ONWARD", "research_notional_per_trade": RESEARCH_NOTIONAL_PER_TRADE},
            "quality_metrics": {"recognized_fno_symbols": len(universe), "evaluated_symbols": evaluated,
                                "missing_or_incomplete_symbols": incomplete},
        })
    return AbsoluteMonthResult(runs=runs, candidates=candidates)
