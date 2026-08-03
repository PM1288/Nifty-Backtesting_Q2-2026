from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from ..calendar import TradingCalendar
from ..config import DatasetSpec
from ..registry import Registry
from ..utils.dates import enumerate_fortnight_dates, enumerate_month_starts, enumerate_year_starts


@dataclass(slots=True)
class CompletenessResult:
    dataset_name: str
    expected_date: date
    is_present: bool
    reason_missing: str | None


def verify_dataset_completeness(
    registry: Registry,
    calendar: TradingCalendar,
    dataset: DatasetSpec,
    start_date: date,
    end_date: date,
) -> list[CompletenessResult]:
    normalized_dates = registry.normalized_dates(dataset.dataset_name, start_date, end_date)
    if dataset.frequency == "daily":
        expected_dates = calendar.iter_expected_dates(start_date, end_date, dataset.frequency)
    elif dataset.backfill_partitioned and dataset.period_kind == "monthly":
        expected_dates = enumerate_month_starts(start_date, end_date)
    elif dataset.backfill_partitioned and dataset.period_kind == "yearly":
        expected_dates = enumerate_year_starts(start_date, end_date)
    elif dataset.backfill_partitioned and dataset.period_kind == "fortnightly":
        expected_dates = enumerate_fortnight_dates(start_date, end_date)
    else:
        expected_dates = []
    results: list[CompletenessResult] = []
    for expected in expected_dates:
        present = expected in normalized_dates
        reason = None if present else "missing_partition"
        registry.write_completeness(
            {
                "dataset_name": dataset.dataset_name,
                "expected_date": expected,
                "is_expected_trading_day": True,
                "is_present": present,
                "reason_missing": reason,
                "last_checked_at": datetime.now(UTC),
            }
        )
        results.append(CompletenessResult(dataset.dataset_name, expected, present, reason))
    return results


def write_completion_marker(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
