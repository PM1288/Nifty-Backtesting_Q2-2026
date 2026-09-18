"""Bounded regular-session fallback. Never extrapolate an unverified year.

Source: https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf
Special sessions require the existing explicit exchange calendar.
"""
from datetime import date

HOLIDAYS_2026 = frozenset("01-26 03-03 03-26 03-31 04-03 04-14 05-01 05-28 06-26 09-14 10-02 10-20 11-10 11-24 12-25".split())

def regular_session(day: date) -> bool | None:
    if day.year != 2026 or day == date(2026, 11, 8):
        return None  # Muhurat timings require the separate circular.
    return day.weekday() < 5 and day.strftime("%m-%d") not in HOLIDAYS_2026
