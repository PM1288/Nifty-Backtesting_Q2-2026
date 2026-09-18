"""Derived price validation; never repairs or overwrites source observations."""
from decimal import Decimal, InvalidOperation
from typing import Any


def valid_ohlc(row: dict[str, Any]) -> bool:
    """Cash/futures paper marks require finite positive, coherent OHLC."""
    try:
        open_, high, low, close = (Decimal(str(row[key])) for key in ("open", "high", "low", "close"))
        if not all(value.is_finite() and value > 0 for value in (open_, high, low, close)):
            return False
        return low <= min(open_, close) <= max(open_, close) <= high
    except (KeyError, TypeError, ValueError, InvalidOperation):
        return False
