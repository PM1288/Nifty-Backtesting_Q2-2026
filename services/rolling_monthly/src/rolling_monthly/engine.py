from __future__ import annotations

import math
from dataclasses import dataclass
from collections.abc import Iterable
from typing import Any

import numpy as np
import pandas as pd


LONG_BASE = "rolling_candle_bullish_long_v1"
SHORT_BASE = "rolling_candle_bearish_short_v1"
LONG_DERIVED = "rolling_monthly_bullish_long_quality_v2"
SHORT_DERIVED = "rolling_monthly_bearish_short_quality_v2"


def finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def safe_pct(value: Any, reference: Any, direction: float = 1.0) -> float | None:
    if not finite(value) or not finite(reference) or float(reference) == 0:
        return None
    return direction * (float(value) / float(reference) - 1.0) * 100.0


def between(value: Any, low: float, high: float) -> bool:
    return finite(value) and low <= float(value) <= high


def _session_coverage(
    observed_dates: pd.Series,
    expected_sessions: Iterable[Any] | None,
) -> pd.DataFrame:
    """Build point-in-time calendar coverage without inventing missing bars.

    `expected_sessions` must come from a canonical market-wide session source
    (the NIFTY index in the live service).  A symbol is only considered complete
    after its first observed bar; this keeps newly listed instruments distinct
    from an unexplained hole inside an established history.
    """
    observed = pd.DatetimeIndex(pd.to_datetime(observed_dates).dt.normalize().unique()).sort_values()
    expected = pd.DatetimeIndex(
        pd.to_datetime(list(expected_sessions) if expected_sessions is not None else observed)
    ).normalize().unique().sort_values()
    observed_set = set(observed)
    first_observed = observed.min() if len(observed) else None
    expected_by_month: dict[pd.Period, set[pd.Timestamp]] = {}
    expected_by_week: dict[pd.Period, set[pd.Timestamp]] = {}
    for session in expected:
        expected_by_month.setdefault(session.to_period("M"), set()).add(session)
        expected_by_week.setdefault(session.to_period("W-SUN"), set()).add(session)
    previous_expected = {session: expected[index - 1] if index else None for index, session in enumerate(expected)}
    next_expected = {
        session: expected[index + 1] if index + 1 < len(expected) else None
        for index, session in enumerate(expected)
    }

    rows: list[dict[str, Any]] = []
    for raw_date in pd.to_datetime(observed_dates).dt.normalize():
        month = raw_date.to_period("M")
        week = raw_date.to_period("W-SUN")
        m1, m2 = month - 1, month - 2
        w1 = week - 1

        def complete(sessions: set[pd.Timestamp]) -> bool:
            relevant = {value for value in sessions if first_observed is None or value >= first_observed}
            return bool(relevant) and relevant.issubset(observed_set)

        current_week_asof = {value for value in expected_by_week.get(week, set()) if value <= raw_date}
        rows.append({
            "m1_sessions_complete": complete(expected_by_month.get(m1, set())),
            "m2_sessions_complete": complete(expected_by_month.get(m2, set())),
            "w0_sessions_complete": complete(current_week_asof),
            "w1_sessions_complete": complete(expected_by_week.get(w1, set())),
            "previous_session_complete": previous_expected.get(raw_date) in observed_set,
            "next_session_complete": (
                next_expected.get(raw_date) is None or next_expected.get(raw_date) in observed_set
            ),
        })
    return pd.DataFrame(rows, index=observed_dates.index)


def prepare_series(
    frame: pd.DataFrame,
    expected_sessions: Iterable[Any] | None = None,
) -> pd.DataFrame:
    x = frame.sort_values("trade_date").drop_duplicates("trade_date", keep="last").copy()
    for field in ("open", "high", "low", "close", "volume"):
        x[field] = pd.to_numeric(x[field], errors="coerce")
    close, high, low, volume = x.close, x.high, x.low, x.volume.fillna(0)
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = gain / loss.replace(0, np.nan)
    x["rsi14"] = 100 - 100 / (1 + rs)
    x.loc[(loss == 0) & (gain > 0), "rsi14"] = 100

    previous_close = close.shift(1)
    true_range = pd.concat([(high - low), (high - previous_close).abs(), (low - previous_close).abs()], axis=1).max(axis=1)
    atr = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    x["atr14"] = atr
    x["atr14_pct"] = 100 * atr / close.replace(0, np.nan)
    up_move, down_move = high.diff(), -low.diff()
    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0), index=x.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0), index=x.index)
    smooth_tr = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    x["plus_di14"] = 100 * plus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean() / smooth_tr.replace(0, np.nan)
    x["minus_di14"] = 100 * minus_dm.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean() / smooth_tr.replace(0, np.nan)
    dx = 100 * (x.plus_di14 - x.minus_di14).abs() / (x.plus_di14 + x.minus_di14).replace(0, np.nan)
    x["adx14"] = dx.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    x["ema50"] = close.ewm(span=50, adjust=False, min_periods=50).mean()
    x["ema200"] = close.ewm(span=200, adjust=False, min_periods=200).mean()
    x["ema50_lag5"] = x.ema50.shift(5)
    x["ema200_lag5"] = x.ema200.shift(5)
    ema12 = close.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = close.ewm(span=26, adjust=False, min_periods=26).mean()
    x["macd_line"] = ema12 - ema26
    typical = (high + low + close) / 3
    x["vwap20"] = (typical * volume).rolling(20, min_periods=20).sum() / volume.rolling(20, min_periods=20).sum().replace(0, np.nan)

    x["previous_open"] = x.open.shift(1)
    x["next_date"] = x.trade_date.shift(-1)
    x["next_open"] = x.open.shift(-1)
    x["month"] = pd.to_datetime(x.trade_date).dt.to_period("M")
    monthly = x.groupby("month", observed=True).agg(month_open=("open", "first"), month_close=("close", "last"))
    monthly["monthly_ema9"] = monthly.month_close.ewm(span=9, adjust=False, min_periods=9).mean()
    x["m1_open"] = (x.month - 1).map(monthly.month_open)
    x["m1_close"] = (x.month - 1).map(monthly.month_close)
    x["m2_open"] = (x.month - 2).map(monthly.month_open)
    x["m1_ema9"] = (x.month - 1).map(monthly.monthly_ema9)
    bullish_body = (x.m1_close - x.m1_open).where((x.m1_close - x.m1_open) > 0)
    x["m1_candle_above_ema9_pct"] = (
        100 * (x.m1_close - pd.concat([x.m1_open, x.m1_ema9], axis=1).max(axis=1)) / bullish_body
    ).clip(lower=0, upper=100)
    x["week"] = pd.to_datetime(x.trade_date).dt.to_period("W-SUN")
    weekly_open = x.groupby("week", observed=True).open.first()
    x["w0_open"] = x.week.map(weekly_open)
    x["w1_open"] = x.week.map(weekly_open.shift(1))
    coverage = _session_coverage(x.trade_date, expected_sessions)
    for column in coverage.columns:
        x[column] = coverage[column]
    signal_columns = [column for column in coverage.columns if column != "next_session_complete"]
    x["scanner_inputs_complete"] = coverage[signal_columns].all(axis=1)
    x["entry_input_complete"] = coverage["next_session_complete"]
    return x


def scanner_checks(row: pd.Series, side: str) -> list[bool]:
    if "scanner_inputs_complete" in row and not bool(row.scanner_inputs_complete):
        return [False] * 6
    values = [row.m1_close, row.m1_open, row.m2_open, row.close, row.w0_open, row.w1_open, row.previous_open, row.open]
    if not all(finite(value) for value in values):
        return [False] * 6
    if side == "LONG":
        return [bool(value) for value in [
            row.m1_close > row.m1_open,
            row.m1_close > row.m2_open,
            row.close > row.w0_open,
            row.close > row.w1_open,
            row.close > row.previous_open,
            row.close > row.open,
        ]]
    return [bool(value) for value in [
        row.m1_close < row.m1_open,
        row.m1_close < row.m2_open,
        row.close < row.w0_open,
        row.close < row.w1_open,
        row.close < row.previous_open,
        row.close < row.open,
    ]]


def coverage_reasons(row: pd.Series) -> list[str]:
    fields = {
        "m1_sessions_complete": "PREVIOUS_MONTH_INCOMPLETE",
        "m2_sessions_complete": "TWO_MONTH_LOOKBACK_INCOMPLETE",
        "w0_sessions_complete": "CURRENT_WEEK_INCOMPLETE",
        "w1_sessions_complete": "PREVIOUS_WEEK_INCOMPLETE",
        "previous_session_complete": "PREVIOUS_SESSION_MISSING",
        "next_session_complete": "NEXT_SESSION_MISSING",
    }
    return [reason for field, reason in fields.items() if field in row and not bool(row[field])]


@dataclass(frozen=True)
class MarketContext:
    vix_change_pct: float | None
    nifty_plus_di14: float | None
    nifty_minus_di14: float | None
    nifty_advances: int
    nifty_declines: int
    nifty_total: int


def score_candidate(
    row: pd.Series,
    side: str,
    context: MarketContext,
    same_side_count: int,
    universe_size: int,
    config: dict[str, Any],
) -> dict[str, Any]:
    sign = 1.0 if side == "LONG" else -1.0
    week_body = safe_pct(row.close, row.w0_open, sign)
    close_ema200 = safe_pct(row.close, row.ema200, sign)
    ema200_slope = safe_pct(row.ema200, row.ema200_lag5, sign)
    close_vwap = safe_pct(row.close, row.vwap20, sign)
    entry_gap = safe_pct(row.next_open, row.close, sign)
    day_impulse = safe_pct(row.close, row.previous_open, sign)
    ema50_slope = safe_pct(row.ema50, row.ema50_lag5, sign)
    macd_atr = sign * float(row.macd_line) / float(row.atr14) if finite(row.macd_line) and finite(row.atr14) and float(row.atr14) != 0 else None
    di_spread = sign * (float(context.nifty_plus_di14) - float(context.nifty_minus_di14)) if finite(context.nifty_plus_di14) and finite(context.nifty_minus_di14) else None
    breadth = sign * 100.0 * (context.nifty_advances - context.nifty_declines) / context.nifty_total if context.nifty_total else None
    density = 100.0 * same_side_count / universe_size if universe_size else None
    reasons: list[str] = []
    components: list[dict[str, Any]] = []

    def component(code: str, label: str, value: Any, rule: str, passed: bool, mandatory: bool) -> bool:
        components.append({"code": code, "label": label, "value": value, "rule": rule, "pass": passed, "mandatory": mandatory})
        if not passed:
            reasons.append(code)
        return passed

    if side == "LONG":
        c = config["long"]
        g1 = component("L_GATE_01", "India VIX contraction", context.vix_change_pct, f"≤ {c['vix_change_max_pct']}%", finite(context.vix_change_pct) and float(context.vix_change_pct) <= c["vix_change_max_pct"], True)
        g2 = component("L_GATE_02", "NIFTY directional strength", di_spread, f"{c['nifty_di_spread_min']} to {c['nifty_di_spread_max']}", between(di_spread, c["nifty_di_spread_min"], c["nifty_di_spread_max"]), True)
        g3 = component("L_GATE_03", "Weekly follow-through", week_body, f"≥ {c['weekly_body_min_pct']}%", finite(week_body) and float(week_body) >= c["weekly_body_min_pct"], True)
        extension = (finite(close_ema200) and float(close_ema200) <= c["close_vs_ema200_max_pct"]) or (finite(ema200_slope) and float(ema200_slope) <= c["ema200_slope5_max_pct"])
        ext = component("L_EXT_01", "Long-term extension", close_ema200, f"EMA200 distance ≤ {c['close_vs_ema200_max_pct']}% or slope ≤ {c['ema200_slope5_max_pct']}%", extension, False)
        support = c["support"]
        support_flags = [
            component("L_SUP_01", "RSI", row.rsi14, f"{support['rsi_min']} to {support['rsi_max']}", between(row.rsi14, support["rsi_min"], support["rsi_max"]), False),
            component("L_SUP_02", "VWAP20 extension", close_vwap, f"≤ {support['vwap20_extension_max_pct']}%", finite(close_vwap) and float(close_vwap) <= support["vwap20_extension_max_pct"], False),
            component("L_SUP_03", "ATR", row.atr14_pct, f"{support['atr_min_pct']} to {support['atr_max_pct']}%", between(row.atr14_pct, support["atr_min_pct"], support["atr_max_pct"]), False),
            component("L_SUP_04", "Daily impulse", day_impulse, f"{support['daily_impulse_min_pct']} to {support['daily_impulse_max_pct']}%", between(day_impulse, support["daily_impulse_min_pct"], support["daily_impulse_max_pct"]), False),
        ]
        mandatory = g1 and g2 and g3
        band = "HIGH" if mandatory and ext else "MEDIUM" if mandatory else "LOW"
        score = 25 * g1 + 25 * g2 + 20 * g3 + 15 * ext + 3.75 * sum(support_flags)
        confirmations = sum(support_flags)
    else:
        c = config["short"]
        g1 = component("S_GATE_01", "NIFTY bearish breadth", breadth, f"{c['nifty_breadth_min_pct']} to {c['nifty_breadth_max_pct']}%", between(breadth, c["nifty_breadth_min_pct"], c["nifty_breadth_max_pct"]), True)
        g2 = component("S_GATE_02", "Scanner density", density, f"{c['scanner_density_min_pct']} to {c['scanner_density_max_pct']}%", between(density, c["scanner_density_min_pct"], c["scanner_density_max_pct"]), True)
        conf = c["confirmation"]
        flags = [
            component("S_CONF_01", "RSI not oversold", row.rsi14, f"≥ {conf['rsi_min']}", finite(row.rsi14) and float(row.rsi14) >= conf["rsi_min"], False),
            component("S_CONF_02", "Trend maturity", row.adx14, f"≤ {conf['adx_max']}", finite(row.adx14) and float(row.adx14) <= conf["adx_max"], False),
            component("S_CONF_03", "Weekly decline", week_body, f"{conf['weekly_body_min_pct']} to {conf['weekly_body_max_pct']}%", between(week_body, conf["weekly_body_min_pct"], conf["weekly_body_max_pct"]), False),
            component("S_CONF_04", "ATR", row.atr14_pct, f"{conf['atr_min_pct']} to {conf['atr_max_pct']}%", between(row.atr14_pct, conf["atr_min_pct"], conf["atr_max_pct"]), False),
            component("S_CONF_05", "Entry gap", entry_gap, f"{conf['entry_gap_min_pct']} to {conf['entry_gap_max_pct']}%", between(entry_gap, conf["entry_gap_min_pct"], conf["entry_gap_max_pct"]), False),
            component("S_CONF_06", "Daily impulse", day_impulse, f"≥ {conf['daily_impulse_min_pct']}%", finite(day_impulse) and float(day_impulse) >= conf["daily_impulse_min_pct"], False),
            component("S_CONF_07", "MACD/ATR extension", macd_atr, f"≤ {conf['macd_atr_max']}", finite(macd_atr) and float(macd_atr) <= conf["macd_atr_max"], False),
            component("S_CONF_08", "EMA50 slope", ema50_slope, f"≤ {conf['ema50_slope5_max_pct']}%", finite(ema50_slope) and float(ema50_slope) <= conf["ema50_slope5_max_pct"], False),
        ]
        confirmations = sum(flags)
        mandatory = g1 and g2
        band = "HIGH" if mandatory and confirmations >= c["high_min_confirmations"] else "MEDIUM" if mandatory and confirmations >= c["medium_min_confirmations"] else "LOW"
        score = 20 * g1 + 20 * g2 + 7.5 * confirmations

    mandatory_values = [item for item in components if item["mandatory"]]
    missing_mandatory = any(item["value"] is None or not finite(item["value"]) for item in mandatory_values)
    entry_rejection = None
    if missing_mandatory:
        entry_rejection = "MISSING_MANDATORY_INDICATOR"
        band = "INCOMPLETE"
    elif not finite(row.next_open) or float(row.next_open) <= 0:
        entry_rejection = "MISSING_ENTRY"
    elif not finite(entry_gap) or float(entry_gap) < config["entry"]["hard_gap_min_pct"] or float(entry_gap) > config["entry"]["hard_gap_max_pct"]:
        entry_rejection = "EXTREME_GAP"
    entry_eligible = band in {"HIGH", "MEDIUM"} and entry_rejection is None
    action = "WATCH_ONLY"
    if side == "LONG" and band == "HIGH" and entry_eligible:
        action = "SHADOW_ONLY"
    elif side == "SHORT" and band in {"HIGH", "MEDIUM"} and entry_eligible:
        action = "RESEARCH_CANDIDATE"
    elif band == "INCOMPLETE":
        action = "NO_TRADE_INCOMPLETE"
    elif band == "LOW" or not entry_eligible:
        action = "NO_TRADE"

    return {
        "quality_band": band,
        "quality_score": float(score),
        "mandatory_gate_pass": bool(mandatory),
        "confirmation_count": int(confirmations),
        "entry_eligible": bool(entry_eligible),
        "entry_rejection_reason": entry_rejection,
        "deployment_action": action,
        "components": components,
        "reasons": reasons,
        "values": {
            "vix_change_pct": context.vix_change_pct,
            "nifty_di_spread_dir": di_spread,
            "nifty_breadth_dir_pct": breadth,
            "same_side_scanner_density_pct": density,
            "week_body_dir_pct": week_body,
            "close_vs_ema200_dir_pct": close_ema200,
            "ema200_slope5_dir_pct": ema200_slope,
            "close_vs_vwap20_dir_pct": close_vwap,
            "entry_gap_dir_pct": entry_gap,
            "day_vs_prev_open_dir_pct": day_impulse,
            "macd_line_atr_dir": macd_atr,
            "ema50_slope5_dir_pct": ema50_slope,
            "rsi14": float(row.rsi14) if finite(row.rsi14) else None,
            "adx14": float(row.adx14) if finite(row.adx14) else None,
            "atr14_pct": float(row.atr14_pct) if finite(row.atr14_pct) else None,
        },
    }
