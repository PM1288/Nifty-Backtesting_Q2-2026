"""
exporter.py
===========
Cleans the accumulated dataset, drops duplicates/invalid/empty rows,
and writes trendlyne_reports_5y.csv + trendlyne_reports_5y.parquet in
the exact column layout requested. Also prints the post-scrape
validation summary.
"""
from __future__ import annotations

from typing import List

import pandas as pd

from config import SETTINGS
from utils import LOGGER

# Exact CSV column order/names requested in the spec, mapped from the
# internal ReportRecord field names.
CSV_COLUMN_MAP = {
    "report_date": "report_date",
    "report_time": "report_time",
    "stock_name": "stock_name",
    "nse_symbol": "symbol",
    "company_name": "company_name",
    "broker_name": "broker",
    "analyst_name": "analyst",
    "recommendation": "recommendation",
    "previous_recommendation": "previous_recommendation",
    "upgrade_downgrade": "upgrade_downgrade",
    "cmp": "cmp",
    "price_at_recommendation": "price_at_recommendation",
    "target_price": "target_price",
    "previous_target": "previous_target",
    "target_change": "target_change",
    "upside_pct": "upside_pct",
    "downside_pct": "downside_pct",
    "sector": "sector",
    "industry": "industry",
    "market_cap": "market_cap",
    "report_title": "report_title",
    "report_type": "report_type",
    "summary": "summary",
    "report_url": "report_url",
    "pdf_url": "pdf_url",
    "scraped_timestamp": "scraped_at",
}

CSV_COLUMN_ORDER = list(CSV_COLUMN_MAP.values())

# Full extended layout (every field from the spec, not just the CSV subset)
FULL_COLUMN_ORDER = [
    "report_id", "report_date", "report_time", "published_date", "scraped_timestamp",
    "stock_name", "nse_symbol", "bse_symbol", "company_name", "sector", "industry", "market_cap",
    "broker_name", "research_house", "analyst_name",
    "recommendation", "previous_recommendation", "upgrade_downgrade", "rating_change",
    "recommendation_strength",
    "cmp", "price_at_recommendation", "target_price", "previous_target", "target_change",
    "upside_pct", "downside_pct", "absolute_gain_potential",
    "report_title", "report_type", "summary", "description", "notes", "report_url", "pdf_url", "tags",
    "exchange", "currency", "isin", "source",
]


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize, drop duplicate/invalid/empty rows."""
    before = len(df)

    # Normalize whitespace-only strings to NaN across all object columns.
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].apply(lambda v: v.strip() if isinstance(v, str) else v)
        df[col] = df[col].replace({"": None, "None": None, "nan": None})

    # An "empty report" = no title AND no stock AND no broker AND no date -
    # i.e. a row that carries no substantive information at all.
    substantive_cols = [c for c in ("report_title", "stock_name", "broker_name", "report_date") if c in df.columns]
    if substantive_cols:
        df = df[df[substantive_cols].notna().any(axis=1)]

    # Invalid rows: no report_date, or a date that failed normalization.
    if "report_date" in df.columns:
        df = df[df["report_date"].notna()]

    # Deduplicate: prefer report_id; fall back to a natural key.
    dedup_keys = [k for k in ("report_id",) if k in df.columns]
    if dedup_keys:
        df = df.drop_duplicates(subset=dedup_keys, keep="last")
    natural_key_cols = [c for c in ("report_date", "stock_name", "broker_name", "report_title") if c in df.columns]
    if natural_key_cols:
        df = df.drop_duplicates(subset=natural_key_cols, keep="last")

    after = len(df)
    LOGGER.info("Cleaning: %d rows -> %d rows (%d removed)", before, after, before - after)
    return df.reset_index(drop=True)


def export(records: List[dict]) -> pd.DataFrame:
    if not records:
        LOGGER.warning("No records to export.")
        return pd.DataFrame(columns=FULL_COLUMN_ORDER)

    df = pd.DataFrame.from_records(records)
    for col in FULL_COLUMN_ORDER:
        if col not in df.columns:
            df[col] = None
    df = df[FULL_COLUMN_ORDER]

    df = clean_dataframe(df)

    # ---- Full extended CSV/Parquet (every requested field) -----------------
    full_csv_path = SETTINGS.csv_path.with_name(SETTINGS.csv_path.stem + "_full.csv")
    df.to_csv(full_csv_path, index=False)
    LOGGER.info("Wrote full extended dataset: %s (%d rows)", full_csv_path, len(df))

    # ---- Spec-exact CSV column subset --------------------------------------
    csv_df = df.rename(columns=CSV_COLUMN_MAP)[CSV_COLUMN_ORDER]
    csv_df.to_csv(SETTINGS.csv_path, index=False)
    LOGGER.info("Wrote CSV: %s (%d rows)", SETTINGS.csv_path, len(csv_df))

    df.to_parquet(SETTINGS.parquet_path, index=False)
    LOGGER.info("Wrote Parquet: %s (%d rows)", SETTINGS.parquet_path, len(df))

    return df


def print_validation_report(df: pd.DataFrame, stats: dict) -> None:
    print("\n" + "=" * 60)
    print("VALIDATION REPORT")
    print("=" * 60)
    print(f"Total reports exported     : {len(df)}")
    if "nse_symbol" in df.columns:
        print(f"Unique stocks               : {df['nse_symbol'].nunique(dropna=True)}")
    if "broker_name" in df.columns:
        print(f"Unique brokers              : {df['broker_name'].nunique(dropna=True)}")
    if "report_date" in df.columns and len(df):
        print(f"Earliest report date        : {df['report_date'].min()}")
        print(f"Latest report date          : {df['report_date'].max()}")
    print(f"Rows exported (CSV)          : {len(df)}")
    missing = df.isna().sum()
    missing = missing[missing > 0].sort_values(ascending=False)
    print("Missing values by column     :")
    if missing.empty:
        print("  (none)")
    else:
        for col, n in missing.items():
            print(f"  {col:<28} {n}")
    dupe_count = stats.get("duplicates_removed", 0)
    print(f"Duplicate count (during crawl): {dupe_count}")
    print(f"Non-NIFTY100 rows skipped     : {stats.get('nifty100_filtered_out', 0)}")
    print("-" * 60)
    print(f"Pages scraped                : {stats.get('pages_scraped', 0)}")
    print(f"Reports scraped (raw)        : {stats.get('reports_scraped', 0)}")
    print(f"Errors                       : {stats.get('errors', 0)}")
    elapsed = stats.get("elapsed_sec", 0)
    print(f"Time taken                   : {elapsed/60:.1f} min ({elapsed:.0f}s)")
    print("=" * 60 + "\n")
