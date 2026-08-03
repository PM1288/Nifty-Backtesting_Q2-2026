from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import FeeSchedule, FeeScheduleRegistry


@pytest.fixture
def intraday_registry() -> FeeScheduleRegistry:
    return FeeScheduleRegistry(
        [
            FeeSchedule(
                schedule_id="TEST_INTRADAY_V1",
                exchange="NSE",
                product=ProductType.EQUITY_INTRADAY,
                effective_from=date(2000, 1, 1),
                effective_to=None,
                brokerage_rate=Decimal("0.0003"),
                brokerage_cap_per_order=Decimal("20"),
                stt_buy_rate=Decimal("0"),
                stt_sell_rate=Decimal("0.00025"),
                exchange_transaction_rate=Decimal("0.0000307"),
                sebi_rate=Decimal("0.000001"),
                ipft_rate=Decimal("0"),
                stamp_buy_rate=Decimal("0.00003"),
                gst_rate=Decimal("0.18"),
            )
        ]
    )
