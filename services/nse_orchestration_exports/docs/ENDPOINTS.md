# Endpoint catalog

## Read APIs

### Dashboard
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/sections/{section_slug}`
- `GET /api/v1/dashboard/ticker-tape`

### Watchlists
- `GET /api/v1/watchlists`
- `GET /api/v1/watchlists/{slug}`
- `GET /api/v1/watchlists/{slug}/history`

### Exports
- `GET /api/v1/exports/dashboard/summary`
- `GET /api/v1/exports/dashboard/sections/{section_slug}`
- `GET /api/v1/exports/watchlists/{slug}`
- `GET /api/v1/exports/watchlists/{slug}/history`
- `GET /api/v1/exports/manifest`
- `GET /api/v1/exports/download/{export_id}`

### Operations
- `GET /api/v1/ops/jobs`
- `GET /api/v1/ops/runs`
- `GET /api/v1/ops/quality`
- `POST /api/v1/ops/run/{job_key}`
