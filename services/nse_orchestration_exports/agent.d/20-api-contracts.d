API contract priority:
- keep payloads stable
- prefer additive change only
- do not rename `direction`, `accent_token`, or `arrow`
- return explicit `generated_at`, `trade_date`, and `is_stale`

Dashboard routes:
- GET /api/v1/dashboard/summary
- GET /api/v1/dashboard/sections/{section_slug}
- GET /api/v1/dashboard/ticker-tape

Watchlist routes:
- GET /api/v1/watchlists
- GET /api/v1/watchlists/{slug}
- GET /api/v1/watchlists/{slug}/history

Export routes:
- GET /api/v1/exports/*
