from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from papertrade.monitor import Monitor


class Result:
    def __init__(self, value):
        self.value = value

    def fetchall(self):
        return self.value

    def fetchone(self):
        return self.value


class Database:
    def __init__(self, bar):
        self.bar = bar
        self.calls = []

    @contextmanager
    def connection(self):
        yield self

    def execute(self, query, params=None):
        text = str(query)
        self.calls.append((text, params))
        if "SELECT l.trade_leg_id" in text:
            return Result([dict(trade_leg_id="leg", trade_group_id="group", side="SELL",
                remaining_quantity=Decimal(10), average_entry_price=Decimal(100),
                opened_at=datetime(2026, 8, 11, tzinfo=UTC), last_mark_at=None,
                exchange="NSE", instrument_token="token")])
        if "ORDER BY ts DESC" in text:
            return Result(self.bar)
        if "UPDATE paper_trading.positions" in text:
            return Result({"trade_leg_id": "leg"})
        return Result(None)


def test_open_mark_does_not_depend_on_tracker_or_execute_exits():
    db = Database(dict(ts=datetime(2026, 9, 18, 5, tzinfo=UTC), exchange="NSE",
        symbol_token="token", open=90, high=92, low=89, close=90))
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))
    assert monitor.refresh_open_marks() == 1
    updates = [params for query, params in db.calls if "UPDATE paper_trading.positions" in query]
    assert updates[0][2] == Decimal(100)
    assert not any("target_tracks" in query or "orders" in query or "observation_trackers" in query for query, _ in db.calls)


def test_invalid_open_mark_is_not_persisted():
    db = Database(dict(open=100, high=102, low=0, close=101))
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))
    assert monitor.refresh_open_marks() == 0
    assert not any("UPDATE paper_trading.positions" in query for query, _ in db.calls)
