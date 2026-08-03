from datetime import datetime, timezone

import pandas as pd

from nifty100_pipeline.transforms import (
    melt_nse_financial_results,
    melt_yf_financial_statement,
    normalize_universe,
    standardize_nse_corporate_actions,
    standardize_nse_event_calendar,
)


def test_normalize_universe_current_nse_columns() -> None:
    raw = pd.DataFrame(
        {
            "Company Name": ["Reliance Industries Ltd."],
            "Industry": ["Oil Gas"],
            "Symbol": ["RELIANCE"],
            "Series": ["EQ"],
            "ISIN Code": ["INE002A01018"],
        }
    )
    out = normalize_universe(
        raw,
        index_category="BroadMarketIndices",
        index_name="Nifty 100",
        fetched_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
        run_id="run1",
        source="nse_csv",
    )
    assert out.loc[0, "symbol"] == "RELIANCE"
    assert out.loc[0, "yahoo_symbol"] == "RELIANCE.NS"


def test_melt_yf_financial_statement_long_format() -> None:
    raw = pd.DataFrame(
        {
            pd.Timestamp("2025-03-31"): [100.0, 50.0],
            pd.Timestamp("2024-03-31"): [90.0, 45.0],
        },
        index=["Total Revenue", "Net Income"],
    )
    out = melt_yf_financial_statement(
        raw,
        symbol="RELIANCE",
        statement_name="income_statement",
        period_type="annual",
        fetched_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
        run_id="run1",
        source="yfinance_financials",
    )
    assert set(out["metric_name"]) == {"total_revenue", "net_income"}
    assert set(out["period_end"]) == {"2025-03-31", "2024-03-31"}


def test_melt_nse_financial_results_long_format() -> None:
    raw = pd.DataFrame(
        {
            "Symbol": ["RELIANCE"],
            "NameOfTheCompany": ["Reliance Industries Ltd."],
            "ScripCode": ["500325"],
            "financial_statement_period": ["Quarterly"],
            "ReportingQuarter": ["Q4"],
            "DateOfStartOfReportingPeriod": ["01-01-2025"],
            "DateOfEndOfReportingPeriod": ["31-03-2025"],
            "DateOfBoardMeetingWhenFinancialResultsWereApproved": ["18-04-2025"],
            "WhetherResultsAreAuditedOrUnaudited": ["Audited"],
            "NatureOfReportStandaloneConsolidated": ["Standalone"],
            "DescriptionOfPresentationCurrency": ["INR"],
            "RevenueFromOperations": [1000.0],
            "ProfitLossForPeriod": [200.0],
        }
    )
    out = melt_nse_financial_results(
        raw,
        fetched_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
        run_id="run1",
        source="nse_xbrl",
    )
    assert set(out["metric_name"]) == {"revenuefromoperations", "profitlossforperiod"}
    assert set(out["metric_value_num"]) == {1000.0, 200.0}
    assert set(out["period_end_date"]) == {"2025-03-31"}


def test_standardize_nse_corporate_actions() -> None:
    raw = pd.DataFrame(
        {
            "Symbol": ["RELIANCE"],
            "Company Name": ["Reliance Industries Ltd."],
            "Series": ["EQ"],
            "Purpose": ["Dividend"],
            "Face Value": [10],
            "Ex Date": ["15-08-2025"],
            "Record Date": ["16-08-2025"],
        }
    )
    out = standardize_nse_corporate_actions(
        raw,
        fetched_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
        run_id="run1",
        source="nse_api",
    )
    assert out.loc[0, "ex_date"] == "2025-08-15"
    assert out.loc[0, "record_date"] == "2025-08-16"


def test_standardize_nse_event_calendar() -> None:
    raw = pd.DataFrame(
        {
            "Symbol": ["RELIANCE"],
            "Company Name": ["Reliance Industries Ltd."],
            "Purpose": ["Board Meeting"],
            "Details": ["Quarterly Results"],
            "Date": ["18-04-2025"],
            "Broadcast Date Time": ["18-04-2025 18:30:00"],
        }
    )
    out = standardize_nse_event_calendar(
        raw,
        fetched_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
        run_id="run1",
        source="nse_api",
    )
    assert out.loc[0, "event_date"] == "2025-04-18"
    assert out.loc[0, "broadcast_datetime"].startswith("2025-04-18T18:30:00")
