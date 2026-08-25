#!/usr/bin/env python3
"""Generate month-year stability evidence from the supplied scored-trade fixture."""

from __future__ import annotations

import argparse
import csv
import statistics
from collections import defaultdict
from pathlib import Path


FACTOR_VERSION = "2.0.0-research"
SOURCE_AS_OF = "2026-08-07"


def number(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def truth(value: str) -> bool:
    return value.strip().lower() == "true"


def pct(count: int, total: int) -> float | None:
    return 100 * count / total if total else None


def sql(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return str(value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    grouped: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    with args.fixture.open(newline="") as source:
        for row in csv.DictReader(source):
            band = row["quality_band"].upper()
            if band not in {"HIGH", "MEDIUM"}:
                continue
            grouped[(row["signal_date"][:7] + "-01", row["side"], band)].append(row)

    values: list[tuple[object, ...]] = []
    for (month, side, band), rows in sorted(grouped.items()):
        total = len(rows)
        clean3 = sum(truth(row["clean3_5d"]) for row in rows)
        clean5 = sum(truth(row["clean5_5d"]) for row in rows)
        adverse = sum((number(row["adverse_from_entry_5d_pct"]) or 0) >= 2 for row in rows)
        outcomes = [number(row["sim_t5_s2_5d_pct"]) for row in rows]
        outcomes = [value for value in outcomes if value is not None]
        positive = sum(value for value in outcomes if value > 0)
        negative = abs(sum(value for value in outcomes if value < 0))
        mae = [number(row["adverse_from_entry_5d_pct"]) for row in rows]
        mae = [value for value in mae if value is not None]
        values.append((
            FACTOR_VERSION, month, side, band, total, clean3, total - clean3,
            pct(clean3, total), pct(clean5, total), pct(adverse, total),
            statistics.fmean(outcomes) if outcomes else None,
            positive / negative if negative else None,
            statistics.median(mae) if mae else None, SOURCE_AS_OF,
        ))

    rows_sql = ",\n".join("  (" + ",".join(sql(value) for value in row) + ")" for row in values)
    args.output.write_text(f"""BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.backtest_monthly_summary (
  factor_version text NOT NULL,
  signal_month date NOT NULL CHECK (signal_month = date_trunc('month', signal_month)::date),
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  quality_band text NOT NULL CHECK (quality_band IN ('HIGH','MEDIUM')),
  trades integer NOT NULL,
  success_count integer NOT NULL,
  failure_count integer NOT NULL,
  clean_3_pct numeric,
  clean_5_pct numeric,
  adverse_2_pct numeric,
  t5_s2_mean numeric,
  t5_s2_profit_factor numeric,
  median_mae_5d_pct numeric,
  source_as_of date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_version,signal_month,side,quality_band)
);

INSERT INTO rolling_monthly.backtest_monthly_summary
  (factor_version,signal_month,side,quality_band,trades,success_count,failure_count,
   clean_3_pct,clean_5_pct,adverse_2_pct,t5_s2_mean,t5_s2_profit_factor,
   median_mae_5d_pct,source_as_of)
VALUES
{rows_sql}
ON CONFLICT (factor_version,signal_month,side,quality_band) DO UPDATE SET
  trades=excluded.trades,success_count=excluded.success_count,failure_count=excluded.failure_count,
  clean_3_pct=excluded.clean_3_pct,clean_5_pct=excluded.clean_5_pct,
  adverse_2_pct=excluded.adverse_2_pct,t5_s2_mean=excluded.t5_s2_mean,
  t5_s2_profit_factor=excluded.t5_s2_profit_factor,
  median_mae_5d_pct=excluded.median_mae_5d_pct,source_as_of=excluded.source_as_of;

COMMIT;
""")
    print(f"generated {len(values)} month-side-band summaries")


if __name__ == "__main__":
    main()
