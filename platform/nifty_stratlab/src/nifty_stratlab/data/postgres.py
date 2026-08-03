from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterator, Sequence

from nifty_stratlab.contracts import MarketBar


class PostgresDependencyError(RuntimeError):
    pass


class UniverseCoverageError(RuntimeError):
    pass


def _psycopg():
    try:
        import psycopg  # type: ignore
        from psycopg.rows import dict_row  # type: ignore
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise PostgresDependencyError(
            "PostgreSQL support requires: pip install 'nifty-stratlab[postgres]'"
        ) from exc
    return psycopg, dict_row


@contextmanager
def readonly_connection(dsn: str | None = None):
    psycopg, dict_row = _psycopg()
    effective_dsn = dsn or os.getenv("TRADING_DATABASE_URL")
    if not effective_dsn:
        raise ValueError("TRADING_DATABASE_URL is not set")
    with psycopg.connect(effective_dsn, row_factory=dict_row, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY")
            cur.execute("SET LOCAL statement_timeout = '120s'")
        yield conn
        conn.rollback()


CORE_COVERAGE_QUERIES: dict[str, tuple[str, str]] = {
    "eod": ("nse.fact_eod_prices", "trade_date"),
    "bhavcopy": ("nse.fact_bhavcopy_udiff", "trade_date"),
    "minute_equity": ("public.bars_1m", "ts"),
    "intraday_security": ("nse_intraday.raw_security_1m", "minute_ts"),
    "intraday_index": ("nse_intraday.raw_index_1m", "minute_ts"),
    "intraday_features": ("nse_intraday.security_minute_feature", "minute_ts"),
    "option_chain": ("public.option_chain_snapshots", "captured_at"),
    "option_greeks": ("public.option_greeks", "ts"),
    "pcr": ("public.pcr_snapshots", "ts"),
}


def inspect_core_coverage(dsn: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with readonly_connection(dsn) as conn:
        with conn.cursor() as cur:
            for dataset, (table_name, time_column) in CORE_COVERAGE_QUERIES.items():
                schema, table = table_name.split(".", 1)
                cur.execute("SELECT to_regclass(%s) AS relation", (table_name,))
                if cur.fetchone()["relation"] is None:
                    rows.append({"dataset": dataset, "table": table_name, "present": False})
                    continue
                query = f'SELECT count(*) AS row_count, min("{time_column}") AS oldest, max("{time_column}") AS newest FROM "{schema}"."{table}"'
                cur.execute(query)
                result = cur.fetchone()
                rows.append(
                    {
                        "dataset": dataset,
                        "table": table_name,
                        "present": True,
                        "row_count": int(result["row_count"]),
                        "oldest": result["oldest"].isoformat() if result["oldest"] else None,
                        "newest": result["newest"].isoformat() if result["newest"] else None,
                    }
                )
    return rows


def point_in_time_universe(
    as_of: date,
    *,
    dsn: str | None = None,
    universe_name: str = "NIFTY100",
    allow_snapshot_dedupe: bool = False,
) -> list[dict[str, Any]]:
    """Read an as-of universe and fail closed when effective dates are ambiguous."""

    sql = """
        SELECT DISTINCT ON (symbol)
               symbol, sector_name, weight AS universe_weight, effective_from, effective_to
          FROM nse_intraday.universe_membership
         WHERE universe_name = %(universe_name)s
           AND effective_from <= %(as_of)s
           AND (effective_to IS NULL OR effective_to >= %(as_of)s)
         ORDER BY symbol, effective_from DESC, created_at DESC
    """
    with readonly_connection(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT min(effective_from) AS oldest,
                   count(*) FILTER (WHERE effective_to IS NULL) AS open_rows,
                   count(DISTINCT symbol) FILTER (WHERE effective_to IS NULL) AS open_symbols
              FROM nse_intraday.universe_membership
             WHERE universe_name = %(universe_name)s
            """,
            {"universe_name": universe_name},
        )
        coverage = cur.fetchone()
        if coverage["oldest"] is None or as_of < coverage["oldest"]:
            raise UniverseCoverageError(
                f"{universe_name} membership starts at {coverage['oldest']}; requested {as_of}"
            )
        duplicate_open_rows = int(coverage["open_rows"]) - int(coverage["open_symbols"])
        if duplicate_open_rows > 0 and not allow_snapshot_dedupe:
            raise UniverseCoverageError(
                f"{universe_name} has {duplicate_open_rows} overlapping open-ended membership rows"
            )
        cur.execute(sql, {"as_of": as_of, "universe_name": universe_name})
        return list(cur.fetchall())


def point_in_time_universe_snapshot(
    as_of: date,
    *,
    dsn: str | None = None,
    universe_name: str = "NIFTY100",
) -> dict[str, Any]:
    """Resolve the latest complete membership snapshot on or before a date.

    The current estate stores repeated open-ended daily snapshots rather than true
    effective intervals.  This adapter models that fact explicitly and never
    extends coverage before the first stored snapshot.
    """

    with readonly_connection(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT max(effective_from) AS snapshot_date
              FROM nse_intraday.universe_membership
             WHERE universe_name=%s AND effective_from<=%s
            """,
            (universe_name, as_of),
        )
        snapshot_date = cur.fetchone()["snapshot_date"]
        if snapshot_date is None:
            raise UniverseCoverageError(f"{universe_name} has no snapshot on or before {as_of}")
        cur.execute(
            """
            SELECT DISTINCT ON (symbol)
                   symbol, sector_name, weight AS universe_weight, effective_from
              FROM nse_intraday.universe_membership
             WHERE universe_name=%s AND effective_from=%s
             ORDER BY symbol, created_at DESC
            """,
            (universe_name, snapshot_date),
        )
        members = list(cur.fetchall())
    if not members:
        raise UniverseCoverageError(f"{universe_name} snapshot {snapshot_date} is empty")
    return {"universe_name": universe_name, "requested_as_of": as_of, "snapshot_date": snapshot_date, "members": members}


def load_security_minute_bars(
    symbols: Sequence[str],
    start: datetime,
    end: datetime,
    *,
    dsn: str | None = None,
) -> list[MarketBar]:
    if not symbols:
        return []
    sql = """
        SELECT symbol, minute_ts, open_px, high_px, low_px, close_px,
               volume, turnover, trades, vwap,
               COALESCE(source_system, 'nse_intraday') AS source_system,
               ingested_at
        FROM nse_intraday.raw_security_1m
        WHERE symbol = ANY(%(symbols)s)
          AND minute_ts >= %(start)s
          AND minute_ts < %(end)s
        ORDER BY minute_ts, symbol
    """
    bars: list[MarketBar] = []
    with readonly_connection(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, {"symbols": list(symbols), "start": start, "end": end})
        for row in cur:
            bars.append(
                MarketBar(
                    instrument_id=f"NSE_CM:{row['symbol']}",
                    symbol=row["symbol"],
                    event_ts=row["minute_ts"],
                    available_at=max(row["minute_ts"], row["ingested_at"]),
                    interval="1m",
                    open=Decimal(row["open_px"]),
                    high=Decimal(row["high_px"]),
                    low=Decimal(row["low_px"]),
                    close=Decimal(row["close_px"]),
                    volume=int(row["volume"] or 0),
                    turnover=Decimal(row["turnover"]) if row["turnover"] is not None else None,
                    trades=int(row["trades"]) if row["trades"] is not None else None,
                    vwap=Decimal(row["vwap"]) if row["vwap"] is not None else None,
                    source=row["source_system"],
                    source_version="postgres-live",
                )
            )
    return bars


def execute_migrations(paths: Sequence[str], *, dsn: str | None = None) -> None:
    """Apply explicit migrations. Kept separate from normal CLIs to prevent accidental writes."""

    psycopg, _ = _psycopg()
    effective_dsn = dsn or os.getenv("TRADING_DATABASE_URL")
    if not effective_dsn:
        raise ValueError("TRADING_DATABASE_URL is not set")
    with psycopg.connect(effective_dsn, autocommit=False) as conn:
        try:
            with conn.cursor() as cur:
                for path in paths:
                    with open(path, "r", encoding="utf-8") as stream:
                        cur.execute(stream.read())
            conn.commit()
        except Exception:
            conn.rollback()
            raise
