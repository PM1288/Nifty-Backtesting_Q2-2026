from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any

import pandas as pd

from .config import Settings
from .db_schema import dataset_to_table_map

DATASET_ORDER = [
    "participant_open_interest",
    "participant_volume",
    "derivatives_stats",
]

PARTICIPANT_DATASETS = {
    "participant_oi": "participant_open_interest",
    "participant_volume": "participant_volume",
}

PARTICIPANT_COLUMN_MAP = {
    "Client Type": "client_type",
    "Future Index Long": "future_index_long",
    "Future Index Short": "future_index_short",
    "Future Stock Long": "future_stock_long",
    "Future Stock Short": "future_stock_short",
    "Option Index Call Long": "option_index_call_long",
    "Option Index Put Long": "option_index_put_long",
    "Option Index Call Short": "option_index_call_short",
    "Option Index Put Short": "option_index_put_short",
    "Option Stock Call Long": "option_stock_call_long",
    "Option Stock Put Long": "option_stock_put_long",
    "Option Stock Call Short": "option_stock_call_short",
    "Option Stock Put Short": "option_stock_put_short",
    "Total Long Contracts": "total_long_contracts",
    "Total Short Contracts": "total_short_contracts",
}

DERIVATIVES_COLUMN_MAP = {
    "fii_derivatives": "fii_derivatives",
    "buy_contracts": "buy_contracts",
    "buy_value_in_Cr": "buy_value_in_cr",
    "sell_contracts": "sell_contracts",
    "sell_value_in_Cr": "sell_value_in_cr",
    "open_contracts": "open_contracts",
    "open_contracts_value_in_Cr": "open_contracts_value_in_cr",
}


@dataclass(frozen=True)
class LoadRunTarget:
    kind: str
    run_id: str
    run_dir: Path
    manifest_path: Path


def _connect(settings: Settings):
    import psycopg2

    return psycopg2.connect(settings.postgres_dsn)


def _assert_tables_exist(conn, settings: Settings) -> None:
    dataset_map = dataset_to_table_map(settings.postgres_schema, settings.postgres_audit_schema)
    with conn.cursor() as cur:
        missing_tables: list[str] = []
        for table_name in dataset_map.values():
            cur.execute("SELECT to_regclass(%s)", (table_name,))
            exists = cur.fetchone()[0]
            if exists is None:
                missing_tables.append(table_name)
    if missing_tables:
        missing_list = ", ".join(missing_tables)
        raise RuntimeError(
            "Required FII report tables are missing: "
            f"{missing_list}. Apply the repo migration db/sql/012_nse_fii_reports.sql first."
        )


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _load_target_from_settings(
    settings: Settings,
    *,
    kind: str | None,
    run_id: str | None,
) -> LoadRunTarget:
    resolved_kind = kind.strip().lower() if kind else None
    resolved_run_id = run_id.strip() if run_id else None

    if resolved_kind and resolved_kind not in {"daily", "backfill"}:
        raise ValueError("Load kind must be 'daily' or 'backfill'.")
    if resolved_run_id and not resolved_kind:
        raise ValueError("Load kind is required when run_id is provided.")

    if resolved_kind == "daily":
        if not resolved_run_id:
            payload = _read_json(settings.latest_daily_metadata_path)
            if payload is None:
                raise FileNotFoundError("No latest daily metadata found.")
            trade_date = str(payload.get("trade_date", "")).strip()
            if not trade_date:
                raise FileNotFoundError("Latest daily metadata is missing trade_date.")
            resolved_run_id = datetime.strptime(trade_date, "%d-%m-%Y").strftime("%Y-%m-%d")
        run_dir = settings.latest_daily_root / resolved_run_id
        manifest_path = run_dir / "manifest.json"
    elif resolved_kind == "backfill":
        if not resolved_run_id:
            payload = _read_json(settings.latest_backfill_metadata_path)
            if payload is None:
                raise FileNotFoundError("No latest backfill metadata found.")
            resolved_run_id = Path(str(payload.get("output_dir", ""))).name or None
            if not resolved_run_id:
                raise FileNotFoundError("Latest backfill metadata is missing output_dir.")
        run_dir = settings.history_backfill_root / resolved_run_id
        manifest_path = run_dir / "manifest.csv"
    else:
        payload = _read_json(settings.latest_run_metadata_path)
        if payload is None:
            raise FileNotFoundError("No latest run metadata found.")
        operation = str(payload.get("operation", "")).strip().lower()
        if operation == "pull-latest":
            return _load_target_from_settings(settings, kind="daily", run_id=None)
        if operation == "backfill":
            return _load_target_from_settings(settings, kind="backfill", run_id=None)
        raise FileNotFoundError("Latest run metadata does not describe a loadable FII run.")

    if not run_dir.exists():
        raise FileNotFoundError(f"Run directory not found: {run_dir}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"Run manifest not found: {manifest_path}")
    return LoadRunTarget(kind=resolved_kind, run_id=resolved_run_id, run_dir=run_dir, manifest_path=manifest_path)


def _copy_dataframe(conn, df: pd.DataFrame, table_name: str) -> int:
    if df.empty:
        return 0
    ordered_df = df.where(pd.notnull(df), None)
    buffer = StringIO()
    ordered_df.to_csv(buffer, index=False, header=True)
    buffer.seek(0)
    columns = ", ".join(ordered_df.columns)
    with conn.cursor() as cur:
        cur.copy_expert(f"COPY {table_name} ({columns}) FROM STDIN WITH CSV HEADER", buffer)
    return len(ordered_df.index)


def _prepare_participant_frame(
    csv_path: Path,
    *,
    trade_date: str,
    run_id: str,
    run_kind: str,
    loaded_at: str,
) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df = df.rename(columns=PARTICIPANT_COLUMN_MAP)
    expected_columns = ["client_type", *[name for name in PARTICIPANT_COLUMN_MAP.values() if name != "client_type"]]
    for column in expected_columns:
        if column not in df.columns:
            df[column] = None
    for column in expected_columns:
        if column == "client_type":
            continue
        df[column] = pd.to_numeric(df[column], errors="coerce").astype("Int64")
    df.insert(0, "run_id", run_id)
    df.insert(1, "run_kind", run_kind)
    df.insert(2, "loaded_at", loaded_at)
    df.insert(3, "trade_date", datetime.strptime(trade_date, "%d-%m-%Y").date().isoformat())
    df["source_file"] = csv_path.name.replace(".parsed.csv", "")
    df["parsed_file"] = str(csv_path)
    return df[
        [
            "run_id",
            "run_kind",
            "loaded_at",
            "trade_date",
            "client_type",
            "future_index_long",
            "future_index_short",
            "future_stock_long",
            "future_stock_short",
            "option_index_call_long",
            "option_index_put_long",
            "option_index_call_short",
            "option_index_put_short",
            "option_stock_call_long",
            "option_stock_put_long",
            "option_stock_call_short",
            "option_stock_put_short",
            "total_long_contracts",
            "total_short_contracts",
            "source_file",
            "parsed_file",
        ]
    ]


def _prepare_derivatives_frame(
    csv_path: Path,
    *,
    trade_date: str,
    run_id: str,
    run_kind: str,
    loaded_at: str,
) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df = df.rename(columns=DERIVATIVES_COLUMN_MAP)
    expected_columns = list(DERIVATIVES_COLUMN_MAP.values())
    for column in expected_columns:
        if column not in df.columns:
            df[column] = None
    for column in expected_columns:
        if column == "fii_derivatives":
            continue
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df.insert(0, "run_id", run_id)
    df.insert(1, "run_kind", run_kind)
    df.insert(2, "loaded_at", loaded_at)
    df.insert(3, "trade_date", datetime.strptime(trade_date, "%d-%m-%Y").date().isoformat())
    df["source_file"] = csv_path.name.replace(".parsed.csv", "")
    df["parsed_file"] = str(csv_path)
    return df[
        [
            "run_id",
            "run_kind",
            "loaded_at",
            "trade_date",
            "fii_derivatives",
            "buy_contracts",
            "buy_value_in_cr",
            "sell_contracts",
            "sell_value_in_cr",
            "open_contracts",
            "open_contracts_value_in_cr",
            "source_file",
            "parsed_file",
        ]
    ]


def _delete_existing_run_rows(conn, table_name: str, run_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table_name} WHERE run_id = %s;", (run_id,))


def _delete_existing_manifest_rows(conn, table_name: str, run_id: str, dataset_names: list[str]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            f"DELETE FROM {table_name} WHERE run_id = %s AND dataset_name = ANY(%s);",
            (run_id, dataset_names),
        )


def _truncate_tables(conn, settings: Settings) -> None:
    dataset_map = dataset_to_table_map(settings.postgres_schema, settings.postgres_audit_schema)
    with conn.cursor() as cur:
        for dataset_name in ["manifest", *reversed(DATASET_ORDER)]:
            cur.execute(f"TRUNCATE TABLE {dataset_map[dataset_name]};")


def _build_daily_frames(target: LoadRunTarget) -> dict[str, pd.DataFrame]:
    manifest = _read_json(target.manifest_path)
    if manifest is None:
        raise FileNotFoundError(f"Daily manifest not found: {target.manifest_path}")
    reports = manifest.get("reports", {}) if isinstance(manifest, dict) else {}
    trade_date = str(manifest.get("trade_date", "")).strip()
    if not trade_date:
        raise ValueError("Daily manifest is missing trade_date.")
    loaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    frames: dict[str, list[pd.DataFrame]] = {dataset_name: [] for dataset_name in DATASET_ORDER}
    for report_key, report_meta in reports.items():
        if not isinstance(report_meta, dict):
            continue
        parsed_path_raw = report_meta.get("parsed_path")
        parsed = report_meta.get("parsed")
        if not parsed or not parsed_path_raw:
            continue
        parsed_path = Path(str(parsed_path_raw))
        if not parsed_path.exists():
            continue
        if report_key in PARTICIPANT_DATASETS:
            frames[PARTICIPANT_DATASETS[report_key]].append(
                _prepare_participant_frame(
                    parsed_path,
                    trade_date=trade_date,
                    run_id=target.run_id,
                    run_kind=target.kind,
                    loaded_at=loaded_at,
                )
            )
        elif report_key == "fii_stats":
            frames["derivatives_stats"].append(
                _prepare_derivatives_frame(
                    parsed_path,
                    trade_date=trade_date,
                    run_id=target.run_id,
                    run_kind=target.kind,
                    loaded_at=loaded_at,
                )
            )
    return {
        dataset_name: pd.concat(dataset_frames, ignore_index=True) if dataset_frames else pd.DataFrame()
        for dataset_name, dataset_frames in frames.items()
    }


def _build_backfill_frames(target: LoadRunTarget) -> dict[str, pd.DataFrame]:
    manifest_df = pd.read_csv(target.manifest_path)
    if manifest_df.empty:
        return {dataset_name: pd.DataFrame() for dataset_name in DATASET_ORDER}
    loaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    frames: dict[str, list[pd.DataFrame]] = {dataset_name: [] for dataset_name in DATASET_ORDER}
    for row in manifest_df.to_dict(orient="records"):
        report_key = str(row.get("report_key", "")).strip()
        trade_date = str(row.get("trade_date", "")).strip()
        parsed_path_raw = row.get("parsed_path")
        parsed = str(row.get("parsed", "")).strip().lower() == "true"
        if not report_key or not trade_date or not parsed or not parsed_path_raw:
            continue
        parsed_path = Path(str(parsed_path_raw))
        if not parsed_path.exists():
            continue
        if report_key in PARTICIPANT_DATASETS:
            frames[PARTICIPANT_DATASETS[report_key]].append(
                _prepare_participant_frame(
                    parsed_path,
                    trade_date=trade_date,
                    run_id=target.run_id,
                    run_kind=target.kind,
                    loaded_at=loaded_at,
                )
            )
        elif report_key == "fii_stats":
            frames["derivatives_stats"].append(
                _prepare_derivatives_frame(
                    parsed_path,
                    trade_date=trade_date,
                    run_id=target.run_id,
                    run_kind=target.kind,
                    loaded_at=loaded_at,
                )
            )
    return {
        dataset_name: pd.concat(dataset_frames, ignore_index=True) if dataset_frames else pd.DataFrame()
        for dataset_name, dataset_frames in frames.items()
    }


def _manifest_row(
    *,
    run_id: str,
    dataset_name: str,
    table_name: str,
    row_count: int,
    status: str,
    run_dir: Path,
    notes: str,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "dataset_name": dataset_name,
        "table_name": table_name,
        "row_count": row_count,
        "status": status,
        "combined_file": None,
        "raw_dir": str(run_dir),
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def load_run_to_postgres(
    settings: Settings,
    *,
    kind: str | None = None,
    run_id: str | None = None,
    truncate_tables_on_load: bool | None = None,
) -> dict[str, Any]:
    effective_settings = (
        settings.with_overrides(truncate_tables_on_load=truncate_tables_on_load)
        if truncate_tables_on_load is not None
        else settings
    )
    target = _load_target_from_settings(effective_settings, kind=kind, run_id=run_id)
    dataset_map = dataset_to_table_map(
        effective_settings.postgres_schema,
        effective_settings.postgres_audit_schema,
    )
    frames = _build_daily_frames(target) if target.kind == "daily" else _build_backfill_frames(target)

    conn = _connect(effective_settings)
    try:
        _assert_tables_exist(conn, effective_settings)
        if effective_settings.truncate_tables_on_load:
            _truncate_tables(conn, effective_settings)
        else:
            for dataset_name in DATASET_ORDER:
                _delete_existing_run_rows(conn, dataset_map[dataset_name], target.run_id)
            _delete_existing_manifest_rows(conn, dataset_map["manifest"], target.run_id, DATASET_ORDER)

        load_results: list[dict[str, Any]] = []
        manifest_rows: list[dict[str, Any]] = []
        for dataset_name in DATASET_ORDER:
            table_name = dataset_map[dataset_name]
            frame = frames[dataset_name]
            row_count = _copy_dataframe(conn, frame, table_name)
            status = "LOADED" if row_count > 0 else "SKIPPED"
            manifest_rows.append(
                _manifest_row(
                    run_id=target.run_id,
                    dataset_name=dataset_name,
                    table_name=table_name,
                    row_count=row_count,
                    status=status,
                    run_dir=target.run_dir,
                    notes=f"kind={target.kind}; manifest={target.manifest_path}",
                )
            )
            load_results.append(
                {
                    "dataset_name": dataset_name,
                    "table_name": table_name,
                    "status": status,
                    "row_count": row_count,
                }
            )

        _copy_dataframe(conn, pd.DataFrame(manifest_rows), dataset_map["manifest"])
        conn.commit()
        return {
            "kind": target.kind,
            "run_id": target.run_id,
            "run_dir": str(target.run_dir),
            "manifest_path": str(target.manifest_path),
            "load_results": load_results,
        }
    finally:
        conn.close()
