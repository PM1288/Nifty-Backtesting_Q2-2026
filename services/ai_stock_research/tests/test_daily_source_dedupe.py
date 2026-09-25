from datetime import date, datetime, timezone

from ai_stock_research.repository import Repository


def _source(strategy: str, symbol: str, candidate_id: str) -> dict:
    return {
        "source_strategy": strategy,
        "trade_date": date(2026, 9, 25),
        "symbol": symbol,
        "source_candidate_id": candidate_id,
        "source_observed_at": datetime(2026, 9, 25, 4, 0, tzinfo=timezone.utc),
    }


def test_oiss_source_is_limited_to_one_candidate_per_stock_day() -> None:
    rows = [
        _source("OISS", "SBIN", "first"),
        _source("OISS", " sbin ", "later-scan"),
        _source("OISS", "INFY", "other-stock"),
    ]

    filtered = Repository._one_oiss_source_per_stock_day(rows)

    assert [row["source_candidate_id"] for row in filtered] == [
        "first",
        "other-stock",
    ]


def test_daily_oiss_gate_does_not_collapse_oiis_source_lineage() -> None:
    rows = [
        _source("OIIS", "SBIN", "oiis-open"),
        _source("OIIS", "SBIN", "oiis-intraday"),
        _source("OISS", "SBIN", "oiss-first"),
        _source("OISS", "SBIN", "oiss-repeat"),
    ]

    filtered = Repository._one_oiss_source_per_stock_day(rows)

    assert [row["source_candidate_id"] for row in filtered] == [
        "oiis-open",
        "oiis-intraday",
        "oiss-first",
    ]
