from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from .db import fetch_value, record_quality_check_result

logger = logging.getLogger(__name__)


def _compare(value: float | None, operator: str, threshold: float) -> bool:
    if value is None:
        return False
    if operator == ">=":
        return value >= threshold
    if operator == ">":
        return value > threshold
    if operator == "<=":
        return value <= threshold
    if operator == "<":
        return value < threshold
    if operator == "==":
        return value == threshold
    raise ValueError(f"Unsupported operator: {operator}")


def run_checks(conn, checks_path: Path, job_run_id: int | None = None) -> dict[str, Any]:
    payload = yaml.safe_load(checks_path.read_text(encoding="utf-8"))
    checks = payload.get("checks", [])
    passed = 0
    failed = 0
    warnings = 0

    for check in checks:
        name = check["name"]
        severity = check["severity"]
        operator = check["operator"]
        threshold = float(check["threshold"])
        sql = check["sql"]

        value = fetch_value(conn, sql)
        try:
            numeric_value = None if value is None else float(value)
        except Exception:
            numeric_value = None

        ok = _compare(numeric_value, operator, threshold)
        status = "pass" if ok else ("warn" if severity.lower() == "medium" else "fail")

        if status == "pass":
            passed += 1
        elif status == "warn":
            warnings += 1
        else:
            failed += 1

        logger.info("Check %s => %s (%s %s, observed=%s)", name, status, operator, threshold, numeric_value)
        record_quality_check_result(
            conn=conn,
            job_run_id=job_run_id,
            check_name=name,
            severity=severity,
            status=status,
            observed_value=numeric_value,
            operator=operator,
            threshold=threshold,
            details={"sql": sql},
        )

    return {"checks_passed": passed, "checks_warned": warnings, "checks_failed": failed}
