from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

from nifty_stratlab.util.hashing import sha256_file


@dataclass
class WorkbookProfile:
    path: str
    sha256: str
    bytes: int
    sheets: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "WARN" if self.warnings else "PASS"

    def as_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["status"] = self.status
        return result


def _normalise(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip()


def profile_workbook(path: str | Path) -> WorkbookProfile:
    """Profile a workbook without changing it or treating it as an available feature.

    Date coverage is intentionally reported from date-like cells only; publication
    timing remains an explicit manual `available_at` decision.
    """
    try:
        from openpyxl import load_workbook
    except ImportError as exc:  # pragma: no cover - installation error is actionable
        raise RuntimeError("openpyxl is required; install nifty-stratlab dependencies") from exc

    workbook_path = Path(path).expanduser().resolve()
    result = WorkbookProfile(
        path=str(workbook_path), sha256=sha256_file(workbook_path), bytes=workbook_path.stat().st_size
    )
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    for worksheet in workbook.worksheets:
        headers = [_normalise(cell.value) for row in worksheet.iter_rows(min_row=1, max_row=1) for cell in row if cell.value is not None]
        date_values: list[date] = []
        nonempty = 0
        for row in worksheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    nonempty += 1
                    if isinstance(cell.value, datetime):
                        date_values.append(cell.value.date())
                    elif isinstance(cell.value, date):
                        date_values.append(cell.value)
        result.sheets.append({
            "name": worksheet.title,
            "rows": worksheet.max_row,
            "columns": worksheet.max_column,
            "nonempty_cells": nonempty,
            "headers": headers,
            "first_date": min(date_values).isoformat() if date_values else None,
            "last_date": max(date_values).isoformat() if date_values else None,
        })
    workbook.close()
    if not result.sheets:
        result.warnings.append("workbook contains no worksheets")
    result.warnings.append("available_at rule is unassigned; workbook is excluded from model features")
    return result
