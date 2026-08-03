from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum


class OptionType(StrEnum):
    CALL = "CE"
    PUT = "PE"


@dataclass(frozen=True)
class OptionGreeks:
    theoretical_price: float
    delta: float
    gamma: float
    theta_per_day: float
    vega_per_vol_point: float
    rho_per_rate_point: float


def _cdf(value: float) -> float:
    return 0.5 * (1.0 + math.erf(value / math.sqrt(2.0)))


def _pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2.0 * math.pi)


def black_scholes_greeks(
    *,
    spot: float,
    strike: float,
    time_years: float,
    risk_free_rate: float,
    volatility: float,
    option_type: OptionType,
    dividend_yield: float = 0.0,
) -> OptionGreeks:
    if min(spot, strike) <= 0:
        raise ValueError("spot and strike must be positive")
    if time_years <= 0:
        intrinsic = max(spot - strike, 0.0) if option_type == OptionType.CALL else max(strike - spot, 0.0)
        delta = 1.0 if option_type == OptionType.CALL and spot > strike else -1.0 if option_type == OptionType.PUT and spot < strike else 0.0
        return OptionGreeks(intrinsic, delta, 0.0, 0.0, 0.0, 0.0)
    if volatility <= 0:
        raise ValueError("volatility must be positive")

    sqrt_t = math.sqrt(time_years)
    d1 = (math.log(spot / strike) + (risk_free_rate - dividend_yield + 0.5 * volatility**2) * time_years) / (volatility * sqrt_t)
    d2 = d1 - volatility * sqrt_t
    discount_r = math.exp(-risk_free_rate * time_years)
    discount_q = math.exp(-dividend_yield * time_years)

    if option_type == OptionType.CALL:
        price = spot * discount_q * _cdf(d1) - strike * discount_r * _cdf(d2)
        delta = discount_q * _cdf(d1)
        theta = (
            -spot * discount_q * _pdf(d1) * volatility / (2 * sqrt_t)
            - risk_free_rate * strike * discount_r * _cdf(d2)
            + dividend_yield * spot * discount_q * _cdf(d1)
        )
        rho = strike * time_years * discount_r * _cdf(d2)
    else:
        price = strike * discount_r * _cdf(-d2) - spot * discount_q * _cdf(-d1)
        delta = discount_q * (_cdf(d1) - 1)
        theta = (
            -spot * discount_q * _pdf(d1) * volatility / (2 * sqrt_t)
            + risk_free_rate * strike * discount_r * _cdf(-d2)
            - dividend_yield * spot * discount_q * _cdf(-d1)
        )
        rho = -strike * time_years * discount_r * _cdf(-d2)

    gamma = discount_q * _pdf(d1) / (spot * volatility * sqrt_t)
    vega = spot * discount_q * _pdf(d1) * sqrt_t
    return OptionGreeks(
        theoretical_price=price,
        delta=delta,
        gamma=gamma,
        theta_per_day=theta / 365.0,
        vega_per_vol_point=vega / 100.0,
        rho_per_rate_point=rho / 100.0,
    )


def implied_volatility(
    *,
    market_price: float,
    spot: float,
    strike: float,
    time_years: float,
    risk_free_rate: float,
    option_type: OptionType,
    dividend_yield: float = 0.0,
    lower: float = 1e-4,
    upper: float = 5.0,
    tolerance: float = 1e-7,
    max_iterations: int = 200,
) -> float:
    if market_price <= 0:
        raise ValueError("market_price must be positive")
    intrinsic = max(spot - strike, 0.0) if option_type == OptionType.CALL else max(strike - spot, 0.0)
    if market_price + tolerance < intrinsic:
        raise ValueError("market price is below intrinsic value")

    low_price = black_scholes_greeks(
        spot=spot,
        strike=strike,
        time_years=time_years,
        risk_free_rate=risk_free_rate,
        volatility=lower,
        option_type=option_type,
        dividend_yield=dividend_yield,
    ).theoretical_price
    high_price = black_scholes_greeks(
        spot=spot,
        strike=strike,
        time_years=time_years,
        risk_free_rate=risk_free_rate,
        volatility=upper,
        option_type=option_type,
        dividend_yield=dividend_yield,
    ).theoretical_price
    if market_price < low_price - tolerance or market_price > high_price + tolerance:
        raise ValueError("market price is outside the volatility search bounds")

    for _ in range(max_iterations):
        mid = (lower + upper) / 2.0
        price = black_scholes_greeks(
            spot=spot,
            strike=strike,
            time_years=time_years,
            risk_free_rate=risk_free_rate,
            volatility=mid,
            option_type=option_type,
            dividend_yield=dividend_yield,
        ).theoretical_price
        if abs(price - market_price) <= tolerance:
            return mid
        if price < market_price:
            lower = mid
        else:
            upper = mid
    return (lower + upper) / 2.0
