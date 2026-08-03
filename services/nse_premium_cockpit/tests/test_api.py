from fastapi.testclient import TestClient
from app.main import create_app


def test_health_and_snapshot():
    app = create_app()
    client = TestClient(app)

    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True

    s = client.get("/api/snapshot")
    assert s.status_code == 200
    j = s.json()
    assert "market" in j
    assert "leaders" in j
    assert "ticker" in j
    assert "anomalies" in j
