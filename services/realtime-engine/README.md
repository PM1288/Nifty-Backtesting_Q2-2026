# Realtime Engine

Thin FastAPI adapter that reads the existing intraday + recommendation tables and exposes the
`nse_premium_cockpit` contracts:

- `GET /api/health`
- `GET /api/snapshot`
- `GET /api/stock/{symbol}`
- `WS /ws/live`

It does not compute the underlying analytics itself. It translates the materialized warehouse
state already produced by `nse_intraday_intelligence` and `nse_reco_state_engine`.
