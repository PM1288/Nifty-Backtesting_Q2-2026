from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Sequence

from .backtesting import BATCH_NAME


@dataclass(frozen=True)
class ExportSpec:
    filename: str
    table: str
    order_by: str


EXPORT_SPECS = (
    ExportSpec("trades.csv", "backtest_trade_log", "t.scenario_key, t.entry_date, t.symbol, t.trade_log_id"),
    ExportSpec("open_positions.csv", "backtest_open_position", "t.scenario_key, t.entry_date, t.symbol"),
    ExportSpec("daily_equity.csv", "backtest_daily_equity", "t.scenario_key, t.trade_date"),
    ExportSpec("stock_summary.csv", "backtest_stock_summary", "t.scenario_key, t.symbol"),
    ExportSpec("regime_summary.csv", "backtest_regime_summary", "t.scenario_key, t.regime_label"),
    ExportSpec("skipped_signals.csv", "backtest_skipped_signal", "t.scenario_key, t.signal_date, t.symbol, t.skipped_signal_id"),
)

_SAFE_COMPONENT = re.compile(r"[^A-Za-z0-9._-]+")
_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def safe_component(value: str) -> str:
    cleaned = _SAFE_COMPONENT.sub("_", value.strip()).strip("._-")
    if not cleaned:
        raise ValueError("CSV export path component is empty after sanitization")
    return cleaned[:120]


def _snake_case(value: str) -> str:
    return _CAMEL_BOUNDARY.sub("_", value).replace("-", "_").lower()


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    if isinstance(value, str) and value.startswith(("=", "+", "@", "\t", "\r")):
        return f"'{value}"
    return value


def flatten_summary_row(row: dict[str, Any]) -> dict[str, Any]:
    flattened = {key: value for key, value in row.items() if key not in {"summary_json", "metadata_json"}}
    for source_name in ("summary_json", "metadata_json"):
        prefix = "" if source_name == "summary_json" else "metadata_"
        payload = row.get(source_name) or {}
        if not isinstance(payload, dict):
            flattened[source_name] = payload
            continue
        for key, value in payload.items():
            column = f"{prefix}{_snake_case(str(key))}"
            if column in flattened:
                column = f"summary_{column}"
            flattened[column] = value
    return flattened


def _write_rows(path: Path, columns: Sequence[str], rows: Iterable[Sequence[Any]]) -> tuple[int, str, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    count = 0
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(columns)
        for row in rows:
            writer.writerow([_csv_value(value) for value in row])
            count += 1
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return count, digest.hexdigest(), path.stat().st_size


def _write_dict_rows(path: Path, rows: list[dict[str, Any]]) -> tuple[int, str, int]:
    columns: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                columns.append(key)
    return _write_rows(path, columns, ([row.get(column) for column in columns] for row in rows))


def _fetch_dict_rows(conn, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        columns = [item.name for item in cur.description or []]
        return [dict(zip(columns, row, strict=True)) for row in cur.fetchall()]


def _latest_published_batch_id(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT batch_run_id
            FROM nse_app.batch_run_audit
            WHERE batch_name = %(batch_name)s
              AND published_flag = TRUE
              AND status = 'published'
            ORDER BY published_at DESC NULLS LAST, batch_run_id DESC
            LIMIT 1
            """,
            {"batch_name": BATCH_NAME},
        )
        row = cur.fetchone()
    if row is None:
        raise RuntimeError("No published backtesting batch is available for CSV export")
    return int(row[0])


def _batch_metadata(conn, batch_run_id: int) -> dict[str, Any]:
    rows = _fetch_dict_rows(
        conn,
        """
        SELECT batch_run_id, batch_name, data_as_of_date, status, validation_status,
               published_flag,
               generated_at, published_at, config_version, row_counts, validation_metrics,
               assumptions_json
        FROM nse_app.batch_run_audit
        WHERE batch_run_id = %(batch_run_id)s
          AND batch_name = %(batch_name)s
          AND status = 'published'
          AND validation_status = 'passed'
        """,
        {"batch_run_id": batch_run_id, "batch_name": BATCH_NAME},
    )
    if not rows:
        raise RuntimeError(f"Backtesting batch {batch_run_id} is not a validated published batch")
    return rows[0]


def _strategies(conn, batch_run_id: int) -> list[dict[str, Any]]:
    return _fetch_dict_rows(
        conn,
        """
        SELECT strategy_id, display_name, archetype, strategy_version_id,
               COUNT(*)::int AS scenario_count
        FROM nse_app.backtest_strategy_summary_mart
        WHERE batch_run_id = %(batch_run_id)s
        GROUP BY strategy_id, display_name, archetype, strategy_version_id
        ORDER BY strategy_id, strategy_version_id
        """,
        {"batch_run_id": batch_run_id},
    )


def _summary_rows(conn, batch_run_id: int, strategy_id: str | None = None) -> list[dict[str, Any]]:
    strategy_filter = "AND m.strategy_id = %(strategy_id)s" if strategy_id is not None else ""
    rows = _fetch_dict_rows(
        conn,
        f"""
        SELECT m.batch_run_id, m.strategy_id, m.display_name, m.archetype,
               m.strategy_version_id, m.scenario_key, m.universe_mode, m.capital_mode,
               m.stock_symbol, m.as_of_date, r.generated_at, r.status,
               m.summary_json, m.metadata_json
        FROM nse_app.backtest_strategy_summary_mart m
        JOIN nse_app.backtest_run r
          ON r.batch_run_id = m.batch_run_id
         AND r.strategy_version_id = m.strategy_version_id
         AND r.scenario_key = m.scenario_key
        WHERE m.batch_run_id = %(batch_run_id)s
          {strategy_filter}
        ORDER BY m.strategy_id, m.strategy_version_id, m.scenario_key
        """,
        {"batch_run_id": batch_run_id, "strategy_id": strategy_id},
    )
    return [flatten_summary_row(row) for row in rows]


def _export_table(conn, path: Path, batch_run_id: int, strategy_id: str, spec: ExportSpec) -> tuple[int, str, int]:
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT s.strategy_id, s.display_name, s.archetype, t.*
            FROM nse_app.{spec.table} t
            JOIN nse_app.backtest_strategy_summary_mart s
              ON s.batch_run_id = t.batch_run_id
             AND s.strategy_version_id = t.strategy_version_id
             AND s.scenario_key = t.scenario_key
            WHERE t.batch_run_id = %(batch_run_id)s
              AND s.strategy_id = %(strategy_id)s
            ORDER BY {spec.order_by}
            """,
            {"batch_run_id": batch_run_id, "strategy_id": strategy_id},
        )
        columns = [item.name for item in cur.description or []]

        def iter_rows() -> Iterable[Sequence[Any]]:
            while True:
                chunk = cur.fetchmany(2000)
                if not chunk:
                    return
                yield from chunk

        return _write_rows(path, columns, iter_rows())


def _export_validation(conn, path: Path, batch_run_id: int, strategy_id: str) -> tuple[int, str, int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.strategy_id, s.display_name, v.strategy_version_id,
                   v.batch_run_id, v.scenario_key, v.validation_name, v.status,
                   v.details_json, v.created_at
            FROM nse_app.backtest_run_validation v
            JOIN nse_app.backtest_strategy_version sv
              ON sv.strategy_version_id = v.strategy_version_id
            JOIN nse_app.backtest_strategy s
              ON s.strategy_id = sv.strategy_id
            WHERE v.batch_run_id = %(batch_run_id)s
              AND s.strategy_id = %(strategy_id)s
            ORDER BY v.strategy_version_id, v.scenario_key NULLS FIRST, v.validation_name, v.id
            """,
            {"batch_run_id": batch_run_id, "strategy_id": strategy_id},
        )
        columns = [item.name for item in cur.description or []]
        return _write_rows(path, columns, cur.fetchall())


def _replace_export_directory(staging: Path, final: Path) -> None:
    if final.parent != staging.parent or not final.name.startswith("batch-"):
        raise ValueError("Refusing to replace an unexpected CSV export directory")
    previous = final.with_name(f".{final.name}.previous-{uuid.uuid4().hex}")
    if final.exists():
        final.rename(previous)
    try:
        staging.rename(final)
    except Exception:
        if previous.exists() and not final.exists():
            previous.rename(final)
        raise
    if previous.exists():
        shutil.rmtree(previous)


def export_backtesting_csv(conn, output_root: Path, batch_run_id: int | None = None) -> dict[str, Any]:
    resolved_batch_id = batch_run_id if batch_run_id is not None else _latest_published_batch_id(conn)
    metadata = _batch_metadata(conn, resolved_batch_id)
    strategies = _strategies(conn, resolved_batch_id)
    if not strategies:
        raise RuntimeError(f"Backtesting batch {resolved_batch_id} contains no strategy summaries")

    root = output_root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    final = root / f"batch-{resolved_batch_id}"
    staging = root / f".batch-{resolved_batch_id}.staging-{uuid.uuid4().hex}"
    staging.mkdir(parents=False)
    exported_at = datetime.now(timezone.utc).isoformat()

    try:
        batch_metadata_rows = [flatten_summary_row(metadata)]
        _write_dict_rows(staging / "batch_metadata.csv", batch_metadata_rows)
        all_summary = _summary_rows(conn, resolved_batch_id)
        _write_dict_rows(staging / "all_strategies_summary.csv", all_summary)

        batch_manifest_rows: list[dict[str, Any]] = []
        total_rows = 0
        for strategy in strategies:
            strategy_id = str(strategy["strategy_id"])
            strategy_folder = staging / safe_component(strategy_id)
            strategy_folder.mkdir()
            artifacts: list[dict[str, Any]] = []

            summary_path = strategy_folder / "strategy_summary.csv"
            count, checksum, size = _write_dict_rows(summary_path, _summary_rows(conn, resolved_batch_id, strategy_id))
            artifacts.append({"file_name": summary_path.name, "row_count": count, "sha256": checksum, "size_bytes": size})

            for spec in EXPORT_SPECS:
                artifact_path = strategy_folder / spec.filename
                count, checksum, size = _export_table(conn, artifact_path, resolved_batch_id, strategy_id, spec)
                artifacts.append({"file_name": artifact_path.name, "row_count": count, "sha256": checksum, "size_bytes": size})

            validation_path = strategy_folder / "validation.csv"
            count, checksum, size = _export_validation(conn, validation_path, resolved_batch_id, strategy_id)
            artifacts.append({"file_name": validation_path.name, "row_count": count, "sha256": checksum, "size_bytes": size})

            for artifact in artifacts:
                artifact.update(
                    {
                        "batch_run_id": resolved_batch_id,
                        "strategy_id": strategy_id,
                        "strategy_version_id": strategy["strategy_version_id"],
                        "exported_at_utc": exported_at,
                    }
                )
            _write_dict_rows(strategy_folder / "manifest.csv", artifacts)
            strategy_rows = sum(int(item["row_count"]) for item in artifacts)
            total_rows += strategy_rows
            batch_manifest_rows.append(
                {
                    "batch_run_id": resolved_batch_id,
                    "strategy_id": strategy_id,
                    "display_name": strategy["display_name"],
                    "archetype": strategy["archetype"],
                    "strategy_version_id": strategy["strategy_version_id"],
                    "scenario_count": strategy["scenario_count"],
                    "csv_file_count": len(artifacts),
                    "exported_row_count": strategy_rows,
                    "relative_folder": safe_component(strategy_id),
                    "exported_at_utc": exported_at,
                }
            )

        _write_dict_rows(staging / "batch_manifest.csv", batch_manifest_rows)
        _replace_export_directory(staging, final)
        _write_dict_rows(
            root / "latest.csv",
            [
                {
                    "batch_run_id": resolved_batch_id,
                    "relative_folder": final.name,
                    "data_as_of_date": metadata["data_as_of_date"],
                    "strategy_count": len(strategies),
                    "exported_row_count": total_rows,
                    "exported_at_utc": exported_at,
                }
            ],
        )
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise

    return {
        "backtesting_csv_batch_run_id": resolved_batch_id,
        "backtesting_csv_export_dir": str(final),
        "backtesting_csv_strategy_count": len(strategies),
        "backtesting_csv_row_count": total_rows,
    }
