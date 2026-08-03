# Compose merge instructions

Assume your application already has a base `docker-compose.yml` with:
- `postgres`
- your main app service
- optional reverse proxy

Add this package using:

```bash
docker compose -f docker-compose.yml -f docker-compose.overlay.yml up -d --build
```

## Expected service behavior

### `nse-orchestrator`
Runs scheduled jobs and logs them into PostgreSQL.

### `nse-export-api`
Serves dashboard summary, detailed sections, watchlists, exports, and ops endpoints.

## Optional reverse proxy
If your main app proxies API routes, expose the sidecar under:
- `/api/v1/dashboard/*`
- `/api/v1/watchlists/*`
- `/api/v1/exports/*`
- `/api/v1/ops/*`
