import pandas as pd

from nifty_stratlab.demo.synthetic import synthetic_equity_frame
from nifty_stratlab.features.technical import _wilder_rsi, assert_point_in_time_feature_parity, compute_technical_features


def test_wilder_rsi_uses_simple_average_seed():
    values = pd.Series([100, 101, 100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106])
    result = _wilder_rsi(values, 14)
    assert result.iloc[:14].isna().all()
    assert result.iloc[14] == 65.0


def test_indicators_are_computed_per_symbol_and_have_no_prefix_leakage():
    frame = synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=90, seed=3)
    output = compute_technical_features(frame)
    assert output["rsi_14"].notna().sum() > 0
    assert_point_in_time_feature_parity(frame, [15, 30, 60, 90])


def test_two_symbols_do_not_share_indicator_history():
    frame = synthetic_equity_frame(symbols=("AAA", "BBB"), bars_per_symbol=20, seed=4)
    output = compute_technical_features(frame)
    first_bbb = output[output["symbol"] == "BBB"].iloc[0]
    assert pd.isna(first_bbb["rsi_14"])
