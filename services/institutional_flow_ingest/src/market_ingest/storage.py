from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd

from .utils.checksum import sha256_file


@dataclass(slots=True)
class StoredRawFile:
    path: Path
    checksum_sha256: str
    content_length: int
    already_present: bool


class LocalStorage:
    """Filesystem-backed medallion storage."""

    def __init__(self, raw_root: Path, staging_root: Path, curated_root: Path) -> None:
        self.raw_root = raw_root
        self.staging_root = staging_root
        self.curated_root = curated_root
        for root in (raw_root, staging_root, curated_root):
            root.mkdir(parents=True, exist_ok=True)

    def raw_partition_dir(self, dataset_name: str, market_date: date | None) -> Path:
        if market_date is None:
            return self.raw_root / dataset_name / "undated"
        return self.raw_root / dataset_name / f"year={market_date:%Y}" / f"month={market_date:%m}" / f"date={market_date.isoformat()}"

    def store_raw_file(self, dataset_name: str, market_date: date | None, file_name: str, payload: bytes) -> StoredRawFile:
        target_dir = self.raw_partition_dir(dataset_name, market_date)
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / file_name
        payload_checksum = sha256_file(target, payload=payload)
        if target.exists():
            checksum = sha256_file(target)
            if checksum == payload_checksum:
                return StoredRawFile(target, checksum, target.stat().st_size, True)
            target = target_dir / f"{target.stem}__{payload_checksum[:8]}{target.suffix}"
        target.write_bytes(payload)
        checksum = sha256_file(target)
        return StoredRawFile(target, checksum, len(payload), False)

    def write_curated_partition(self, dataset_name: str, frame: pd.DataFrame, market_date: date | None) -> Path:
        dataset_root = self.curated_root / dataset_name
        if market_date is None:
            dataset_root = dataset_root / "undated"
        else:
            dataset_root = dataset_root / f"year={market_date:%Y}" / f"month={market_date:%m}" / f"date={market_date.isoformat()}"
        dataset_root.mkdir(parents=True, exist_ok=True)
        target = dataset_root / "part-0000.parquet"
        frame.to_parquet(target, index=False)
        return target

    def delete_file(self, path: Path) -> None:
        if not path.exists():
            return
        path.unlink()
        self._prune_empty_parent_dirs(path.parent)

    def _prune_empty_parent_dirs(self, path: Path) -> None:
        for root in (self.raw_root, self.staging_root, self.curated_root):
            try:
                path.relative_to(root)
                boundary = root
                break
            except ValueError:
                continue
        else:
            return
        cursor = path
        while cursor != boundary and cursor.exists():
            try:
                cursor.rmdir()
            except OSError:
                break
            cursor = cursor.parent
