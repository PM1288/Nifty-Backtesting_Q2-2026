from __future__ import annotations

from datetime import date
from pathlib import Path

from market_ingest.storage import LocalStorage


def test_storage_skips_identical_raw_payload(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path / "raw", tmp_path / "staging", tmp_path / "curated")
    first = storage.store_raw_file("demo", date(2026, 4, 1), "sample.csv", b"a,b\n1,2\n")
    second = storage.store_raw_file("demo", date(2026, 4, 1), "sample.csv", b"a,b\n1,2\n")
    assert not first.already_present
    assert second.already_present
