from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel, ConfigDict

from nifty_stratlab.util.hashing import sha256_file, stable_id
from nifty_stratlab.util.io import atomic_write_json


class SourceFileRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    source_file_id: str
    dataset_name: str
    relative_path: str
    absolute_path: str
    bytes: int
    modified_at_utc: datetime
    mime_type: str | None
    sha256: str


def build_source_record(path: str | Path, *, dataset_name: str, root: str | Path | None = None) -> SourceFileRecord:
    file_path = Path(path).expanduser().resolve()
    if not file_path.is_file():
        raise FileNotFoundError(file_path)
    root_path = Path(root).expanduser().resolve() if root else file_path.parent
    stat = file_path.stat()
    relative_path = str(file_path.relative_to(root_path)) if file_path.is_relative_to(root_path) else file_path.name
    digest = sha256_file(file_path)
    return SourceFileRecord(
        source_file_id=stable_id("src", {"dataset": dataset_name, "path": relative_path, "sha256": digest}),
        dataset_name=dataset_name,
        relative_path=relative_path,
        absolute_path=str(file_path),
        bytes=stat.st_size,
        modified_at_utc=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        mime_type=mimetypes.guess_type(file_path.name)[0],
        sha256=digest,
    )


def inventory_tree(root: str | Path, *, dataset_name: str, patterns: Iterable[str] = ("*.csv",)) -> list[SourceFileRecord]:
    root_path = Path(root).expanduser().resolve()
    if not root_path.is_dir():
        raise NotADirectoryError(root_path)
    files: set[Path] = set()
    for pattern in patterns:
        files.update(path for path in root_path.rglob(pattern) if path.is_file())
    return [build_source_record(path, dataset_name=dataset_name, root=root_path) for path in sorted(files)]


def write_manifest(path: str | Path, records: list[SourceFileRecord]) -> Path:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "file_count": len(records),
        "total_bytes": sum(record.bytes for record in records),
        "files": [record.model_dump(mode="json") for record in records],
    }
    return atomic_write_json(path, payload)
