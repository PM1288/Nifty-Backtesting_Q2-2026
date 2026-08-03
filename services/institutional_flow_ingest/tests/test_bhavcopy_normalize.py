from __future__ import annotations

from market_ingest.normalize.nse_bhavcopy import normalize_nse_bhavcopy


def test_normalize_nse_bhavcopy_legacy_columns() -> None:
    payload = b"SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,TOTTRDQTY,ISIN\nRELIANCE,EQ,1,2,0.5,1.5,1000,INE002A01018\n"
    frame = normalize_nse_bhavcopy(payload)
    assert frame.loc[0, "symbol"] == "RELIANCE"
    assert frame.loc[0, "close"] == 1.5
