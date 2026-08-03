# Export specification

## Supported export endpoints

- `GET /api/v1/intraday/exports/summary?format=json|csv`
- `GET /api/v1/intraday/exports/sections/{section_slug}?format=json|csv`
- `GET /api/v1/intraday/exports/watchlists/{slug}?format=json|csv`
- `GET /api/v1/intraday/exports/stocks/{symbol}?format=json|csv`
- `GET /api/v1/intraday/exports/manifest`

## Manifest behavior

Each export call writes a file under `EXPORT_ROOT` and inserts a row into `nse_ops.export_manifest` with:
- scope
- key
- trade date
- format
- file path
- size
- checksum

## JSON export shape

JSON exports keep the native API payload shape.

## CSV export shape

### Summary
Flattens:
- hero
- state
- summary table
- ticker tape

### Section
Exports `rows` only.

### Watchlist
Exports watchlist rows only.

### Stock
Exports the intraday time series rows only.

## Retention

The retention job removes old manifest rows and older export files according to the snapshot retention policy.
