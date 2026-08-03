from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from nifty_stratlab.reporting.artifacts import build_artifact_manifest, write_json
from nifty_stratlab.util.hashing import sha256_file, stable_id


@dataclass(frozen=True)
class ResearchPackRequest:
    as_of: datetime
    symbols: tuple[str, ...]
    purpose: str
    data_snapshot_id: str
    strategy_version_ids: tuple[str, ...] = ()
    requested_by: str = "system"
    notes: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def pack_id(self) -> str:
        return stable_id(
            "pack",
            {
                "as_of": self.as_of,
                "symbols": self.symbols,
                "purpose": self.purpose,
                "data_snapshot_id": self.data_snapshot_id,
                "strategies": self.strategy_version_ids,
            },
            length=32,
        )


class ResearchPackBuilder:
    def __init__(self, request: ResearchPackRequest) -> None:
        if request.as_of.tzinfo is None:
            raise ValueError("as_of must be timezone-aware")
        self.request = request
        self.frames: dict[str, pd.DataFrame] = {}
        self.json_payloads: dict[str, Any] = {}
        self.markdown_sections: list[tuple[str, str]] = []
        self.attachments: list[tuple[Path, str]] = []

    def add_frame(self, relative_path: str, frame: pd.DataFrame) -> None:
        if not relative_path.endswith(".csv"):
            raise ValueError("data frame path must end with .csv")
        self.frames[relative_path] = frame.copy()

    def add_json(self, relative_path: str, payload: Any) -> None:
        if not relative_path.endswith(".json"):
            raise ValueError("JSON path must end with .json")
        self.json_payloads[relative_path] = payload

    def add_markdown_section(self, heading: str, content: str) -> None:
        self.markdown_sections.append((heading, content.strip()))

    def add_attachment(self, source: str | Path, relative_path: str) -> None:
        path = Path(source)
        if not path.is_file():
            raise FileNotFoundError(path)
        self.attachments.append((path, relative_path))

    def build(self, output_zip: str | Path) -> dict[str, Any]:
        target = Path(output_zip)
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="research-pack-") as temp_dir:
            root = Path(temp_dir) / self.request.pack_id
            root.mkdir(parents=True)
            request_payload = {
                "pack_id": self.request.pack_id,
                # The request identity must produce byte-identical evidence.
                # Use its frozen as-of time instead of wall-clock build time.
                "created_at": self.request.as_of.isoformat(),
                "as_of": self.request.as_of.isoformat(),
                "symbols": self.request.symbols,
                "purpose": self.request.purpose,
                "data_snapshot_id": self.request.data_snapshot_id,
                "strategy_version_ids": self.request.strategy_version_ids,
                "requested_by": self.request.requested_by,
                "notes": self.request.notes,
                "metadata": self.request.metadata,
            }
            write_json(root / "request.json", request_payload)
            for relative, frame in self.frames.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                frame.to_csv(path, index=False)
            for relative, payload in self.json_payloads.items():
                write_json(root / relative, payload)
            for source, relative in self.attachments:
                destination = root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
            summary = [
                f"# Research Pack {self.request.pack_id}",
                "",
                f"**Purpose:** {self.request.purpose}",
                f"**As of:** {self.request.as_of.isoformat()}",
                f"**Symbols:** {', '.join(self.request.symbols)}",
                f"**Data snapshot:** {self.request.data_snapshot_id}",
                "",
                "This pack is decision-support evidence, not investment advice or order authority.",
            ]
            for heading, content in self.markdown_sections:
                summary.extend(["", f"## {heading}", "", content])
            (root / "SUMMARY.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
            manifest = build_artifact_manifest(root)
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(item for item in root.rglob("*") if item.is_file()):
                    info = zipfile.ZipInfo(
                        f"{root.name}/{path.relative_to(root).as_posix()}",
                        date_time=(1980, 1, 1, 0, 0, 0),
                    )
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    archive.writestr(info, path.read_bytes())
        return {
            "pack_id": self.request.pack_id,
            "zip_path": str(target),
            "zip_sha256": sha256_file(target),
            "file_count": len(manifest["files"]) + 1,
        }


def verify_research_pack(path: str | Path) -> dict[str, Any]:
    source = Path(path)
    with tempfile.TemporaryDirectory(prefix="verify-pack-") as temp_dir:
        with zipfile.ZipFile(source, "r") as archive:
            names = archive.namelist()
            if any(name.startswith("/") or ".." in Path(name).parts for name in names):
                raise ValueError("unsafe archive path")
            archive.extractall(temp_dir)
        roots = [item for item in Path(temp_dir).iterdir() if item.is_dir()]
        if len(roots) != 1:
            raise ValueError("research pack must contain one root folder")
        root = roots[0]
        manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
        for entry in manifest["files"]:
            file_path = root / entry["path"]
            if not file_path.is_file() or sha256_file(file_path) != entry["sha256"]:
                raise ValueError(f"checksum mismatch: {entry['path']}")
        return {"valid": True, "files_verified": len(manifest["files"]), "zip_sha256": sha256_file(source)}
