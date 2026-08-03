from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import psycopg
from psycopg import sql


CREATE_TABLES_SQL = """
CREATE SCHEMA IF NOT EXISTS {schema};

CREATE TABLE IF NOT EXISTS {schema}.cdsl_fii_daily_investment (
    market_date date NOT NULL,
    instrument_category text NOT NULL,
    investment_route text NOT NULL,
    gross_purchases_rs_crore numeric(20, 4),
    gross_sales_rs_crore numeric(20, 4),
    net_investment_rs_crore numeric(20, 4),
    net_investment_usd_million numeric(20, 4),
    usd_inr_conversion numeric(20, 4),
    source_url text NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (market_date, instrument_category, investment_route)
);

CREATE TABLE IF NOT EXISTS {schema}.cdsl_fii_daily_derivatives (
    market_date date NOT NULL,
    derivative_product text NOT NULL,
    buy_contracts bigint,
    buy_amount_crore numeric(20, 4),
    sell_contracts bigint,
    sell_amount_crore numeric(20, 4),
    open_interest_contracts bigint,
    open_interest_amount_crore numeric(20, 4),
    source_url text NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (market_date, derivative_product)
);
"""


def connect(database_url: str) -> psycopg.Connection[Any]:
    return psycopg.connect(database_url)


def ensure_tables(conn: psycopg.Connection[Any], schema_name: str) -> None:
    statement = CREATE_TABLES_SQL.format(schema=schema_name)
    with conn.cursor() as cur:
        cur.execute(statement)
    conn.commit()


def target_date_exists(conn: psycopg.Connection[Any], schema_name: str, target_date: date) -> bool:
    query = sql.SQL(
        """
        SELECT
            EXISTS(SELECT 1 FROM {schema}.cdsl_fii_daily_investment WHERE market_date = %s) AS investment_exists,
            EXISTS(SELECT 1 FROM {schema}.cdsl_fii_daily_derivatives WHERE market_date = %s) AS derivatives_exists
        """
    ).format(schema=sql.Identifier(schema_name))
    with conn.cursor() as cur:
        cur.execute(query, (target_date, target_date))
        investment_exists, derivatives_exists = cur.fetchone()
    return bool(investment_exists and derivatives_exists)


def _normalize_numeric(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"nan", "none"}:
        return None
    return Decimal(text)


def _normalize_bigint(value: Any) -> int | None:
    numeric = _normalize_numeric(value)
    if numeric is None:
        return None
    return int(numeric)


def upsert_investment_rows(
    conn: psycopg.Connection[Any],
    schema_name: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    query = sql.SQL(
        """
        INSERT INTO {schema}.cdsl_fii_daily_investment (
            market_date,
            instrument_category,
            investment_route,
            gross_purchases_rs_crore,
            gross_sales_rs_crore,
            net_investment_rs_crore,
            net_investment_usd_million,
            usd_inr_conversion,
            source_url
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (market_date, instrument_category, investment_route) DO UPDATE
        SET gross_purchases_rs_crore = EXCLUDED.gross_purchases_rs_crore,
            gross_sales_rs_crore = EXCLUDED.gross_sales_rs_crore,
            net_investment_rs_crore = EXCLUDED.net_investment_rs_crore,
            net_investment_usd_million = EXCLUDED.net_investment_usd_million,
            usd_inr_conversion = EXCLUDED.usd_inr_conversion,
            source_url = EXCLUDED.source_url,
            ingested_at = now()
        """
    ).format(schema=sql.Identifier(schema_name))
    payload = [
        (
            row["market_date"],
            row["instrument_category"],
            row["investment_route"],
            _normalize_numeric(row["gross_purchases_rs_crore"]),
            _normalize_numeric(row["gross_sales_rs_crore"]),
            _normalize_numeric(row["net_investment_rs_crore"]),
            _normalize_numeric(row["net_investment_usd_million"]),
            _normalize_numeric(row["usd_inr_conversion"]),
            row["source_url"],
        )
        for row in rows
    ]
    with conn.cursor() as cur:
        cur.executemany(query, payload)
    conn.commit()
    return len(payload)


def upsert_derivative_rows(
    conn: psycopg.Connection[Any],
    schema_name: str,
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0
    query = sql.SQL(
        """
        INSERT INTO {schema}.cdsl_fii_daily_derivatives (
            market_date,
            derivative_product,
            buy_contracts,
            buy_amount_crore,
            sell_contracts,
            sell_amount_crore,
            open_interest_contracts,
            open_interest_amount_crore,
            source_url
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (market_date, derivative_product) DO UPDATE
        SET buy_contracts = EXCLUDED.buy_contracts,
            buy_amount_crore = EXCLUDED.buy_amount_crore,
            sell_contracts = EXCLUDED.sell_contracts,
            sell_amount_crore = EXCLUDED.sell_amount_crore,
            open_interest_contracts = EXCLUDED.open_interest_contracts,
            open_interest_amount_crore = EXCLUDED.open_interest_amount_crore,
            source_url = EXCLUDED.source_url,
            ingested_at = now()
        """
    ).format(schema=sql.Identifier(schema_name))
    payload = [
        (
            row["market_date"],
            row["derivative_product"],
            _normalize_bigint(row["buy_contracts"]),
            _normalize_numeric(row["buy_amount_crore"]),
            _normalize_bigint(row["sell_contracts"]),
            _normalize_numeric(row["sell_amount_crore"]),
            _normalize_bigint(row["open_interest_contracts"]),
            _normalize_numeric(row["open_interest_amount_crore"]),
            row["source_url"],
        )
        for row in rows
    ]
    with conn.cursor() as cur:
        cur.executemany(query, payload)
    conn.commit()
    return len(payload)
