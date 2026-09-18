from papertrade.market_quality import valid_ohlc


def test_valid_bar_and_flat_bar():
    assert valid_ohlc(dict(open=100, high=102, low=99, close=101))
    assert valid_ohlc(dict(open=100, high=100, low=100, close=100))


def test_invalid_observations_cannot_create_opportunity():
    for value in (0, -1, None, "NaN", "Infinity", "bad"):
        assert not valid_ohlc(dict(open=100, high=102, low=value, close=101))
    assert not valid_ohlc(dict(open=100, high=99, low=98, close=101))
    assert not valid_ohlc(dict(open=100, high=102, low=101, close=101))
    assert not valid_ohlc({})
