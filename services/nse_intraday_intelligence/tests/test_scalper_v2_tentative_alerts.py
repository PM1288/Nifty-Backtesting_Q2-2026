from datetime import datetime, timezone

from nse_intraday_intelligence.scalper_v2_tentative_alerts import render_tentative_whatsapp


def test_tentative_whatsapp_names_snapshot_and_never_claims_execution():
    event = {
        "snapshot_time": datetime(2026, 9, 25, 5, 5, tzinfo=timezone.utc),
        "underlying_symbol": "NIFTY",
        "expiry": "2026-10-01",
        "direction": "CALL",
        "payload": {
            "legs": [
                {"instrument": "UNDERLYING", "symbol": "NIFTY", "close": 25001, "ema9": 25000, "crossTime": "2026-09-25T05:05:00Z"},
                {"instrument": "CE", "symbol": "NIFTY01OCT2625000CE", "close": 115, "ema9": 110, "volumeToEmaRatio": 1.1, "crossTime": "2026-09-25T05:05:00Z"},
                {"instrument": "PE", "symbol": "NIFTY01OCT2625000PE", "close": 75, "ema9": 80, "volumeToEmaRatio": 0.97, "crossTime": "2026-09-25T05:05:00Z"},
            ]
        },
    }
    message = render_tentative_whatsapp(event)
    assert "TENTATIVE CALL ENTRY REFERENCE · NIFTY · 5m" in message
    assert "Snapshot: 25 Sep 2026 · 10:35 IST (completed candle)" in message
    assert "CE NIFTY01OCT2625000CE" in message
    assert "PE NIFTY01OCT2625000PE" in message
    assert "not an order, trade, fill, target or exit" in message
