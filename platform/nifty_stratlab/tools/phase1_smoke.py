from __future__ import annotations

import json
import tempfile
from datetime import date
from pathlib import Path

from nifty_stratlab.calendar.config import load_calendar_config
from nifty_stratlab.calendar.service import resolve_expiry
from nifty_stratlab.data.csv_profiler import profile_csv


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    calendar, rules = load_calendar_config(repo / "config/market_rules.example.yml")
    assert calendar.expected_bar_count(date(2026, 8, 3), "NSE_FO") == 385
    with tempfile.TemporaryDirectory() as temp:
        sample = Path(temp) / "sample.csv"
        sample.write_text(
            "date,open,high,low,close,volume\n"
            "2026-08-04 09:15,100,101,99,100.5,1000\n"
            "2026-08-04 09:16,100.5,102,100,101.5,1200\n",
            encoding="utf-8",
        )
        profile = profile_csv(sample, trading_calendar=calendar)
        assert profile.status == "WARN" or profile.status == "PASS"
    payload = {
        "phase": 1,
        "status": "PASS",
        "fo_bar_count_after_2026_08_03": 385,
        "expiry_example": resolve_expiry(date(2026, 8, 4), rules[0], calendar).isoformat(),
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
