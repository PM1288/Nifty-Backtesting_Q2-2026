from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Iterable

from nifty_stratlab.contracts import InstrumentKey, InstrumentKind, OptionRight


@dataclass(frozen=True)
class ContractSelection:
    contract: InstrumentKey
    spot: Decimal
    moneyness_pct: Decimal
    days_to_expiry: int


def select_option_contract(
    instruments: Iterable[InstrumentKey],
    *,
    underlying_symbol: str,
    decision_ts: datetime,
    spot: Decimal,
    right: OptionRight,
    target_moneyness_pct: Decimal = Decimal("0"),
    minimum_days_to_expiry: int = 0,
    maximum_days_to_expiry: int = 45,
) -> ContractSelection:
    """Select only contracts known and active at the decision timestamp."""

    candidates: list[ContractSelection] = []
    target_strike = spot * (Decimal("1") + target_moneyness_pct / Decimal("100"))
    for instrument in instruments:
        if instrument.kind != InstrumentKind.OPTION or instrument.option_right != right:
            continue
        if not instrument.symbol.startswith(underlying_symbol):
            continue
        if instrument.active_from and decision_ts < instrument.active_from:
            continue
        if instrument.active_to and decision_ts > instrument.active_to:
            continue
        if instrument.expiry is None or instrument.strike is None:
            continue
        days = (instrument.expiry - decision_ts.date()).days
        if days < minimum_days_to_expiry or days > maximum_days_to_expiry:
            continue
        moneyness = (instrument.strike / spot - Decimal("1")) * Decimal("100")
        candidates.append(ContractSelection(instrument, spot, moneyness, days))
    if not candidates:
        raise LookupError("no point-in-time eligible option contract")
    candidates.sort(
        key=lambda item: (
            abs(item.contract.strike - target_strike),
            item.days_to_expiry,
            item.contract.expiry,
            item.contract.instrument_id,
        )
    )
    return candidates[0]
