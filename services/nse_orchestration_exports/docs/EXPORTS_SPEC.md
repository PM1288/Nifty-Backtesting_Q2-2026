# Export API specification

## Export types

### 1) Dashboard summary
Endpoint:
- `GET /api/v1/exports/dashboard/summary?trade_date=YYYY-MM-DD&format=json|csv`

CSV shape:
- one row per summary metric / hero field / leaderboard member

JSON shape:
- same structure as `/api/v1/dashboard/summary`

### 2) Dashboard section
Endpoint:
- `GET /api/v1/exports/dashboard/sections/{section_slug}?trade_date=YYYY-MM-DD&format=json|csv`

CSV shape:
- one row per detailed item in the section

### 3) Watchlist snapshot
Endpoint:
- `GET /api/v1/exports/watchlists/{slug}?trade_date=YYYY-MM-DD&format=json|csv`

CSV shape:
- one row per symbol in the watchlist snapshot

### 4) Watchlist history
Endpoint:
- `GET /api/v1/exports/watchlists/{slug}/history?days=90&format=json|csv`

CSV shape:
- one row per trade_date x symbol

## Export cache

The scheduled export job writes files into `EXPORT_ROOT`.
Each generated file is logged in `nse_ops.export_manifest`.

Cleanup rules:
- delete files older than `EXPORT_RETENTION_DAYS`
- delete corresponding manifest rows
