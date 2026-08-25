from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

import psycopg
import xlsxwriter

from .absolute_month import STRATEGY_VERSION
from .absolute_first_session import STRATEGY_VERSION as FIRST_SESSION_STRATEGY_VERSION


DETAIL_COLUMNS = [
    "evaluation_month", "symbol", "company_name", "sector", "signal_date", "entry_date", "entry_price",
    "evaluation_end_date", "evaluation_status", "observed_post_entry_sessions", "month_two_open",
    "month_two_close", "month_one_open", "month_one_close", "current_week_open", "current_week_close_asof",
    "previous_week_open", "previous_week_close", "previous_day_open", "previous_day_close", "signal_day_open",
    "signal_day_close", "path_end_price", "end_return_pct", "max_profit_price", "max_profit_pct",
    "max_profit_date", "max_drawdown_price", "max_drawdown_pct", "max_drawdown_date", "profit_per_share",
    "max_profit_per_share", "max_drawdown_per_share", "conditions", "source_provenance", "data_quality",
]


def _value(value: Any) -> Any:
    return json.dumps(value, separators=(",", ":"), default=str) if isinstance(value, (dict, list)) else value


def export_absolute_months(database_url: str, output_dir: str) -> dict[str, Any]:
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(database_url, row_factory=psycopg.rows.dict_row) as conn:
        details = conn.execute(
            "SELECT * FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=%s ORDER BY evaluation_month,signal_date,symbol",
            (STRATEGY_VERSION,),
        ).fetchall()
        monthly = conn.execute("""
          SELECT evaluation_month,count(*)::int opportunities,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int eligible_opportunities,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int winners,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct<0)::int losers,
            avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_end_return_pct,
            sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') sum_end_return_pct,
            avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_profit_pct,
            max(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') highest_max_profit_pct,
            avg(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_drawdown_pct,
            min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') worst_max_drawdown_pct,
            sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*100000/100 hypothetical_net_pnl
          FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=%s
          GROUP BY evaluation_month ORDER BY evaluation_month
        """, (STRATEGY_VERSION,)).fetchall()
        yearly = conn.execute("""
          SELECT extract(year FROM evaluation_month)::int AS "year",count(*)::int opportunities,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE')::int eligible_opportunities,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int winners,
            count(*) FILTER (WHERE evaluation_status<>'INCOMPLETE' AND end_return_pct<0)::int losers,
            avg(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_end_return_pct,
            sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') sum_end_return_pct,
            avg(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_profit_pct,
            max(max_profit_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') highest_max_profit_pct,
            avg(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') average_max_drawdown_pct,
            min(max_drawdown_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE') worst_max_drawdown_pct,
            sum(end_return_pct) FILTER (WHERE evaluation_status<>'INCOMPLETE')*100000/100 hypothetical_net_pnl
          FROM rolling_monthly.absolute_month_candidate WHERE strategy_version=%s
          GROUP BY extract(year FROM evaluation_month) ORDER BY year
        """, (STRATEGY_VERSION,)).fetchall()
        run = conn.execute(
            "SELECT methodology,quality_metrics,min(evaluation_month) first_month,max(evaluation_month) last_month,max(source_end_date) source_end FROM rolling_monthly.absolute_month_run WHERE strategy_version=%s GROUP BY methodology,quality_metrics ORDER BY last_month DESC LIMIT 1",
            (STRATEGY_VERSION,),
        ).fetchone()
    csv_path = target / "ABSOLUTE_MONTHLY_CLOSURE_3Y_TRADES.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=DETAIL_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({key: _value(row.get(key)) for key in DETAIL_COLUMNS} for row in details)
    xlsx_path = target / "ABSOLUTE_MONTHLY_CLOSURE_3Y_ANALYSIS.xlsx"
    workbook = xlsxwriter.Workbook(xlsx_path)
    header = workbook.add_format({"bold": True, "bg_color": "#DCE6F1", "border": 1})
    percent = workbook.add_format({"num_format": "0.00%"})
    money = workbook.add_format({"num_format": "₹#,##0.00;[Red]-₹#,##0.00"})
    for sheet_name, rows in (("Opportunities", details), ("Monthly Summary", monthly), ("Yearly Summary", yearly)):
        worksheet = workbook.add_worksheet(sheet_name)
        columns = DETAIL_COLUMNS if sheet_name == "Opportunities" else list(rows[0].keys()) if rows else []
        for column_index, column in enumerate(columns):
            worksheet.write(0, column_index, column, header)
        for row_index, row in enumerate(rows, 1):
            for column_index, column in enumerate(columns):
                value = _value(row.get(column))
                cell_format = percent if column.endswith("_pct") else money if "pnl" in column or "per_share" in column or column.endswith("_price") else None
                if cell_format is percent and value is not None:
                    value = float(value) / 100
                worksheet.write(row_index, column_index, value, cell_format)
        worksheet.freeze_panes(1, 0)
        worksheet.autofilter(0, 0, max(0, len(rows)), max(0, len(columns) - 1))
        worksheet.set_column(0, max(0, len(columns) - 1), 18)
    method = workbook.add_worksheet("Methodology")
    method.write_row(0, 0, ["Field", "Value"], header)
    method_rows = {
        "strategy_version": STRATEGY_VERSION,
        "methodology": run.get("methodology") if run else None,
        "quality_metrics": run.get("quality_metrics") if run else None,
        "first_month": run.get("first_month") if run else None,
        "last_month": run.get("last_month") if run else None,
        "source_end": run.get("source_end") if run else None,
        "research_notional_per_opportunity": 100000,
        "critical_path_rule": "Signal-day high/low excluded; post-entry MFE/MAE starts next session.",
        "incomplete_summary_rule": "INCOMPLETE paths remain in Opportunities but are excluded from performance summaries.",
    }
    for index, (key, value) in enumerate(method_rows.items(), 1):
        method.write(index, 0, key)
        method.write(index, 1, _value(value))
    method.set_column(0, 0, 34)
    method.set_column(1, 1, 110)
    workbook.close()
    return {"xlsx": str(xlsx_path), "csv": str(csv_path), "trades": len(details), "months": len(monthly), "years": len(yearly)}


FIRST_SESSION_DETAIL_COLUMNS = [
    "evaluation_month", "symbol", "company_name", "sector", "gap_threshold_pct", "first_session_date",
    "previous_session_date", "previous_close", "first_session_open", "opening_gap_pct", "entry_mode",
    "entry_status", "entry_date", "entry_price", "evaluation_end_date", "evaluation_status",
    "month_two_open", "month_two_close", "month_one_open", "month_one_close", "completed_week_open",
    "completed_week_close", "prior_week_open", "prior_week_close", "path_end_price", "end_return_pct",
    "profit_per_share", "max_profit_price", "max_profit_pct", "max_profit_per_share", "max_profit_date",
    "max_drawdown_price", "max_drawdown_pct", "max_drawdown_per_share", "max_drawdown_date",
    "quantity_10000", "invested_10000", "end_pnl_10000", "max_profit_10000", "max_drawdown_10000",
    "conditions", "source_provenance", "data_quality",
]


def export_absolute_first_sessions(database_url: str, output_dir: str) -> dict[str, Any]:
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    with psycopg.connect(database_url, row_factory=psycopg.rows.dict_row) as conn:
        details = conn.execute(
            "SELECT * FROM rolling_monthly.absolute_first_session_candidate WHERE strategy_version=%s ORDER BY evaluation_month,gap_threshold_pct,symbol",
            (FIRST_SESSION_STRATEGY_VERSION,),
        ).fetchall()
        summary_sql = """
          SELECT {period},gap_threshold_pct,count(*)::int scenarios,
            count(*) FILTER (WHERE entry_status='ENTERED')::int entered,
            count(*) FILTER (WHERE entry_status='NOT_ENTERED_GAP_UNFILLED')::int unfilled,
            count(*) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE' AND end_return_pct>0)::int winners,
            avg(end_return_pct) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') average_end_return_pct,
            sum(profit_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_end_pnl,
            sum(max_profit_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_max_profit,
            sum(max_drawdown_per_share) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') one_share_max_drawdown,
            sum(invested_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') invested_10000,
            sum(end_pnl_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') end_pnl_10000,
            sum(max_profit_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') max_profit_10000,
            sum(max_drawdown_10000) FILTER (WHERE entry_status='ENTERED' AND evaluation_status<>'INCOMPLETE') max_drawdown_10000
          FROM rolling_monthly.absolute_first_session_candidate WHERE strategy_version=%s
          GROUP BY {group} ORDER BY {order},gap_threshold_pct
        """
        monthly = conn.execute(summary_sql.format(period="evaluation_month", group="evaluation_month,gap_threshold_pct", order="evaluation_month"), (FIRST_SESSION_STRATEGY_VERSION,)).fetchall()
        yearly = conn.execute(summary_sql.format(period='extract(year FROM evaluation_month)::int AS "year"', group="extract(year FROM evaluation_month),gap_threshold_pct", order='"year"'), (FIRST_SESSION_STRATEGY_VERSION,)).fetchall()
        run = conn.execute(
            "SELECT methodology,quality_metrics,min(evaluation_month) first_month,max(evaluation_month) last_month,max(source_end_date) source_end FROM rolling_monthly.absolute_first_session_run WHERE strategy_version=%s GROUP BY methodology,quality_metrics ORDER BY last_month DESC LIMIT 1",
            (FIRST_SESSION_STRATEGY_VERSION,),
        ).fetchone()
    csv_path = target / "ABSOLUTE_MONTHLY_FIRST_SESSION_GAP_3Y_TRADES.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIRST_SESSION_DETAIL_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({key: _value(row.get(key)) for key in FIRST_SESSION_DETAIL_COLUMNS} for row in details)
    xlsx_path = target / "ABSOLUTE_MONTHLY_FIRST_SESSION_GAP_3Y_ANALYSIS.xlsx"
    workbook = xlsxwriter.Workbook(xlsx_path)
    header = workbook.add_format({"bold": True, "bg_color": "#DCE6F1", "border": 1})
    percent = workbook.add_format({"num_format": "0.00%"})
    money = workbook.add_format({"num_format": "₹#,##0.00;[Red]-₹#,##0.00"})
    for sheet_name, rows in (("Scenarios", details), ("Monthly Summary", monthly), ("Yearly Summary", yearly)):
        worksheet = workbook.add_worksheet(sheet_name)
        columns = FIRST_SESSION_DETAIL_COLUMNS if sheet_name == "Scenarios" else list(rows[0].keys()) if rows else []
        for column_index, column in enumerate(columns):
            worksheet.write(0, column_index, column, header)
        for row_index, row in enumerate(rows, 1):
            for column_index, column in enumerate(columns):
                value = _value(row.get(column))
                cell_format = percent if column.endswith("_pct") else money if any(token in column for token in ("pnl", "profit", "drawdown", "invested", "price", "close", "open")) else None
                if cell_format is percent and value is not None:
                    value = float(value) / 100
                worksheet.write(row_index, column_index, value, cell_format)
        worksheet.freeze_panes(1, 0)
        if columns:
            worksheet.autofilter(0, 0, max(0, len(rows)), len(columns) - 1)
            worksheet.set_column(0, len(columns) - 1, 18)
    method = workbook.add_worksheet("Methodology")
    method.write_row(0, 0, ["Field", "Value"], header)
    method_rows = {
        "strategy_version": FIRST_SESSION_STRATEGY_VERSION,
        "methodology": run.get("methodology") if run else None,
        "quality_metrics": run.get("quality_metrics") if run else None,
        "first_month": run.get("first_month") if run else None,
        "last_month": run.get("last_month") if run else None,
        "source_end": run.get("source_end") if run else None,
        "scenario_notional": 10000,
        "gap_fill_rule": "Significant gap-up waits for first same-month touch of prior session close; unfilled gaps are not trades.",
        "point_in_time_rule": "Eligibility uses only completed M-2, M-1, W-2 and W-1 candles before first-session open.",
    }
    for index, (key, value) in enumerate(method_rows.items(), 1):
        method.write(index, 0, key)
        method.write(index, 1, _value(value))
    method.set_column(0, 0, 34)
    method.set_column(1, 1, 110)
    workbook.close()
    return {"xlsx": str(xlsx_path), "csv": str(csv_path), "scenarios": len(details), "months": len(monthly), "years": len(yearly)}
