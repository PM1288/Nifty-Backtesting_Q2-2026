from datetime import UTC, datetime

import httpx
import pytest

from oiis_live import main, selector


def test_paper_submit_conflict_is_terminal_but_server_errors_can_retry() -> None:
    request = httpx.Request("POST", "http://paper-api:8088/api/v1/trade-intents")
    conflict_response = httpx.Response(409, request=request)
    unavailable_response = httpx.Response(503, request=request)
    conflict = httpx.HTTPStatusError("idempotency conflict", request=request, response=conflict_response)
    unavailable = httpx.HTTPStatusError("server error", request=request, response=unavailable_response)

    assert main.submission_failure_status(conflict) == "REJECTED"
    assert main.submission_failure_status(unavailable) == "FAILED_RETRYABLE"
    assert main.submission_failure_status(TimeoutError("network timeout")) == "FAILED_RETRYABLE"


def test_claim_and_submit_persists_409_as_terminal(monkeypatch) -> None:
    class _ClaimResult:
        def fetchone(self):
            return {"entry_claim_id": "claim-1"}

    class _ClaimConnection:
        def __init__(self):
            self.queries = []

        def commit(self):
            pass

        def execute(self, query, params=None):
            self.queries.append((query, params))
            return _ClaimResult()

    connection = _ClaimConnection()
    runtime = main.Runtime.__new__(main.Runtime)
    runtime.paper_api_url = "http://paper-api:8088"
    runtime.policy = {"entry":{"maximum_ticket_inr":200000}}
    runtime.paper_token = "paper-test-token"
    errors = []
    runtime.record_error = lambda *args, **kwargs: errors.append((args, kwargs))
    monkeypatch.setattr(main, "resolve_fno_lot_size", lambda *_args: 1)
    monkeypatch.setattr(main, "trade_payload", lambda *_args, **_kwargs: {"signal_id": "test"})

    def conflict(*_args, **_kwargs):
        request = httpx.Request("POST", "http://paper-api:8088/api/v1/trade-intents")
        return httpx.Response(409, json={"detail": "idempotency conflict"}, request=request)

    monkeypatch.setattr(main.httpx, "post", conflict)
    result = runtime.claim_and_submit(
        connection,
        {"trade_date": datetime(2026, 10, 19).date(), "symbol": "MANKIND", "watchlist_item_id": "watch-1"},
        {"ts": datetime(2026, 10, 19, 9, 30, tzinfo=UTC), "close":100},
        None,
        None,
        "bar-1",
    )

    assert result == "FAILED"
    assert any(
        "UPDATE oiis_live.entry_claim SET status=%s" in query and params[0] == "REJECTED"
        for query, params in connection.queries
    )
    assert len(errors) == 1


def test_webhook_url_must_be_explicit_https_without_userinfo() -> None:
    assert main.validate_webhook_url("") == ""
    assert main.validate_webhook_url(" https://alerts.example/hooks/token ") == "https://alerts.example/hooks/token"
    for value in ("http://alerts.example/hook", "https:///missing-host", "https://user:pass@alerts.example/hook"):
        with pytest.raises(ValueError, match="HTTPS URL"):
            main.validate_webhook_url(value)


class _Result:
    def __init__(self, rows=()):
        self.rows = list(rows)

    def fetchone(self):
        return {"open":True}

    def fetchall(self):
        return self.rows


class _Connection:
    def __init__(self, pool):
        self.pool = pool

    def __enter__(self):
        self.pool.active += 1
        return self

    def __exit__(self, *_exc):
        self.pool.active -= 1

    def execute(self, query, params=None):
        self.pool.queries.append((query, params))
        if "SELECT * FROM oiis_live.error_outbox" in query:
            return _Result(self.pool.rows)
        return _Result()


class _Pool:
    def __init__(self, rows):
        self.rows = rows
        self.active = 0
        self.queries = []

    def connection(self):
        return _Connection(self)


class _Response:
    def raise_for_status(self):
        return None


def test_error_delivery_releases_database_connection_before_http(monkeypatch) -> None:
    row = {
        "error_id": "error-1",
        "severity": "ERROR",
        "error_class": "ValueError",
        "message": "test error",
        "context": {},
        "created_at": datetime(2026, 10, 1, tzinfo=UTC),
        "attempts": 0,
    }
    runtime = main.Runtime.__new__(main.Runtime)
    runtime.error_webhook = "https://alerts.example/hooks/token"
    runtime.pool = _Pool([row])
    posts = []

    def post(url, **kwargs):
        assert runtime.pool.active == 0
        posts.append((url, kwargs))
        return _Response()

    monkeypatch.setattr(main.httpx, "post", post)

    assert runtime.deliver_errors() == 1
    assert len(posts) == 1
    assert posts[0][1]["follow_redirects"] is False
    assert runtime.pool.active == 0
    assert any("available_at=now()+interval '5 minutes'" in query for query, _ in runtime.pool.queries)
    assert any("status='DELIVERED'" in query for query, _ in runtime.pool.queries)


def test_constituent_refresh_failure_uses_cached_reference_set_and_logs(monkeypatch, caplog) -> None:
    class _UniverseConnection:
        def execute(self, query, _params=None):
            if "SELECT DISTINCT UPPER(TRIM(name))" in query:
                return _Result()
            if "SELECT count(*) FILTER" in query:
                return type("Counts", (), {"fetchone": lambda _self: {"total": 2, "fno": 4, "nifty50": 3}})()
            return _Result()

    def fail_refresh(_url, **kwargs):
        assert kwargs["follow_redirects"] is False
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(selector.httpx, "get", fail_refresh)

    assert selector.refresh_universe(_UniverseConnection()) == {"total": 2, "fno": 4, "nifty50": 3}
    assert "retaining the previous reference set" in caplog.text


def test_monitor_refreshes_paper_submit_heartbeat_when_no_trade_is_due() -> None:
    class _MonitorConnection:
        def __init__(self, pool):
            self.pool = pool

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return None

        def execute(self, query, _params=None):
            if "INSERT INTO oiis_live.service_heartbeat" in query:
                self.pool.heartbeats.append(_params)
                return _Result()
            return _Result()

    class _MonitorPool:
        def __init__(self):
            self.heartbeats = []

        def connection(self):
            return _MonitorConnection(self)

    runtime = main.Runtime.__new__(main.Runtime)
    runtime.pool = _MonitorPool()

    result = runtime.monitor_once(datetime(2026, 10, 23, tzinfo=UTC).date())

    assert result["failed"] == 0
    paper_submit = next(item for item in runtime.pool.heartbeats if item[0] == "oiis-live-paper-submit")
    assert paper_submit[1] == "OK"
    assert paper_submit[3] is True
