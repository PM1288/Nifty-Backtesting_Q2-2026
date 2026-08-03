from __future__ import annotations

from datetime import date
from decimal import Decimal

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import FeeSchedule, FeeScheduleRegistry


def demo_fee_registry(*products: ProductType) -> FeeScheduleRegistry:
    """Deterministic test-only schedules; never use for broker reconciliation."""

    requested = products or (
        ProductType.EQUITY_INTRADAY,
        ProductType.EQUITY_DELIVERY,
        ProductType.INDEX_OPTION,
        ProductType.STOCK_OPTION,
    )
    schedules = []
    for product in requested:
        if product == ProductType.EQUITY_INTRADAY:
            values = dict(
                brokerage_rate=Decimal("0.0003"), brokerage_cap_per_order=Decimal("20"),
                stt_buy_rate=Decimal("0"), stt_sell_rate=Decimal("0.00025"),
                stamp_buy_rate=Decimal("0.00003"), dp_sell_flat=Decimal("0"),
            )
        elif product == ProductType.EQUITY_DELIVERY:
            values = dict(
                brokerage_rate=Decimal("0"), brokerage_cap_per_order=Decimal("0"),
                stt_buy_rate=Decimal("0.001"), stt_sell_rate=Decimal("0.001"),
                stamp_buy_rate=Decimal("0.00015"), dp_sell_flat=Decimal("15.34"),
            )
        else:
            # Deliberately synthetic and labelled TEST_ONLY. Production option
            # schedules must be effective-dated and reconciled independently.
            values = dict(
                brokerage_rate=Decimal("0.0003"), brokerage_cap_per_order=Decimal("20"),
                stt_buy_rate=Decimal("0"), stt_sell_rate=Decimal("0.001"),
                stamp_buy_rate=Decimal("0.00003"), dp_sell_flat=Decimal("0"),
            )
        schedules.append(
            FeeSchedule(
                schedule_id=f"TEST_ONLY_{product.value.upper()}_V1",
                exchange="NSE",
                product=product,
                effective_from=date(2000, 1, 1),
                effective_to=None,
                exchange_transaction_rate=Decimal("0.0000307"),
                sebi_rate=Decimal("0.000001"),
                ipft_rate=Decimal("0"),
                gst_rate=Decimal("0.18"),
                notes="TEST ONLY - not a production fee schedule",
                **values,
            )
        )
    return FeeScheduleRegistry(schedules)
