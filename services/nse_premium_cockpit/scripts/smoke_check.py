import sys
from pathlib import Path

# Ensure repo root on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> None:
    app = create_app()
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/api/health").json()["ok"] is True
    snap = client.get("/api/snapshot").json()
    assert "market" in snap and "leaders" in snap
    print("smoke_check_ok")


if __name__ == "__main__":
    main()
