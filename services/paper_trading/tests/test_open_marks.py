from contextlib import contextmanager
from datetime import UTC, datetime, time
from decimal import Decimal
from types import SimpleNamespace

from papertrade import monitor as monitor_module
from papertrade.monitor import Monitor

_DEFAULT_SESSION = object()


class Result:
    def __init__(self, value):
        self.value = value

    def fetchall(self):
        return self.value

    def fetchone(self):
        return self.value


class Database:
    def __init__(self, bar, session=_DEFAULT_SESSION):
        self.bar = bar
        self.session = dict(
            is_trading_day=True,
            regular_open_time=time(9, 15),
            regular_close_trigger_time=time(15, 30),
        ) if session is _DEFAULT_SESSION else session
        self.calls = []

    @contextmanager
    def connection(self):
        yield self

    def execute(self, query, params=None):
        text = str(query)
        self.calls.append((text, params))
        if "FROM market_status.exchange_session_calendar" in text:
            return Result(self.session)
        if "SELECT i.exchange,i.instrument_token,min(l.opened_at)" in text:
            return Result([dict(exchange="NSE", instrument_token="token", monitor_from=datetime(2026, 10, 26, 4, tzinfo=UTC))])
        if "INSERT INTO paper_trading.instrument_monitor_cursors" in text:
            return Result(None)
        if "SELECT last_bar_ts FROM paper_trading.instrument_monitor_cursors" in text:
            return Result(dict(last_bar_ts=datetime(2026, 10, 26, 4, tzinfo=UTC)))
        if "ORDER BY ts LIMIT" in text:
            return Result([self.bar] if self.bar else [])
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


def test_off_session_bar_does_not_update_paper_marks_or_trade_evidence():
    bar = dict(ts=datetime(2026, 10, 25, 22, 36, tzinfo=UTC), exchange="NSE",
        symbol_token="token", open=90, high=92, low=89, close=90, source="ws")
    db = Database(bar)
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))

    monitor._process_bar(db, bar)

    assert not any("processed_market_bars" in query for query, _ in db.calls)
    assert not any("UPDATE paper_trading.positions" in query for query, _ in db.calls)


def test_calendar_holiday_bar_is_excluded_even_during_regular_hours():
    bar = dict(ts=datetime(2026, 10, 26, 5, 30, tzinfo=UTC), exchange="NSE",
        symbol_token="token", open=90, high=92, low=89, close=90, source="ws")
    db = Database(bar, session=dict(is_trading_day=False,
        regular_open_time=time(9, 15), regular_close_trigger_time=time(15, 30)))
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))

    monitor._process_bar(db, bar)

    assert not any("processed_market_bars" in query for query, _ in db.calls)


def test_missing_calendar_entry_is_rechecked_after_short_negative_cache(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr(monitor_module, "monotonic", lambda: clock[0])
    timestamp = datetime(2026, 10, 26, 5, tzinfo=UTC)
    db = Database(None, session=None)
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))

    assert monitor._session_status(db, timestamp) is None
    assert monitor._session_status(db, timestamp) is None
    assert sum("FROM market_status.exchange_session_calendar" in query for query, _ in db.calls) == 1

    db.session = dict(is_trading_day=True, regular_open_time=time(9, 15), regular_close_trigger_time=time(15, 30))
    clock[0] += monitor_module._SESSION_MISSING_RECHECK_SECONDS + 1
    assert monitor._session_status(db, timestamp) is True
    assert sum("FROM market_status.exchange_session_calendar" in query for query, _ in db.calls) == 2


def test_missing_calendar_bar_does_not_advance_monitor_cursor():
    bar = dict(ts=datetime(2026, 10, 26, 5, tzinfo=UTC), exchange="NSE",
        symbol_token="token", open=90, high=92, low=89, close=90, volume=1, source="ws")
    db = Database(bar, session=None)
    monitor = Monitor(db, SimpleNamespace(PAPER_TRADING_SCHEMA="paper_trading",
        MARKET_DATA_SCHEMA="public", MARKET_DATA_BAR_TABLE="bars_1m"))

    assert monitor.process_bars() == 0
    assert not any("UPDATE paper_trading.instrument_monitor_cursors" in query for query, _ in db.calls)
    assert not any("processed_market_bars" in query for query, _ in db.calls)
