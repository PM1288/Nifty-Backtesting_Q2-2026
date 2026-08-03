from datetime import date

from nifty100_pipeline.utils import normalize_column_name, parse_date_value, slugify


def test_slugify_handles_special_characters() -> None:
    assert slugify("M&M") == "M_M"
    assert slugify("  RELIANCE  ") == "RELIANCE"


def test_normalize_column_name() -> None:
    assert normalize_column_name("Broadcast Date Time") == "broadcast_date_time"
    assert normalize_column_name("Delivery %") == "delivery_pct"


def test_parse_date_value_supports_common_formats() -> None:
    assert parse_date_value("2026-04-03") == date(2026, 4, 3)
    assert parse_date_value("03-Apr-2026") == date(2026, 4, 3)
    assert parse_date_value("03-04-2026") == date(2026, 4, 3)
