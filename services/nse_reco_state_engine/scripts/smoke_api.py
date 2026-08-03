from __future__ import annotations

import os

# Provide a dummy DATABASE_URL so settings validation doesn't fail during import-only smoke.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/postgres")

from nse_reco_state_aware_engine.api.main import app  # noqa: E402


def main() -> int:
    routes = [getattr(r, "path", "") for r in app.router.routes]
    assert any(p.startswith("/api/v1/reco") for p in routes)
    assert any(p.startswith("/api/v1/ops") for p in routes)
    assert any(p.startswith("/api/v1/exports") for p in routes)
    print("OK - routes:", len(routes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
