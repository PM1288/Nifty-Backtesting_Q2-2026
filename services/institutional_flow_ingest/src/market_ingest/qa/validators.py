from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd


@dataclass(slots=True)
class ValidationIssue:
    severity: str
    message: str


def validate_normalized_frame(frame: pd.DataFrame, market_date: date | None, required_columns: list[str]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for column in required_columns:
        if column not in frame.columns:
            issues.append(ValidationIssue("error", f"missing required column: {column}"))
    if frame.empty and market_date is not None:
        issues.append(ValidationIssue("warning", "normalized row count is zero on a dated dataset"))
    if market_date is not None and "market_date" in frame.columns:
        impossible = frame[pd.to_datetime(frame["market_date"], errors="coerce").dt.date > date.today()]
        if not impossible.empty:
            issues.append(ValidationIssue("error", "impossible future market_date found"))
    if frame.duplicated().any():
        issues.append(ValidationIssue("warning", "duplicate rows detected"))
    return issues
