from __future__ import annotations

from fastapi.testclient import TestClient

from nse_fii_services import api


def test_health_returns_scheduler_state():
    client = TestClient(api.app)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "scheduler_enabled" in payload


def test_latest_run_404_when_missing(monkeypatch):
    monkeypatch.setattr(api, "read_latest_metadata", lambda _settings: {
        "latest_run": None,
        "latest_daily": None,
        "latest_backfill": None,
    })
    client = TestClient(api.app)
    response = client.get("/latest-run")
    assert response.status_code == 404


def test_pull_latest_proxies_to_orchestrator(monkeypatch):
    monkeypatch.setattr(api, "run_latest_pull", lambda *_args, **_kwargs: {"operation": "pull-latest", "trade_date": "03-04-2026"})
    client = TestClient(api.app)
    response = client.post("/pull-latest", json={"max_lookback_days": 5})
    assert response.status_code == 200
    assert response.json()["operation"] == "pull-latest"


def test_backfill_proxies_to_orchestrator(monkeypatch):
    monkeypatch.setattr(api, "run_backfill", lambda *_args, **_kwargs: {"operation": "backfill", "start_date": "02-10-2023"})
    client = TestClient(api.app)
    response = client.post("/backfill", json={"start_date": "02-10-2023", "end_date": "06-10-2023"})
    assert response.status_code == 200
    assert response.json()["operation"] == "backfill"


def test_runs_and_run_detail_proxies(monkeypatch):
    monkeypatch.setattr(
        api,
        "list_runs",
        lambda *_args, **_kwargs: {
            "daily_runs": [{"run_id": "2026-04-02"}],
            "backfill_runs": [{"run_id": "2026-03-01__2026-03-31"}],
        },
    )
    monkeypatch.setattr(
        api,
        "get_run_detail",
        lambda *_args, **_kwargs: {
            "kind": "backfill",
            "summary": {"reports_downloaded": 57},
            "manifest_rows": [{"report_key": "fii_stats"}],
            "missing_rows": [{"report_key": "participant_oi"}],
        },
    )

    client = TestClient(api.app)

    catalog_response = client.get("/runs")
    assert catalog_response.status_code == 200
    assert catalog_response.json()["backfill_runs"][0]["run_id"] == "2026-03-01__2026-03-31"

    detail_response = client.get("/runs/backfill/2026-03-01__2026-03-31")
    assert detail_response.status_code == 200
    assert detail_response.json()["summary"]["reports_downloaded"] == 57


def test_load_proxies_to_loader(monkeypatch):
    monkeypatch.setattr(
        api,
        "load_run",
        lambda *_args, **_kwargs: {
            "kind": "backfill",
            "run_id": "2026-03-01__2026-03-31",
            "load_results": [{"dataset_name": "derivatives_stats", "row_count": 57}],
        },
    )
    client = TestClient(api.app)
    response = client.post("/load", json={"kind": "backfill", "run_id": "2026-03-01__2026-03-31"})
    assert response.status_code == 200
    assert response.json()["run_id"] == "2026-03-01__2026-03-31"
