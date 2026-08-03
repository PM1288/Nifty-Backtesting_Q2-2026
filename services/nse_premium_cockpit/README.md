# NSE Premium Cockpit

Premium “live cockpit” UI for a learning platform (FastAPI + static Canvas UI).

## Run (dev)

```bash
cd nse_premium_cockpit
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000

## Integration options

### Option A: run as a dedicated service in your docker-compose
- Add this folder as a service
- Expose port 8000 internally
- Feed real snapshots to `/ws/live` (same schema)

### Option B: embed the UI in your existing app
- Copy `static/` into your static host
- Keep `/ws/live` + `/api/*` endpoints identical

## Contracts and checklists
- `docs/INTEGRATION.md`
- `docs/WIREFRAMES.md`
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/SUCCESS_CRITERIA.md`

## Environment
- `DATA_MODE=mock` (default)
- `MOCK_EMIT_INTERVAL_SEC=1.0` (demo “live” feel)


## UI routing overrides (optional)
- `PUBLIC_WS_URL` to point the browser at a different WebSocket endpoint
- `PUBLIC_API_BASE` to point REST calls at a different base URL
