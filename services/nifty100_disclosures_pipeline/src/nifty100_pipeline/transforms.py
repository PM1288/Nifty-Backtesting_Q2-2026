from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

from .utils import (
    coerce_numeric,
    normalize_column_name,
    normalize_columns,
    parse_date_value,
    parse_datetime_value,
    pick_first,
    safe_json_dumps,
)

UNIVERSE_COLUMN_CANDIDATES = {
    "company_name": ["company_name", "name_of_company", "name_of_the_company"],
    "industry": ["industry"],
    "symbol": ["symbol"],
    "series": ["series"],
    "isin_code": ["isin_code", "isin", "isin_number"],
}


def normalize_universe(df: pd.DataFrame, index_category: str, index_name: str, fetched_at: datetime, run_id: str, source: str) -> pd.DataFrame:
    normalized = normalize_columns(df)
    data = {
        "run_id": [],
        "fetched_at": [],
        "index_category": [],
        "index_name": [],
        "company_name": [],
        "industry": [],
        "symbol": [],
        "series": [],
        "isin_code": [],
        "yahoo_symbol": [],
        "source": [],
    }
    for _, row in normalized.iterrows():
        row_map = row.to_dict()
        symbol = pick_first(row_map, UNIVERSE_COLUMN_CANDIDATES["symbol"])
        if symbol is None:
            continue
        symbol_str = str(symbol).strip().upper()
        if not symbol_str:
            continue
        company_name = pick_first(row_map, UNIVERSE_COLUMN_CANDIDATES["company_name"], default="")
        industry = pick_first(row_map, UNIVERSE_COLUMN_CANDIDATES["industry"], default="")
        series = pick_first(row_map, UNIVERSE_COLUMN_CANDIDATES["series"], default="EQ")
        isin_code = pick_first(row_map, UNIVERSE_COLUMN_CANDIDATES["isin_code"], default="")
        data["run_id"].append(run_id)
        data["fetched_at"].append(fetched_at.isoformat())
        data["index_category"].append(index_category)
        data["index_name"].append(index_name)
        data["company_name"].append(str(company_name).strip())
        data["industry"].append(str(industry).strip())
        data["symbol"].append(symbol_str)
        data["series"].append(str(series).strip() or "EQ")
        data["isin_code"].append(str(isin_code).strip())
        data["yahoo_symbol"].append(f"{symbol_str}.NS")
        data["source"].append(source)
    out = pd.DataFrame(data)
    if out.empty:
        return out
    out = out.drop_duplicates(subset=["symbol"]).sort_values(["symbol"], kind="stable").reset_index(drop=True)
    return out


NSE_FINANCIAL_DIMENSIONS = {
    "scripcode",
    "symbol",
    "mseisymbol",
    "nameofthecompany",
    "classofsecurity",
    "dateofstartoffinancialyear",
    "dateofendoffinancialyear",
    "dateofboardmeetingwhenfinancialresultswereapproved",
    "dateonwhichpriorintimationofthemeetingforconsideringfinancialresultswereinformedtotheexchange",
    "descriptionofpresentationcurrency",
    "levelofroundingusedinfinancialstatements",
    "reportingquarter",
    "starttimeofboardmeeting",
    "endtimeofboardmeeting",
    "dateofstartofboardmeeting",
    "dateofendofboardmeeting",
    "declarationofunmodifiedopinionorstatementonimpactofauditqualification",
    "iscompanyreportingmultisegmentorsinglesegment",
    "descriptionofsinglesegment",
    "dateofstartofreportingperiod",
    "dateofendofreportingperiod",
    "whetherresultsauditedorunaudited",
    "whetherresultsareauditedorunaudited",
    "natureofreportstandaloneconsolidated",
    "financial_statement_period",
    "broadcastdate",
    "periodended",
    "xbrl",
}


def melt_nse_financial_results(df: pd.DataFrame, fetched_at: datetime, run_id: str, source: str) -> pd.DataFrame:
    columns = [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "scrip_code",
        "financial_statement_period",
        "reporting_quarter",
        "period_start_date",
        "period_end_date",
        "board_meeting_date",
        "audited_status",
        "report_nature",
        "presentation_currency",
        "metric_name",
        "metric_value",
        "metric_value_num",
        "source",
    ]
    if df is None or df.empty:
        return pd.DataFrame(columns=columns)

    normalized = normalize_columns(df)
    metric_columns = [col for col in normalized.columns if col not in NSE_FINANCIAL_DIMENSIONS]
    rows: list[dict[str, Any]] = []
    for _, row in normalized.iterrows():
        row_map = row.to_dict()
        for metric in metric_columns:
            metric_value = row_map.get(metric)
            if metric_value in (None, ""):
                continue
            rows.append(
                {
                    "run_id": run_id,
                    "fetched_at": fetched_at.isoformat(),
                    "symbol": str(row_map.get("symbol", "")).upper(),
                    "company_name": row_map.get("nameofthecompany", ""),
                    "scrip_code": row_map.get("scripcode", ""),
                    "financial_statement_period": row_map.get("financial_statement_period", ""),
                    "reporting_quarter": row_map.get("reportingquarter", ""),
                    "period_start_date": (parse_date_value(row_map.get("dateofstartofreportingperiod")) or None),
                    "period_end_date": (
                        parse_date_value(row_map.get("dateofendofreportingperiod"))
                        or parse_date_value(row_map.get("periodended"))
                        or None
                    ),
                    "board_meeting_date": (
                        parse_date_value(row_map.get("dateofboardmeetingwhenfinancialresultswereapproved"))
                        or parse_date_value(row_map.get("dateofstartofboardmeeting"))
                        or None
                    ),
                    "audited_status": row_map.get("whetherresultsauditedorunaudited", "") or row_map.get("whetherresultsareauditedorunaudited", ""),
                    "report_nature": row_map.get("natureofreportstandaloneconsolidated", ""),
                    "presentation_currency": row_map.get("descriptionofpresentationcurrency", ""),
                    "metric_name": normalize_column_name(metric),
                    "metric_value": str(metric_value),
                    "metric_value_num": coerce_numeric(metric_value),
                    "source": source,
                }
            )
    out = pd.DataFrame(rows)
    if out.empty:
        return pd.DataFrame(columns=columns)
    for col in ["period_start_date", "period_end_date", "board_meeting_date"]:
        out[col] = [v.isoformat() if v else "" for v in out[col]]
    out = out[out["symbol"] != ""]
    out = out.drop_duplicates(
        subset=["symbol", "financial_statement_period", "period_end_date", "report_nature", "metric_name"]
    ).sort_values(["symbol", "period_end_date", "metric_name"], kind="stable")
    return out[columns].reset_index(drop=True)


def melt_yf_financial_statement(
    df: pd.DataFrame,
    symbol: str,
    statement_name: str,
    period_type: str,
    fetched_at: datetime,
    run_id: str,
    source: str,
) -> pd.DataFrame:
    columns = [
        "run_id",
        "fetched_at",
        "symbol",
        "statement_name",
        "period_type",
        "period_end",
        "metric_name",
        "metric_value",
        "metric_value_num",
        "source",
    ]
    if df is None or df.empty:
        return pd.DataFrame(columns=columns)
    working = df.copy()
    if working.index.name is None:
        working.index.name = "metric_name"
    working = working.reset_index()
    if working.columns[0] != "metric_name":
        working = working.rename(columns={working.columns[0]: "metric_name"})
    rename_map = {
        column: column.isoformat() if isinstance(column, pd.Timestamp) else str(column)
        for column in working.columns
        if column != "metric_name"
    }
    working = working.rename(columns=rename_map)
    melted = working.melt(id_vars=["metric_name"], var_name="period_end", value_name="metric_value")
    melted["metric_name"] = melted["metric_name"].astype(str).map(normalize_column_name)
    melted["period_end"] = [parse_date_value(v).isoformat() if parse_date_value(v) else "" for v in melted["period_end"]]
    melted["metric_value_num"] = melted["metric_value"].map(coerce_numeric)
    melted.insert(0, "run_id", run_id)
    melted.insert(1, "fetched_at", fetched_at.isoformat())
    melted.insert(2, "symbol", symbol)
    melted.insert(3, "statement_name", statement_name)
    melted.insert(4, "period_type", period_type)
    melted["metric_value"] = melted["metric_value"].map(lambda v: "" if pd.isna(v) else str(v))
    melted["source"] = source
    melted = melted[columns]
    melted = melted[melted["metric_name"] != ""]
    melted = melted.drop_duplicates(subset=["symbol", "statement_name", "period_type", "period_end", "metric_name"])
    return melted.reset_index(drop=True)


def standardize_nse_corporate_actions(df: pd.DataFrame, fetched_at: datetime, run_id: str, source: str) -> pd.DataFrame:
    columns = [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "series",
        "purpose",
        "face_value",
        "ex_date",
        "record_date",
        "book_closure_start_date",
        "book_closure_end_date",
        "source",
        "raw_json",
    ]
    if df is None or df.empty:
        return pd.DataFrame(columns=columns)
    working = normalize_columns(df)
    rows: list[dict[str, Any]] = []
    for _, row in working.iterrows():
        row_map = row.to_dict()
        ex_date = parse_date_value(pick_first(row_map, ["ex_date", "exdate"], default=None))
        record_date = parse_date_value(pick_first(row_map, ["record_date", "recorddate"], default=None))
        bcs = parse_date_value(pick_first(row_map, ["book_closure_start_date", "bookclosurestartdate"], default=None))
        bce = parse_date_value(pick_first(row_map, ["book_closure_end_date", "bookclosureenddate"], default=None))
        rows.append(
            {
                "run_id": run_id,
                "fetched_at": fetched_at.isoformat(),
                "symbol": str(pick_first(row_map, ["symbol"], default="")).upper(),
                "company_name": pick_first(row_map, ["company_name", "company"], default=""),
                "series": pick_first(row_map, ["series"], default=""),
                "purpose": pick_first(row_map, ["purpose"], default=""),
                "face_value": coerce_numeric(pick_first(row_map, ["face_value"], default=None)),
                "ex_date": ex_date.isoformat() if ex_date else "",
                "record_date": record_date.isoformat() if record_date else "",
                "book_closure_start_date": bcs.isoformat() if bcs else "",
                "book_closure_end_date": bce.isoformat() if bce else "",
                "source": source,
                "raw_json": safe_json_dumps(row_map),
            }
        )
    out = pd.DataFrame(rows)
    out = out.dropna(subset=["symbol"])
    out = out[out["symbol"] != ""]
    out = out.drop_duplicates(subset=["symbol", "purpose", "ex_date", "record_date"])
    return out[columns].reset_index(drop=True)


def standardize_nse_event_calendar(df: pd.DataFrame, fetched_at: datetime, run_id: str, source: str) -> pd.DataFrame:
    columns = [
        "run_id",
        "fetched_at",
        "symbol",
        "company_name",
        "purpose",
        "details",
        "event_date",
        "attachment",
        "broadcast_datetime",
        "source",
        "raw_json",
    ]
    if df is None or df.empty:
        return pd.DataFrame(columns=columns)
    working = normalize_columns(df)
    rows: list[dict[str, Any]] = []
    for _, row in working.iterrows():
        row_map = row.to_dict()
        event_date_value = pick_first(row_map, ["date", "meeting_date", "meetingdate"], default=None)
        broadcast_dt_value = pick_first(row_map, ["broadcast_date_time", "broadcastdatetime", "broadcast_date"], default=None)
        event_date = parse_date_value(event_date_value)
        broadcast_dt = parse_datetime_value(broadcast_dt_value)
        rows.append(
            {
                "run_id": run_id,
                "fetched_at": fetched_at.isoformat(),
                "symbol": str(pick_first(row_map, ["symbol"], default="")).upper(),
                "company_name": pick_first(row_map, ["company_name", "company"], default=""),
                "purpose": pick_first(row_map, ["purpose"], default=""),
                "details": pick_first(row_map, ["details", "detail"], default=""),
                "event_date": event_date.isoformat() if event_date else "",
                "attachment": pick_first(row_map, ["attachment"], default=""),
                "broadcast_datetime": broadcast_dt.isoformat() if broadcast_dt else "",
                "source": source,
                "raw_json": safe_json_dumps(row_map),
            }
        )
    out = pd.DataFrame(rows)
    out = out.dropna(subset=["symbol"])
    out = out[out["symbol"] != ""]
    out = out.drop_duplicates(subset=["symbol", "purpose", "event_date"])
    return out[columns].reset_index(drop=True)
