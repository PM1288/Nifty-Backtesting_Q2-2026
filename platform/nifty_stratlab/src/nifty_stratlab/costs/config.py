from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.costs.engine import ComponentRounding, FeeSchedule, FeeScheduleRegistry


def _decimal(item: dict[str, Any], key: str, default: str = "0") -> Decimal:
    return Decimal(str(item.get(key, default)))


def load_fee_registry(path: str | Path) -> FeeScheduleRegistry:
    with Path(path).open("r", encoding="utf-8") as stream:
        raw = yaml.safe_load(stream) or {}
    schedules = []
    for item in raw.get("fee_schedules", []):
        schedules.append(
            FeeSchedule(
                schedule_id=item["schedule_id"],
                exchange=item.get("exchange", "NSE"),
                product=ProductType(item["product"]),
                effective_from=date.fromisoformat(str(item["effective_from"])),
                effective_to=date.fromisoformat(str(item["effective_to"])) if item.get("effective_to") else None,
                brokerage_rate=_decimal(item, "brokerage_rate"),
                brokerage_cap_per_order=_decimal(item, "brokerage_cap_per_order"),
                stt_buy_rate=_decimal(item, "stt_buy_rate"),
                stt_sell_rate=_decimal(item, "stt_sell_rate"),
                exchange_transaction_rate=_decimal(item, "exchange_transaction_rate"),
                sebi_rate=_decimal(item, "sebi_rate"),
                ipft_rate=_decimal(item, "ipft_rate"),
                stamp_buy_rate=_decimal(item, "stamp_buy_rate"),
                gst_rate=_decimal(item, "gst_rate"),
                dp_sell_flat=_decimal(item, "dp_sell_flat"),
                brokerage_rounding=ComponentRounding(item.get("brokerage_rounding", "paise")),
                stt_rounding=ComponentRounding(item.get("stt_rounding", "rupee_nearest")),
                statutory_rounding=ComponentRounding(item.get("statutory_rounding", "paise")),
                notes=item.get("notes", ""),
            )
        )
    return FeeScheduleRegistry(schedules)
