"""
database.py
===========
SQLite-backed storage for scraped reports. Used for:
  - durable persistence as pages are scraped (so a crash doesn't lose data)
  - dedup by report_id (UPSERT)
  - a stable source to export CSV/Parquet from at the end of a run
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable, List

from models import ReportRecord, synthetic_report_id
from utils import LOGGER

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    report_date TEXT,
    report_time TEXT,
    published_date TEXT,
    scraped_timestamp TEXT,
    stock_name TEXT,
    nse_symbol TEXT,
    bse_symbol TEXT,
    company_name TEXT,
    sector TEXT,
    industry TEXT,
    market_cap TEXT,
    broker_name TEXT,
    research_house TEXT,
    analyst_name TEXT,
    recommendation TEXT,
    previous_recommendation TEXT,
    upgrade_downgrade TEXT,
    rating_change INTEGER,
    recommendation_strength TEXT,
    cmp REAL,
    price_at_recommendation REAL,
    target_price REAL,
    previous_target REAL,
    target_change INTEGER,
    upside_pct REAL,
    downside_pct REAL,
    absolute_gain_potential REAL,
    report_title TEXT,
    report_type TEXT,
    summary TEXT,
    description TEXT,
    notes TEXT,
    report_url TEXT,
    pdf_url TEXT,
    tags TEXT,
    exchange TEXT,
    currency TEXT,
    isin TEXT,
    source TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_symbol ON reports(nse_symbol);
CREATE INDEX IF NOT EXISTS idx_reports_broker ON reports(broker_name);
"""

_COLUMNS = ReportRecord.field_names()


class ReportDatabase:
    def __init__(self, path: Path):
        self.path = path
        self.conn = sqlite3.connect(str(path))
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def upsert_many(self, records: Iterable[ReportRecord]) -> int:
        rows = []
        for r in records:
            d = r.as_dict()
            if not d.get("report_id"):
                # Fall back to a composite synthetic id so we never drop a
                # row for lack of a parsed report_id, while still allowing
                # dedup for genuine duplicates encountered again later.
                d["report_id"] = synthetic_report_id(d)
            d["rating_change"] = 1 if d.get("rating_change") else (0 if d.get("rating_change") is not None else None)
            d["target_change"] = 1 if d.get("target_change") else (0 if d.get("target_change") is not None else None)
            rows.append(tuple(d.get(c) for c in _COLUMNS))

        placeholders = ", ".join("?" for _ in _COLUMNS)
        col_list = ", ".join(_COLUMNS)
        update_clause = ", ".join(f"{c}=excluded.{c}" for c in _COLUMNS if c != "report_id")
        sql = (
            f"INSERT INTO reports ({col_list}) VALUES ({placeholders}) "
            f"ON CONFLICT(report_id) DO UPDATE SET {update_clause}"
        )
        with self.conn:
            self.conn.executemany(sql, rows)
        return len(rows)

    def count(self) -> int:
        cur = self.conn.execute("SELECT COUNT(*) FROM reports")
        return cur.fetchone()[0]

    def fetch_all_as_records(self) -> List[dict]:
        cur = self.conn.execute(f"SELECT {', '.join(_COLUMNS)} FROM reports")
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def close(self):
        self.conn.close()
