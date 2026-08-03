from __future__ import annotations

from pathlib import Path

from market_ingest.utils.checksum import sha256_file


def test_sha256_file_payload_and_disk(tmp_path: Path) -> None:
    payload = b"abc123"
    file_path = tmp_path / "sample.txt"
    file_path.write_bytes(payload)
    assert sha256_file(file_path) == sha256_file(file_path, payload=payload)
