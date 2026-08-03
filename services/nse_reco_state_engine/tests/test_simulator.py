from __future__ import annotations

from datetime import date

from nse_reco_state_aware_engine.core.simulator import (
    _delivery_charge_breakdown,
    _simulate_path,
    PriceBar,
)


def test_delivery_charge_breakdown_matches_current_rates() -> None:
    charges = _delivery_charge_breakdown(100000.0, side="buy", instrument_type="equity")

    assert charges["brokerage"] == 0.0
    assert charges["stt"] == 100.0
    assert charges["transaction_charges"] == 3.07
    assert charges["sebi_charges"] == 0.1
    assert charges["stamp_duty"] == 15.0
    assert charges["gst"] == 0.57
    assert charges["dp_charges"] == 0.0
    assert charges["total"] == 118.74


def test_simulate_path_closes_target_lot_and_tracks_fd() -> None:
    history = [
        PriceBar(date(2026, 1, 1), "TEST", "Test Corp", "EQ", 100.0, 101.0, 98.0, 100.0),
        PriceBar(date(2026, 1, 2), "TEST", "Test Corp", "EQ", 100.0, 100.0, 98.0, 99.0),
        PriceBar(date(2026, 1, 3), "TEST", "Test Corp", "EQ", 99.0, 101.0, 98.5, 100.5),
    ]

    result = _simulate_path(
        history,
        instrument_type="equity",
        lot_amount=100000.0,
        dip_pct=1.0,
        fd_rate_pct=7.0,
        target_pct=1.25,
        capital_amount=None,
    )

    assert result["trigger_count"] == 1
    assert result["executed_buys"] == 1
    assert result["closed_lots"] == 1
    assert result["open_lots"] == 0
    assert result["net_strategy_value"] > 100000.0
    assert result["fd_value"] >= result["invested_principal"]
