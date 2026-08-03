from __future__ import annotations

from market_ingest.normalize.nse_fii_dii import normalize_nse_fii_dii


def test_normalize_nse_fii_dii() -> None:
    payload = b"Client Type,Buy Value,Sell Value,Net Value\nFII/FPI,100,80,20\nDII,70,60,10\n"
    frame = normalize_nse_fii_dii(payload, "nse_only")
    assert list(frame["participant_type"]) == ["FII/FPI", "DII"]
    assert set(frame["exchange_scope"]) == {"nse_only"}
