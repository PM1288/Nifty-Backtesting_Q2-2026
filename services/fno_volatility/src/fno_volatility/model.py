from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime
from statistics import NormalDist
from typing import Iterable

import numpy as np
import pandas as pd


NORMAL = NormalDist()


def percentile_of_history(values: pd.Series) -> float | None:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if clean.empty:
        return None
    latest = float(clean.iloc[-1])
    history = clean.iloc[:-1]
    if history.empty:
        return 0.5
    return float((history <= latest).mean())


def wilder_atr(frame: pd.DataFrame, period: int = 14) -> pd.Series:
    previous = frame["close"].shift(1)
    true_range = pd.concat(
        [frame["high"] - frame["low"], (frame["high"] - previous).abs(), (frame["low"] - previous).abs()],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def adx(frame: pd.DataFrame, period: int = 14) -> pd.Series:
    up = frame["high"].diff()
    down = -frame["low"].diff()
    plus_dm = up.where((up > down) & (up > 0), 0.0)
    minus_dm = down.where((down > up) & (down > 0), 0.0)
    atr = wilder_atr(frame, period).replace(0, np.nan)
    plus_di = 100 * plus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean() / atr
    minus_di = 100 * minus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean() / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def daily_features(frame: pd.DataFrame) -> pd.DataFrame:
    values = frame.sort_values("trade_date").copy()
    values["return"] = values["close"].pct_change()
    values["abs_return"] = values["return"].abs()
    atr = wilder_atr(values)
    values["atr_pct"] = atr / values["close"].replace(0, np.nan)
    middle = values["close"].rolling(20, min_periods=20).mean()
    std = values["close"].rolling(20, min_periods=20).std(ddof=0)
    values["bb_width_pct"] = (4 * std) / middle.replace(0, np.nan)
    values["volume_sma20"] = values["volume"].rolling(20, min_periods=20).mean()
    values["volume_ratio"] = values["volume"] / values["volume_sma20"].replace(0, np.nan)
    values["adx"] = adx(values)
    return values


def direction_entropy(probability_up: float | None) -> float | None:
    if probability_up is None or not math.isfinite(probability_up):
        return None
    probability_up = min(max(probability_up, 1e-12), 1 - 1e-12)
    return float(
        (-(probability_up * math.log(probability_up)) - ((1 - probability_up) * math.log(1 - probability_up)))
        / math.log(2)
    )


def black_scholes(
    spot: float,
    strike: float,
    years: float,
    rate: float,
    volatility: float,
    right: str,
    dividend_yield: float = 0.0,
) -> float:
    if spot <= 0 or strike <= 0:
        raise ValueError("spot and strike must be positive")
    if years <= 0:
        return max(spot - strike, 0.0) if right.upper() == "CE" else max(strike - spot, 0.0)
    if volatility <= 0:
        forward_spot = spot * math.exp(-dividend_yield * years)
        discounted_strike = strike * math.exp(-rate * years)
        return (
            max(forward_spot - discounted_strike, 0.0)
            if right.upper() == "CE"
            else max(discounted_strike - forward_spot, 0.0)
        )
    root_t = math.sqrt(years)
    d1 = (math.log(spot / strike) + (rate - dividend_yield + 0.5 * volatility**2) * years) / (
        volatility * root_t
    )
    d2 = d1 - volatility * root_t
    if right.upper() == "CE":
        return spot * math.exp(-dividend_yield * years) * NORMAL.cdf(d1) - strike * math.exp(
            -rate * years
        ) * NORMAL.cdf(d2)
    if right.upper() == "PE":
        return strike * math.exp(-rate * years) * NORMAL.cdf(-d2) - spot * math.exp(
            -dividend_yield * years
        ) * NORMAL.cdf(-d1)
    raise ValueError("right must be CE or PE")


def implied_volatility(
    price: float,
    spot: float,
    strike: float,
    years: float,
    rate: float,
    right: str,
    dividend_yield: float = 0.0,
) -> float | None:
    if price <= 0 or spot <= 0 or strike <= 0 or years <= 0:
        return None
    intrinsic = max(spot - strike, 0.0) if right.upper() == "CE" else max(strike - spot, 0.0)
    if price < intrinsic:
        return None
    low, high = 0.0001, 5.0
    if black_scholes(spot, strike, years, rate, high, right, dividend_yield) < price:
        return None
    for _ in range(100):
        mid = (low + high) / 2
        estimated = black_scholes(spot, strike, years, rate, mid, right, dividend_yield)
        if estimated > price:
            high = mid
        else:
            low = mid
    return (low + high) / 2


def years_to_expiry(expiry: date, as_of: datetime) -> float:
    expiry_close = datetime(expiry.year, expiry.month, expiry.day, 15, 30, tzinfo=as_of.tzinfo or UTC)
    return max((expiry_close - as_of).total_seconds() / (365.0 * 86400.0), 1 / (365 * 24 * 60))


@dataclass(frozen=True)
class ScenarioResult:
    expected_return: float
    probability_profit: float
    pnl_p10: float
    pnl_p50: float
    pnl_p90: float
    expected_shortfall_95: float
    greek_edge: float


def simulate_structure(
    *,
    spot: float,
    call_strike: float,
    put_strike: float,
    call_ask: float,
    put_ask: float,
    call_iv: float,
    put_iv: float,
    years_entry: float,
    years_exit: float,
    predicted_abs_move_p50: float,
    predicted_iv_change: float,
    rate: float,
    dividend_yield: float,
    costs_fraction: float,
    scenario_count: int,
    seed: int,
) -> ScenarioResult:
    entry = call_ask + put_ask
    if entry <= 0:
        raise ValueError("combined entry premium must be positive")
    sigma = max(predicted_abs_move_p50 / 0.67448975, 0.002)
    rng = np.random.default_rng(seed)
    returns = rng.normal(0.0, sigma, scenario_count)
    iv_noise = rng.normal(0.0, 0.03, scenario_count)
    pnl = np.empty(scenario_count)
    costs = entry * costs_fraction
    for index, movement in enumerate(returns):
        exit_spot = spot * math.exp(float(movement))
        call_exit_iv = max(0.01, call_iv + predicted_iv_change + float(iv_noise[index]))
        put_exit_iv = max(0.01, put_iv + predicted_iv_change + float(iv_noise[index]))
        exit_value = black_scholes(
            exit_spot, call_strike, years_exit, rate, call_exit_iv, "CE", dividend_yield
        )
        exit_value += black_scholes(
            exit_spot, put_strike, years_exit, rate, put_exit_iv, "PE", dividend_yield
        )
        pnl[index] = exit_value - entry - costs
    returns_pct = pnl / entry
    tail = np.sort(returns_pct)[: max(1, int(scenario_count * 0.05))]
    no_iv = (
        black_scholes(
            spot * math.exp(predicted_abs_move_p50),
            call_strike,
            years_exit,
            rate,
            call_iv,
            "CE",
            dividend_yield,
        )
        + black_scholes(
            spot * math.exp(predicted_abs_move_p50),
            put_strike,
            years_exit,
            rate,
            put_iv,
            "PE",
            dividend_yield,
        )
        - entry
        - costs
    ) / entry
    return ScenarioResult(
        expected_return=float(returns_pct.mean()),
        probability_profit=float((returns_pct > 0).mean()),
        pnl_p10=float(np.quantile(returns_pct, 0.10)),
        pnl_p50=float(np.quantile(returns_pct, 0.50)),
        pnl_p90=float(np.quantile(returns_pct, 0.90)),
        expected_shortfall_95=float(tail.mean()),
        greek_edge=float(no_iv),
    )


def choose_decision(
    *,
    structure_type: str,
    forecast_implied_ratio: float | None,
    expected_return: float | None,
    probability_profit: float | None,
    entropy: float | None,
    combined_spread_pct: float | None,
    data_status: str,
    policy: dict,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if data_status != "FULL":
        reasons.append(data_status)
    checks = (
        (forecast_implied_ratio, policy["forecast_implied_ratio_min"], "FORECAST_IMPLIED_EDGE_BELOW_MINIMUM"),
        (expected_return, policy["expected_return_min"], "EXPECTED_RETURN_BELOW_MINIMUM"),
        (probability_profit, policy["probability_profit_min"], "PROBABILITY_PROFIT_BELOW_MINIMUM"),
        (entropy, policy["direction_entropy_min"], "DIRECTION_ENTROPY_BELOW_MINIMUM"),
    )
    for value, threshold, reason in checks:
        if value is None or value < threshold:
            reasons.append(reason)
    if combined_spread_pct is None or combined_spread_pct > policy["combined_spread_pct_max"]:
        reasons.append("COMBINED_SPREAD_ABOVE_MAXIMUM")
    if reasons:
        return "NO_TRADE", reasons
    return ("BUY_STRADDLE" if structure_type == "ATM_STRADDLE" else "BUY_STRANGLE"), []


def deterministic_seed(parts: Iterable[str]) -> int:
    value = 2166136261
    for part in parts:
        for byte in part.encode():
            value = (value ^ byte) * 16777619 & 0xFFFFFFFF
    return value
