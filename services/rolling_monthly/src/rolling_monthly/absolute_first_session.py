from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

import pandas as pd


STRATEGY_VERSION = "absolute_monthly_first_session_gap_fill_long_v1"
GAP_THRESHOLDS_PCT = (0.50, 1.00)
RESEARCH_NOTIONAL_PER_TRADE = 10_000.0


def _finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _complete(observed: set[pd.Timestamp], expected: set[pd.Timestamp]) -> bool:
    return bool(expected) and expected.issubset(observed)


@dataclass(frozen=True)
class AbsoluteFirstSessionResult:
    runs: list[dict[str, Any]]
    candidates: list[dict[str, Any]]


def evaluate_absolute_first_sessions(
    frame: pd.DataFrame,
    universe: set[str],
    sectors: dict[str, str],
    expected_sessions: list[Any],
    first_evaluation_month: str,
    last_evaluation_month: str,
    source_end_date: Any,
    gap_thresholds_pct: tuple[float, ...] = GAP_THRESHOLDS_PCT,
) -> AbsoluteFirstSessionResult:
    """Evaluate a point-in-time-safe first-session Absolute Monthly variant.

    Eligibility is frozen before the first exchange session opens and therefore
    uses only the two completed monthly candles and the two most recently
    completed weekly candles. A gap below the configured significant-gap
    threshold enters at the first-session open. A significant gap-up waits for
    the first same-month low at or below the previous session close and enters
    at that prior close. An unfilled gap remains visible but is never counted as
    an entered trade.
    """
    required = {"trade_date", "symbol", "open", "high", "low", "close", "volume", "source", "source_priority"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"absolute first-session frame missing columns: {sorted(missing)}")
    thresholds = tuple(sorted({round(float(value), 4) for value in gap_thresholds_pct}))
    if not thresholds or any(value <= 0 for value in thresholds):
        raise ValueError("gap thresholds must contain positive percentages")

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
    grouped = {symbol: rows.reset_index(drop=True) for symbol, rows in work.groupby("symbol")}
    company_names = {
        symbol: next(
            (str(value) for value in rows.get("company_name", pd.Series(dtype=str)).dropna() if str(value) != symbol),
            symbol,
        )
        for symbol, rows in grouped.items()
    }
    runs: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []

    for month in months:
        expected_month = sessions_by_month.get(month, set())
        first_session = min(expected_month) if expected_month else None
        recorded_month_end = max(expected_month) if expected_month else month.end_time.normalize()
        projected_business_month_end = pd.offsets.BMonthEnd().rollforward(month.start_time).normalize()
        expected_month_end = max(recorded_month_end, projected_business_month_end) if source_end.to_period("M") == month else recorded_month_end
        is_matured = source_end.to_period("M") > month or source_end >= expected_month_end
        run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{STRATEGY_VERSION}:{month}"))
        evaluated = 0
        incomplete = 0
        setup_count = 0
        entered_count = 0
        month_candidates: list[dict[str, Any]] = []

        for symbol in sorted(universe):
            rows = grouped.get(symbol)
            if rows is None or rows.empty or first_session is None:
                incomplete += 1
                continue
            observed = set(pd.DatetimeIndex(rows.trade_date))
            first_observed = min(observed)
            m1, m2 = month - 1, month - 2
            needed = sessions_by_month.get(m2, set()) | sessions_by_month.get(m1, set())
            relevant_needed = {value for value in needed if value >= first_observed}
            if not _complete(observed, relevant_needed) or first_session not in observed:
                incomplete += 1
                continue
            relevant_rows = rows[rows.trade_date.dt.to_period("M").isin([m2, m1, month])]
            close_ratio = relevant_rows.close.astype(float).div(relevant_rows.close.astype(float).shift(1)).dropna()
            if close_ratio.lt(2 / 3).any() or close_ratio.gt(1.5).any():
                incomplete += 1
                continue
            monthly = rows.assign(period=rows.trade_date.dt.to_period("M")).groupby("period", observed=True).agg(
                month_open=("open", "first"), month_close=("close", "last")
            )
            monthly["monthly_ema9"] = monthly.month_close.ewm(span=9, adjust=False, min_periods=9).mean()
            if m1 not in monthly.index or m2 not in monthly.index:
                incomplete += 1
                continue
            first_row = rows[rows.trade_date.eq(first_session)].iloc[0]
            previous_rows = rows[rows.trade_date.lt(first_session)]
            if previous_rows.empty:
                incomplete += 1
                continue
            prior_row = previous_rows.iloc[-1]
            prior_week = pd.Timestamp(prior_row.trade_date).to_period("W-SUN")
            week_before = prior_week - 1
            prior_week_rows = rows[rows.trade_date.dt.to_period("W-SUN").eq(prior_week)]
            week_before_rows = rows[rows.trade_date.dt.to_period("W-SUN").eq(week_before)]
            if prior_week_rows.empty or week_before_rows.empty:
                incomplete += 1
                continue
            if not _complete(observed, sessions_by_week.get(prior_week, set())) or not _complete(observed, sessions_by_week.get(week_before, set())):
                incomplete += 1
                continue

            m2_open, m2_close = float(monthly.loc[m2, "month_open"]), float(monthly.loc[m2, "month_close"])
            m1_open, m1_close = float(monthly.loc[m1, "month_open"]), float(monthly.loc[m1, "month_close"])
            monthly_ema9 = float(monthly.loc[m1, "monthly_ema9"]) if _finite(monthly.loc[m1, "monthly_ema9"]) else None
            candle_body = m1_close - m1_open
            candle_above_ema9_pct = None if monthly_ema9 is None or candle_body <= 0 else max(
                0.0, min(100.0, 100.0 * (m1_close - max(m1_open, monthly_ema9)) / candle_body)
            )
            w1_open, w1_close = float(prior_week_rows.iloc[0].open), float(prior_week_rows.iloc[-1].close)
            w2_open, w2_close = float(week_before_rows.iloc[0].open), float(week_before_rows.iloc[-1].close)
            prior_close = float(prior_row.close)
            first_open = float(first_row.open)
            values = [m2_open, m2_close, m1_open, m1_close, w1_open, w1_close, w2_open, w2_close, prior_close, first_open]
            if not all(_finite(value) and float(value) > 0 for value in values):
                incomplete += 1
                continue
            monthly_checks = [m2_close < m2_open, m1_close > m1_open, m1_close > m2_open]
            # The first-session model is evaluated at that session's open. It
            # must not pretend the new calendar week's eventual close is known.
            weekly_checks = [w1_close > w1_open, first_open > w1_open]
            evaluated += 1
            if not all(monthly_checks + weekly_checks):
                continue
            setup_count += 1
            gap_pct = (first_open / prior_close - 1) * 100
            month_rows = rows[rows.trade_date.dt.to_period("M").eq(month) & rows.trade_date.le(expected_month_end)]

            for threshold in thresholds:
                significant_gap_up = gap_pct >= threshold
                entry_mode = "FIRST_SESSION_OPEN"
                entry_status = "ENTERED"
                entry_row = first_row
                entry_date = first_session
                entry_price = first_open
                if significant_gap_up:
                    entry_mode = "WAIT_FOR_GAP_FILL"
                    fill_rows = month_rows[
                        month_rows.trade_date.ge(first_session)
                        & month_rows.low.astype(float).le(prior_close)
                        & month_rows.high.astype(float).ge(prior_close)
                    ]
                    if fill_rows.empty:
                        entry_status = "NOT_ENTERED_GAP_UNFILLED"
                        entry_date = None
                        entry_price = None
                    else:
                        entry_row = fill_rows.iloc[0]
                        entry_date = pd.Timestamp(entry_row.trade_date)
                        entry_price = prior_close

                status = "MATURED" if is_matured else "DEVELOPING"
                path_end_date = min(source_end, expected_month_end)
                path_end_price = None
                max_profit_price = None
                max_drawdown_price = None
                max_profit_date = None
                max_drawdown_date = None
                end_return_pct = None
                max_profit_pct = None
                max_drawdown_pct = None
                profit_per_share = None
                max_profit_per_share = None
                max_drawdown_per_share = None
                observed_sessions = 0
                path_complete = True
                quantity_10000 = 0
                invested_10000 = 0.0
                end_pnl_10000 = None
                max_profit_10000 = None
                max_drawdown_10000 = None

                if entry_status == "ENTERED" and entry_date is not None and entry_price is not None:
                    entered_count += 1
                    path = month_rows[month_rows.trade_date.ge(entry_date) & month_rows.trade_date.le(path_end_date)].copy()
                    expected_path = {value for value in expected_month if entry_date <= value <= path_end_date}
                    path_complete = expected_path.issubset(observed)
                    if path.empty or not path_complete:
                        status = "INCOMPLETE"
                    else:
                        observed_sessions = len(path)
                        final_row = path.iloc[-1]
                        path_end_date = pd.Timestamp(final_row.trade_date)
                        path_end_price = float(final_row.close)
                        extrema_path = path if entry_mode == "FIRST_SESSION_OPEN" else path[path.trade_date.gt(entry_date)]
                        if extrema_path.empty:
                            max_profit_price = max(entry_price, path_end_price)
                            max_drawdown_price = min(entry_price, path_end_price)
                        else:
                            max_profit_row = extrema_path.loc[extrema_path.high.astype(float).idxmax()]
                            max_drawdown_row = extrema_path.loc[extrema_path.low.astype(float).idxmin()]
                            max_profit_price = max(entry_price, float(max_profit_row.high))
                            max_drawdown_price = min(entry_price, float(max_drawdown_row.low))
                            max_profit_date = pd.Timestamp(max_profit_row.trade_date).date() if max_profit_price > entry_price else None
                            max_drawdown_date = pd.Timestamp(max_drawdown_row.trade_date).date() if max_drawdown_price < entry_price else None
                        end_return_pct = (path_end_price / entry_price - 1) * 100
                        max_profit_pct = (max_profit_price / entry_price - 1) * 100
                        max_drawdown_pct = (max_drawdown_price / entry_price - 1) * 100
                        profit_per_share = path_end_price - entry_price
                        max_profit_per_share = max_profit_price - entry_price
                        max_drawdown_per_share = max_drawdown_price - entry_price
                        quantity_10000 = math.floor(RESEARCH_NOTIONAL_PER_TRADE / entry_price)
                        invested_10000 = quantity_10000 * entry_price
                        end_pnl_10000 = quantity_10000 * profit_per_share
                        max_profit_10000 = quantity_10000 * max_profit_per_share
                        max_drawdown_10000 = quantity_10000 * max_drawdown_per_share
                elif not is_matured:
                    status = "DEVELOPING"

                conditions = [
                    {"code": "M2_RED", "label": "M-2 close < open", "left": m2_close, "operator": "<", "right": m2_open, "pass": monthly_checks[0]},
                    {"code": "M1_GREEN", "label": "M-1 close > open", "left": m1_close, "operator": ">", "right": m1_open, "pass": monthly_checks[1]},
                    {"code": "M1_ABOVE_M2_OPEN", "label": "M-1 close > M-2 open", "left": m1_close, "operator": ">", "right": m2_open, "pass": monthly_checks[2]},
                    {"code": "W1_GREEN", "label": "Completed week close > open", "left": w1_close, "operator": ">", "right": w1_open, "pass": weekly_checks[0]},
                    {"code": "ANCHOR_OPEN_ABOVE_W1_OPEN", "label": "First-session open > previous completed-week open", "left": first_open, "operator": ">", "right": w1_open, "pass": weekly_checks[1]},
                    {"code": "M1_CLOSE_ABOVE_EMA9", "label": "Previous-month close > monthly EMA9 (informational)", "left": m1_close, "operator": ">", "right": monthly_ema9, "pass": monthly_ema9 is not None and m1_close > monthly_ema9, "informational": True},
                    {"code": "M1_CANDLE_70_ABOVE_EMA9", "label": "At least 70% of previous-month bullish body is above EMA9 (informational)", "left": candle_above_ema9_pct, "operator": ">=", "right": 70.0, "pass": candle_above_ema9_pct is not None and candle_above_ema9_pct >= 70.0, "informational": True},
                    {"code": "GAP_THRESHOLD", "label": "First-session gap-up is significant", "left": gap_pct, "operator": ">=", "right": threshold, "pass": significant_gap_up},
                    {"code": "GAP_FILLED", "label": "Significant gap filled during month", "left": prior_close if entry_status == "ENTERED" and significant_gap_up else None, "operator": "TOUCHED", "right": prior_close, "pass": entry_status == "ENTERED"},
                ]
                candidate_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{STRATEGY_VERSION}:{month}:{symbol}:{threshold:.2f}"))
                month_candidates.append({
                    "candidate_id": candidate_id, "run_id": run_id, "strategy_version": STRATEGY_VERSION,
                    "evaluation_month": month.start_time.date(), "symbol": symbol,
                    "company_name": company_names.get(symbol, symbol), "sector": sectors.get(symbol),
                    "gap_threshold_pct": threshold, "first_session_date": first_session.date(),
                    "previous_session_date": pd.Timestamp(prior_row.trade_date).date(),
                    "previous_close": prior_close, "first_session_open": first_open, "opening_gap_pct": gap_pct,
                    "entry_mode": entry_mode, "entry_status": entry_status,
                    "entry_date": entry_date.date() if entry_date is not None else None, "entry_price": entry_price,
                    "evaluation_end_date": path_end_date.date(), "evaluation_status": status,
                    "observed_sessions": observed_sessions, "month_two_open": m2_open, "month_two_close": m2_close,
                    "month_one_open": m1_open, "month_one_close": m1_close,
                    "monthly_ema9": monthly_ema9,
                    "monthly_close_above_ema9": monthly_ema9 is not None and m1_close > monthly_ema9,
                    "monthly_candle_above_ema9_pct": candle_above_ema9_pct,
                    "anchor_day_open": first_open,
                    "anchor_vs_previous_week_open_pct": (first_open / w1_open - 1) * 100,
                    "completed_week_open": w1_open, "completed_week_close": w1_close,
                    "prior_week_open": w2_open, "prior_week_close": w2_close, "conditions": conditions,
                    "path_end_price": path_end_price, "end_return_pct": end_return_pct,
                    "max_profit_price": max_profit_price, "max_profit_pct": max_profit_pct,
                    "max_profit_date": max_profit_date, "max_drawdown_price": max_drawdown_price,
                    "max_drawdown_pct": max_drawdown_pct, "max_drawdown_date": max_drawdown_date,
                    "profit_per_share": profit_per_share, "max_profit_per_share": max_profit_per_share,
                    "max_drawdown_per_share": max_drawdown_per_share, "quantity_10000": quantity_10000,
                    "invested_10000": invested_10000, "end_pnl_10000": end_pnl_10000,
                    "max_profit_10000": max_profit_10000, "max_drawdown_10000": max_drawdown_10000,
                    "source_provenance": {"entry": str(entry_row.source) if entry_status == "ENTERED" else None,
                                          "adjustment_policy": "YAHOO_SPLIT_ADJUSTED_OHLC_PRIMARY_WITH_NSE_SMARTAPI_LATEST_FALLBACK"},
                    "data_quality": {"status": status, "path_complete": path_complete,
                                     "entry_day_extremes_included": entry_mode == "FIRST_SESSION_OPEN",
                                     "gap_fill_day_extremes_excluded": entry_mode == "WAIT_FOR_GAP_FILL",
                                     "current_fno_membership_applied_retrospectively": True},
                })

        candidates.extend(month_candidates)
        run_state = "MATURED" if is_matured and all(row["evaluation_status"] == "MATURED" for row in month_candidates) else "DEVELOPING" if not is_matured else "INCOMPLETE"
        runs.append({
            "run_id": run_id, "evaluation_month": month.start_time.date(), "strategy_version": STRATEGY_VERSION,
            "status": "COMPLETED", "maturity_state": run_state, "universe_size": len(universe),
            "evaluated_symbol_count": evaluated, "eligible_setup_count": setup_count,
            "scenario_count": len(month_candidates), "entered_scenario_count": entered_count,
            "incomplete_symbol_count": incomplete, "source_start_date": min(work.trade_date).date(),
            "source_end_date": source_end.date(),
            "methodology": {"anchor": "FIRST_EXCHANGE_SESSION_OF_CALENDAR_MONTH", "side": "LONG",
                            "eligibility_information_cutoff": "BEFORE_FIRST_SESSION_OPEN",
                            "entry": "FIRST_SESSION_OPEN_UNLESS_SIGNIFICANT_GAP_UP_THEN_PRIOR_CLOSE_ON_FIRST_FILL",
                            "gap_thresholds_pct": list(thresholds),
                            "exit": "FINAL_EXCHANGE_SESSION_CLOSE_IN_SAME_CALENDAR_MONTH",
                            "research_notional_per_trade": RESEARCH_NOTIONAL_PER_TRADE},
            "quality_metrics": {"recognized_fno_symbols": len(universe), "evaluated_symbols": evaluated,
                                "missing_or_incomplete_symbols": incomplete},
        })
    return AbsoluteFirstSessionResult(runs=runs, candidates=candidates)
