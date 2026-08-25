#!/usr/bin/env python3
"""Generate the additive Rolling Monthly V2 backtest-evidence migration.

The workbook is the supplied, immutable research artefact. This script keeps the
database seed reproducible and deliberately imports summaries rather than the
23,069-row trade fixture into the production application schema.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


FACTOR_VERSION = "2.0.0-research"
SOURCE_AS_OF = "2026-08-07"


def sql_value(value: object) -> str:
    if pd.isna(value):
        return "NULL"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def rows(frame: pd.DataFrame, columns: list[str]) -> str:
    return ",\n".join(
        "  (" + ",".join(sql_value(record[column]) for column in columns) + ")"
        for record in frame.to_dict("records")
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    band = pd.read_excel(args.workbook, sheet_name="Band Performance", header=3).iloc[:16].copy()
    band.columns = ["side", "band", "scope", "trades", "share_pct", "clean_1_pct", "clean_3_pct", "clean_5_pct", "adverse_2_pct", "median_mfe_5d_pct", "median_mae_5d_pct", "t3_s2_mean", "t3_s2_pf", "t5_s2_mean", "t5_s2_pf"]
    band["factor_version"] = FACTOR_VERSION
    band["source_as_of"] = SOURCE_AS_OF
    band["success_count"] = (band["trades"] * band["clean_3_pct"] / 100).round().astype(int)
    band["failure_count"] = band["trades"].astype(int) - band["success_count"]
    band["band"] = band["band"].str.upper()

    raw_indicator = pd.read_excel(args.workbook, sheet_name="Indicator Analysis", header=None)
    condition = raw_indicator.iloc[5:45, :15].copy()
    condition.columns = ["side", "scope", "condition", "pass_n", "fail_n", "pass_clean_3_pct", "fail_clean_3_pct", "uplift_pp", "pass_t3_s2_mean", "fail_t3_s2_mean", "return_uplift", "pass_pf", "fail_pf", "pass_median_mae", "fail_median_mae"]
    condition["factor_version"] = FACTOR_VERSION
    condition["source_as_of"] = SOURCE_AS_OF

    correlation = raw_indicator.iloc[49:99, :11].copy()
    correlation.columns = ["side", "indicator", "sample_size", "spearman_clean_3", "spearman_t3_s2", "median_good", "median_bad", "median_difference", "good_n", "bad_n", "interpretation"]
    correlation["factor_version"] = FACTOR_VERSION
    correlation["source_as_of"] = SOURCE_AS_OF

    yearly = pd.read_excel(args.workbook, sheet_name="Yearly Stability", header=3).iloc[:23, :10].copy()
    yearly.columns = ["side", "band", "year", "trades", "clean_3_pct", "clean_5_pct", "adverse_2_pct", "t5_s2_mean", "t5_s2_pf", "median_mae_5d_pct"]
    yearly["factor_version"] = FACTOR_VERSION
    yearly["source_as_of"] = SOURCE_AS_OF
    yearly["band"] = yearly["band"].str.upper()

    band_columns = ["factor_version", "side", "band", "scope", "trades", "success_count", "failure_count", "share_pct", "clean_1_pct", "clean_3_pct", "clean_5_pct", "adverse_2_pct", "median_mfe_5d_pct", "median_mae_5d_pct", "t3_s2_mean", "t3_s2_pf", "t5_s2_mean", "t5_s2_pf", "source_as_of"]
    condition_columns = ["factor_version", "side", "scope", "condition", "pass_n", "fail_n", "pass_clean_3_pct", "fail_clean_3_pct", "uplift_pp", "pass_t3_s2_mean", "fail_t3_s2_mean", "return_uplift", "pass_pf", "fail_pf", "pass_median_mae", "fail_median_mae", "source_as_of"]
    correlation_columns = ["factor_version", "side", "indicator", "sample_size", "spearman_clean_3", "spearman_t3_s2", "median_good", "median_bad", "median_difference", "good_n", "bad_n", "interpretation", "source_as_of"]
    yearly_columns = ["factor_version", "side", "band", "year", "trades", "clean_3_pct", "clean_5_pct", "adverse_2_pct", "t5_s2_mean", "t5_s2_pf", "median_mae_5d_pct", "source_as_of"]

    template = Path(__file__).with_name("rolling_monthly_backtest_evidence_template.sql").read_text()
    rendered = (template
        .replace("__BAND_ROWS__", rows(band, band_columns))
        .replace("__CONDITION_ROWS__", rows(condition, condition_columns))
        .replace("__CORRELATION_ROWS__", rows(correlation, correlation_columns))
        .replace("__YEARLY_ROWS__", rows(yearly, yearly_columns)))
    args.output.write_text(rendered)


if __name__ == "__main__":
    main()
