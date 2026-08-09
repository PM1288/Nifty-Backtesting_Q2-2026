from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from papertrade.domain import (
    GroupState,
    TransitionError,
    adverse_return,
    directional_return,
    evaluate_target_ladder,
    favourable_return,
    leg_pnl,
    tax_provision,
    validate_group_transition,
)


def test_required_long_ladder_does_not_close_execution() -> None:
    hits = evaluate_target_ladder(
        "BUY",
        Decimal("100"),
        Decimal("101.20"),
        Decimal("99.40"),
        [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")],
    )
    assert hits == [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")]
    assert favourable_return("BUY", Decimal("100"), Decimal("101.20"), Decimal("99.40")) == Decimal("0.012")
    assert adverse_return("BUY", Decimal("100"), Decimal("101.20"), Decimal("99.40")) == Decimal("-0.006")


def test_short_ladder_and_pnl() -> None:
    assert evaluate_target_ladder(
        "SELL",
        Decimal("100"),
        Decimal("100.70"),
        Decimal("98.80"),
        [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")],
    ) == [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")]
    assert favourable_return("SELL", Decimal("100"), Decimal("100.70"), Decimal("98.80")) == Decimal("0.012")
    assert adverse_return("SELL", Decimal("100"), Decimal("100.70"), Decimal("98.80")) == Decimal("-0.007")
    assert leg_pnl("SELL", Decimal("100"), Decimal("98.80"), Decimal("100")) == Decimal("120.0000")


def test_tax_examples() -> None:
    assert tax_provision(Decimal("900")) == Decimal("315.0000")
    assert Decimal("900") - tax_provision(Decimal("900")) == Decimal("585.0000")
    assert tax_provision(Decimal("-600")) == 0


def test_option_and_group_pnl() -> None:
    long_call = leg_pnl("BUY", Decimal("10"), Decimal("15"), Decimal("250"))
    short_call = leg_pnl("SELL", Decimal("20"), Decimal("12"), Decimal("250"))
    assert long_call == Decimal("1250.0000") and short_call == Decimal("2000.0000")
    assert long_call + short_call - Decimal("100") == Decimal("3150.0000")


def test_closed_group_never_reopens() -> None:
    with pytest.raises(TransitionError):
        validate_group_transition(GroupState.CLOSED, GroupState.OPEN)


@given(
    entry=st.decimals(min_value="0.01", max_value="100000", places=4),
    mark=st.decimals(min_value="0.01", max_value="100000", places=4),
)
def test_long_short_returns_are_opposites(entry: Decimal, mark: Decimal) -> None:
    assert directional_return("BUY", entry, mark) == -directional_return("SELL", entry, mark)


@given(value=st.decimals(min_value="-1000000", max_value="1000000", places=4))
def test_tax_never_negative(value: Decimal) -> None:
    assert tax_provision(value) >= 0
