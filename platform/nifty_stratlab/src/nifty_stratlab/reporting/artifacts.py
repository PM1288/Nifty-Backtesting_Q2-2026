from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Iterable

from pydantic import BaseModel

from nifty_stratlab.util.hashing import sha256_file
from nifty_stratlab.util.io import atomic_write_text


def _normalise(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if hasattr(value, "__dataclass_fields__"):
        from dataclasses import asdict

        return asdict(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def write_json(path: str | Path, payload: Any) -> Path:
    target = Path(path)
    atomic_write_text(target, json.dumps(payload, default=_normalise, indent=2, sort_keys=True))
    return target


def write_csv(path: str | Path, rows: Iterable[dict[str, Any]]) -> Path:
    target = Path(path)
    materialised = list(rows)
    target.parent.mkdir(parents=True, exist_ok=True)
    columns = sorted({key for row in materialised for key in row})
    with target.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in materialised:
            writer.writerow({key: _normalise(row.get(key)) if row.get(key) is not None else "" for key in columns})
    return target


def build_artifact_manifest(folder: str | Path) -> dict[str, Any]:
    root = Path(folder)
    entries = []
    for path in sorted(item for item in root.rglob("*") if item.is_file() and item.name != "MANIFEST.json"):
        entries.append(
            {
                "path": path.relative_to(root).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    manifest = {"files": entries}
    write_json(root / "MANIFEST.json", manifest)
    return manifest
