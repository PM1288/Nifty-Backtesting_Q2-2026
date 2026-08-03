import math

from nifty_stratlab.options.black_scholes import OptionType, black_scholes_greeks, implied_volatility


def test_put_call_parity_and_iv_recovery():
    args = dict(spot=100.0, strike=100.0, time_years=30/365, risk_free_rate=0.06, volatility=0.2)
    call = black_scholes_greeks(option_type=OptionType.CALL, **args)
    put = black_scholes_greeks(option_type=OptionType.PUT, **args)
    parity = args["spot"] - args["strike"] * math.exp(-args["risk_free_rate"] * args["time_years"])
    assert abs((call.theoretical_price - put.theoretical_price) - parity) < 1e-8
    iv = implied_volatility(
        market_price=call.theoretical_price, spot=100, strike=100, time_years=30/365,
        risk_free_rate=0.06, option_type=OptionType.CALL,
    )
    assert abs(iv - 0.2) < 1e-5
