"""
postgres.py
===========
PostgreSQL persistence layer for the processed Trendlyne report output.

This mirrors the final processed dataset into the existing production
table:

    PostgreSQL -> tradingdb -> research.trendlyne_reports

It is an ADDITIONAL durability layer on top of the SQLite working store
(database.py). It runs *after* the data has been crawled, parsed,
cleaned, transformed and validated by the exporter, so the local
files/output are always produced first and DB failures never lose them.

Flow:

    Scrape -> Parse -> Clean/Transform -> Validate -> Export (files)
        -> upsert_reports(...)   # one batch, one transaction
        -> commit / rollback

Design notes
------------
- Connection params are read from SETTINGS (.env); the password is
  never logged.
- The conflict (upsert) target is discovered from the LIVE table by
  querying its primary key / unique constraints - it is never assumed.
- The exact column mapping (ReportRecord field -> PG column) is
  validated against information_schema before any insert so we never
  blindly write to a drifted schema. The table is never dropped,
  altered or recreated here.
- Uses psycopg2.extras.execute_values for a single efficient batch
  with one connection open -> one commit -> one close.
"""
from __future__ import annotations

import math
import time
from typing import Dict, Iterable, List, Optional, Tuple

import psycopg2
import psycopg2.extras
import psycopg2.extensions
from psycopg2 import sql as psy_sql

from config import SETTINGS
from models import ReportRecord, synthetic_report_id
from utils import LOGGER

SCHEMA = SETTINGS.db_schema            # "research"
TABLE = SETTINGS.db_table              # "trendlyne_reports"
_QUALIFIED_TABLE = f"{SCHEMA}.{TABLE}"

# Mapping from the pipeline's field names to PostgreSQL column names.
# The production table was created to mirror ReportRecord, so the map is
# 1:1 - it is kept explicit (and re-validated at runtime) so a future
# rename in either layer is a single, auditable change.
COLUMN_MAPPING: Dict[str, str] = {name: name for name in ReportRecord.field_names()}


class PostgresStorageError(RuntimeError):
    """Raised for any PostgreSQL failure. The caller decides whether the
    failure is fatal for the whole pipeline (it is not, here)."""


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------
def get_connection() -> psycopg2.extensions.connection:
    """Open a new PostgreSQL connection from SETTINGS (.env)."""
    return psycopg2.connect(
        host=SETTINGS.db_host,
        port=SETTINGS.db_port,
        dbname=SETTINGS.db_name,
        user=SETTINGS.db_user,
        password=SETTINGS.db_password,
        connect_timeout=SETTINGS.db_connect_timeout_sec,
    )


def _describe_connect_error(exc: psycopg2.Error) -> str:
    """Build a human-readable, credential-free description of a connect
    failure so operators can tell the failure mode apart at a glance."""
    primary = getattr(getattr(exc, "diag", None), "message_primary", None)
    msg = (primary or str(exc)).strip()
    code = getattr(exc, "pgcode", None)
    suffix = f" (SQLSTATE {code})" if code else ""
    lowered = msg.lower()

    if code in {"28P01", "28000"} or "password authentication failed" in lowered:
        return (f"PostgreSQL authentication failed for user '{SETTINGS.db_user}' - "
                f"check DB_USER/DB_PASSWORD in .env.{suffix}")
    if "no password supplied" in lowered:
        return (f"PostgreSQL authentication failed - no password supplied for "
                f"user '{SETTINGS.db_user}' (check .env DB_PASSWORD).{suffix}")
    if "does not exist" in lowered and "database" in lowered:
        return (f"PostgreSQL database '{SETTINGS.db_name}' does not exist on server "
                f"{SETTINGS.db_host}.{suffix}")
    if "does not exist" in lowered and ("role" in lowered or "user" in lowered):
        return (f"PostgreSQL user '{SETTINGS.db_user}' does not exist on server "
                f"{SETTINGS.db_host}.{suffix}")
    if code in {"42501", "28000"} or "permission denied" in lowered or "insufficient_privilege" in lowered:
        return (f"PostgreSQL permission denied for user '{SETTINGS.db_user}' on "
                f"database '{SETTINGS.db_name}'.{suffix}")
    if any(k in lowered for k in (
            "connection refused", "timed out", "timeout expired", "could not connect",
            "could not translate", "no such host", "network is unreachable",
            "connection reset", "server does not exist", "server closed the connection")):
        return (f"PostgreSQL server unreachable at {SETTINGS.db_host}:{SETTINGS.db_port} - "
                f"is it running and reachable?{suffix}")
    return f"{msg}{suffix}"


def check_connectivity() -> bool:
    """Lightweight `SELECT 1` probe. Returns True on success; raises
    PostgresStorageError with a categorized, credential-free message."""
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        LOGGER.info(
            "PostgreSQL connectivity OK: %s@%s:%s/%s",
            SETTINGS.db_user, SETTINGS.db_host, SETTINGS.db_port, SETTINGS.db_name,
        )
        return True
    except psycopg2.OperationalError as exc:
        raise PostgresStorageError(_describe_connect_error(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - psycopg2 raises several types
        raise PostgresStorageError(f"PostgreSQL connectivity check failed: {exc}") from exc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# Schema / table validation (read-only - never creates or alters)
# ---------------------------------------------------------------------------
def _schema_exists(cur) -> bool:
    cur.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (SCHEMA,))
    return cur.fetchone() is not None


def _table_exists(cur) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = %s AND table_name = %s",
        (SCHEMA, TABLE),
    )
    return cur.fetchone() is not None


def _actual_columns(cur) -> Dict[str, bool]:
    """Return {column_name: is_nullable} for the live table."""
    cur.execute(
        "SELECT column_name, is_nullable FROM information_schema.columns "
        "WHERE table_schema = %s AND table_name = %s",
        (SCHEMA, TABLE),
    )
    return {row[0]: (row[1] == "YES") for row in cur.fetchall()}


def _conflict_columns(cur) -> List[str]:
    """Discover the real primary key; fall back to any unique constraint.
    Column ORDER also matters for ON CONFLICT, so return PK ordering."""
    cur.execute(
        """
        SELECT a.attname
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname = %s AND c.relname = %s AND i.indisprimary
        ORDER BY a.attnum
        """,
        (SCHEMA, TABLE),
    )
    pk = [row[0] for row in cur.fetchall()]
    if pk:
        return pk

    # Fall back to the first unique constraint (keyed in ordinal order).
    cur.execute(
        """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
            AND kcu.table_name = tc.table_name
        WHERE tc.table_schema = %s AND tc.table_name = %s
          AND tc.constraint_type IN ('UNIQUE')
        ORDER BY tc.constraint_name, kcu.ordinal_position
        """,
        (SCHEMA, TABLE),
    )
    return [row[0] for row in cur.fetchall()]


def validate_storage() -> Dict[str, object]:
    """Verify schema/table/columns/conflict-target exist as expected and
    return a small schema report. Raises PostgresStorageError otherwise.

    This never drops, alters, or recreates anything - it only checks.
    """
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()

        if not _schema_exists(cur):
            raise PostgresStorageError(
                f"Schema '{SCHEMA}' does not exist in database '{SETTINGS.db_name}'. "
                f"Cannot store Trendlyne reports. Create it (e.g. `CREATE SCHEMA {SCHEMA}`)"
                " or correct DB_NAME/DB_SCHEMA - nothing was modified."
            )
        if not _table_exists(cur):
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' does not exist. Cannot store Trendlyne "
                "reports. Create the table via a migration (see README) or fix the "
                "schema/table config - nothing was modified."
            )

        actual = _actual_columns(cur)
        missing = [c for c in COLUMN_MAPPING.values() if c not in actual]
        if missing:
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' is missing column(s) {missing} expected by "
                "the pipeline. A schema migration is required before writing - nothing was modified."
            )

        conflict = _conflict_columns(cur)
        if not conflict:
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' has no primary key or unique constraint, "
                "so a safe UPSERT is impossible. Refusing to write duplicate-prone rows."
            )
        bad_conflict = [c for c in conflict if c not in actual]
        if bad_conflict:
            raise PostgresStorageError(
                f"Conflict key column(s) {bad_conflict} not found on '{_QUALIFIED_TABLE}'."
            )

        report = {
            "schema": SCHEMA,
            "table": TABLE,
            "columns": len(actual),
            "mapped_columns": len(COLUMN_MAPPING),
            "conflict_columns": conflict,
            "nullable_table": any(
                not nullable for name, nullable in actual.items() if name in COLUMN_MAPPING
            ),
        }
        LOGGER.info(
            "PostgreSQL storage validated: %s (%d live columns, %d mapped, "
            "conflict key=%s)",
            _QUALIFIED_TABLE, len(actual), len(COLUMN_MAPPING), ",".join(conflict),
        )
        return report
    except psycopg2.OperationalError as exc:
        raise PostgresStorageError(_describe_connect_error(exc)) from exc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# Row preparation (scraped values -> tuple for the parameterized insert)
# ---------------------------------------------------------------------------
def _db_value(value):
    """Convert app values to types the PG columns accept; None stays NULL."""
    if value is None:
        return None
    if isinstance(value, bool):
        # rating_change / target_change are int4 columns.
        return 1 if value else 0
    if isinstance(value, float):
        # NaN/±Inf are not meaningful here -> treat as NULL, like the
        # rest of the pipeline's cleaning does.
        if not math.isfinite(value):
            return None
        return value
    if isinstance(value, str):
        value = value.strip()
        if not value or value.lower() in ("none", "nan"):
            return None
        return value
    return value


def _prepare_row(record) -> Optional[Tuple]:
    """One scraped record dict -> a tuple in COLUMN_MAPPING order.

    Returns None for empty/insubstantial rows (mirrors the exporter's
    cleanup so the DB only ever sees the same 'processed output' that is
    written to CSV/Parquet).
    """
    if not isinstance(record, dict):
        return None
    d = dict(record)
    if not d.get("report_id"):
        d["report_id"] = synthetic_report_id(d)
    # A substantive row has at least one of: date, stock, broker, title.
    if not any(d.get(k) for k in ("report_date", "stock_name", "broker_name", "report_title")):
        return None
    return tuple(_db_value(d.get(field)) for field in COLUMN_MAPPING)


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------
def upsert_reports(records: Iterable[dict]) -> Dict[str, object]:
    """Batch-upsert the processed Trendlyne records into
    `research.trendlyne_reports`.

    One connection -> one execute_values batch -> one commit -> one close.
    Conflict target is the table's real PK from the live schema.

    Returns a summary dict:
        attempted, inserted, updated, skipped, failed, duration_sec

    On any failure the whole transaction is rolled back and a
    PostgresStorageError is raised (with the error logged, credentials
    never included). The caller decides whether that is fatal.
    """
    prepared = [_prepare_row(r) for r in records]
    skipped = sum(1 for r in prepared if r is None)
    rows = [r for r in prepared if r is not None]
    attempted = len(prepared)

    if not rows:
        LOGGER.warning(
            "No valid records to persist to PostgreSQL (attempted=%d, skipped=%d empty).",
            attempted, skipped,
        )
        return {"attempted": attempted, "inserted": 0, "updated": 0,
                "skipped": skipped, "failed": 0, "duration_sec": 0.0}

    LOGGER.info(
        "Starting PostgreSQL insertion into %s (%d records, %d skipped).",
        _QUALIFIED_TABLE, len(rows), skipped,
    )
    start = time.monotonic()
    conn = None
    inserted = updated = 0
    try:
        conn = get_connection()
        cur = conn.cursor()

        conflict = _conflict_columns(cur)
        if not conflict:
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' has no primary key/unique constraint - "
                "cannot upsert safely."
            )

        # Read-only validation before writing (never creates/alters).
        if not _table_exists(cur):
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' does not exist - refusing to insert. "
                "Create it via a migration first."
            )
        actual = _actual_columns(cur)
        missing = [c for c in COLUMN_MAPPING.values() if c not in actual]
        if missing:
            raise PostgresStorageError(
                f"Table '{_QUALIFIED_TABLE}' missing expected column(s) {missing}; "
                "run a migration first. Nothing was written."
            )

        columns = list(COLUMN_MAPPING.values())
        cols_sql = psy_sql.SQL(", ").join(psy_sql.Identifier(c) for c in columns)
        conflict_sql = psy_sql.SQL(", ").join(psy_sql.Identifier(c) for c in conflict)
        update_sql = psy_sql.SQL(", ").join(
            psy_sql.SQL("{} = EXCLUDED.{}").format(psy_sql.Identifier(c), psy_sql.Identifier(c))
            for c in columns if c not in conflict
        )
        stmt = psy_sql.SQL(
            "INSERT INTO {}.{} ({}) VALUES %s "
            "ON CONFLICT ({}) DO UPDATE SET {} "
            "RETURNING (xmax = 0) AS was_inserted"
        ).format(psy_sql.Identifier(SCHEMA), psy_sql.Identifier(TABLE),
                 cols_sql, conflict_sql, update_sql)

        result = psycopg2.extras.execute_values(
            cur, stmt, rows, page_size=1000, fetch=True,
        )
        inserted = sum(1 for r in result if r and r[0] is True)
        updated = len(result) - inserted
        conn.commit()
    except Exception as exc:  # noqa: BLE001 - psycopg2.Error, PostgresStorageError, ...
        if conn is not None:
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass
        if isinstance(exc, PostgresStorageError):
            LOGGER.error(
                "Trendlyne reports were NOT stored into %s: %s", _QUALIFIED_TABLE, exc,
            )
            raise exc
        if isinstance(exc, psycopg2.Error):
            LOGGER.error(
                "Failed to store Trendlyne reports into %s: %s",
                _QUALIFIED_TABLE, _describe_connect_error(exc),
            )
        else:
            LOGGER.error(
                "Failed to store Trendlyne reports into %s: %s", _QUALIFIED_TABLE, exc,
            )
        raise PostgresStorageError(
            f"PostgreSQL write to {_QUALIFIED_TABLE} failed - "
            f"{_describe_connect_error(exc) if isinstance(exc, psycopg2.Error) else exc}"
        ) from exc
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass

    elapsed = round(time.monotonic() - start, 3)
    # failed counts rows lost by the transaction (e.g. one bad row rolled
    # everything back). On success this is 0.
    failed = max(0, attempted - inserted - updated - skipped)
    summary = {
        "attempted": attempted,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "duration_sec": elapsed,
    }
    LOGGER.info(
        "Successfully upserted %d records into %s (%d inserted, %d updated, "
        "%d skipped, %d failed) in %.3fs",
        attempted, _QUALIFIED_TABLE, inserted, updated, skipped, failed, elapsed,
    )
    return summary