"""
models.py
=========
The canonical record schema for a scraped research-report row.

Every field the spec asked for is represented. Fields that Trendlyne
does not expose on the public, unauthenticated listing page are kept
as None/NaN rather than invented - see README.md "Field coverage" table
for exactly which fields are real vs. structurally-present-but-null.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, asdict, fields
from datetime import datetime
from typing import Optional


@dataclass
class ReportRecord:
    # ---- General ----------------------------------------------------
    report_id: Optional[str] = None            # numeric id parsed from /posts/<id>/... or pdf/<id>/
    report_date: Optional[str] = None           # normalized YYYY-MM-DD
    report_time: Optional[str] = None           # not exposed publicly -> None
    published_date: Optional[str] = None        # same as report_date on this listing
    scraped_timestamp: Optional[str] = None     # ISO8601, set at scrape time

    # ---- Stock --------------------------------------------------------
    stock_name: Optional[str] = None
    nse_symbol: Optional[str] = None            # parsed from stock URL slug
    bse_symbol: Optional[str] = None            # not exposed publicly -> None (see enrichment)
    company_name: Optional[str] = None          # best-effort = stock_name unless enriched
    sector: Optional[str] = None                # only via optional enrichment pass
    industry: Optional[str] = None              # only via optional enrichment pass
    market_cap: Optional[str] = None            # only via optional enrichment pass

    # ---- Broker ---------------------------------------------------------
    broker_name: Optional[str] = None
    research_house: Optional[str] = None        # = broker_name on this site (no separate field)
    analyst_name: Optional[str] = None          # not exposed publicly -> None

    # ---- Recommendation --------------------------------------------------
    recommendation: Optional[str] = None        # e.g. Buy/Hold/Sell when present
    previous_recommendation: Optional[str] = None  # not derivable from a single listing page
    upgrade_downgrade: Optional[str] = None     # "upgrade" / "downgrade" flag Trendlyne shows inline
    rating_change: Optional[bool] = None        # True if the "Reco changed" marker is present
    recommendation_strength: Optional[str] = None  # not exposed publicly -> None

    # ---- Price information ------------------------------------------------
    cmp: Optional[float] = None                 # "LTP" column
    price_at_recommendation: Optional[float] = None
    target_price: Optional[float] = None
    previous_target: Optional[float] = None     # not derivable from a single listing page
    target_change: Optional[bool] = None        # True if the "Target changed" marker is present
    upside_pct: Optional[float] = None
    downside_pct: Optional[float] = None        # derived: negative upside, else None
    absolute_gain_potential: Optional[float] = None  # derived: target_price - price_at_recommendation

    # ---- Report -----------------------------------------------------------
    report_title: Optional[str] = None
    report_type: Optional[str] = None
    summary: Optional[str] = None
    description: Optional[str] = None           # = summary (site doesn't separate these)
    notes: Optional[str] = None                 # not exposed publicly -> None
    report_url: Optional[str] = None
    pdf_url: Optional[str] = None               # raw href; resolves to a login wall if not authenticated
    tags: Optional[str] = None                  # not exposed publicly -> None

    # ---- Additional ---------------------------------------------------------
    exchange: Optional[str] = None
    currency: Optional[str] = None
    isin: Optional[str] = None                  # not exposed publicly -> None
    source: Optional[str] = None

    def as_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def field_names() -> list:
        return [f.name for f in fields(ReportRecord)]


def synthetic_report_id(record: dict) -> str:
    """Stable composite id for a record that has no parsed numeric
    report_id, keyed on (report_date, stock_name, broker_name,
    report_title). Deterministic across processes because it is a real
    hash, so re-processing the same natural key re-upserts rather than
    minting a brand-new id every run."""
    key = "|".join(
        str(record.get(k, "") or "") for k in
        ("report_date", "stock_name", "broker_name", "report_title")
    )
    digest = hashlib.sha1(key.encode("utf-8", "replace")).hexdigest()[:16]
    return f"synthetic:{digest}"
