from datetime import datetime, timezone
from decimal import Decimal

import pytest

from nifty_stratlab.contracts import MarketBar


def test_bar_rejects_impossible_ohlc():
    with pytest.raises(ValueError):
        MarketBar(
            instrument_id="NSE:AAA",
            symbol="AAA",
            event_ts=datetime.now(timezone.utc),
            available_at=datetime.now(timezone.utc),
            interval="1m",
            open=Decimal("100"),
            high=Decimal("99"),
            low=Decimal("98"),
            close=Decimal("99"),
            volume=10,
            source="test",
            source_version="1",
        )
