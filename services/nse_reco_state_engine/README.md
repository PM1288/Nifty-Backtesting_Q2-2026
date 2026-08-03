# NSE State-Aware Recommendation Engine (Overlay)

This project adds a **state-aware recommendation engine** and **3-layer anomaly system** on top of an existing stack that already has:
- Postgres
- 1-minute index data
- 1-minute Nifty 100 stock data
- intraday stock features (residual returns, VWAP quality, volume surprise, etc.)

It integrates via **compatibility views** (`integration.*`) so you do **not** have to rename existing tables.

## What you get

- **Regime model**: classifies the day (broad bullish/bearish expansion, mixed rotation, volatility chop, compression)
- **Signal model**: scores each stock setup (breakout continuation, quiet accumulation, mean reversion, breakdown risk, squeeze watch, event watch)
- **Action model**: converts `regime + signal + historical edge - risk/anomaly penalties` into actions
- **Anomalies**:
  1) single-stock anomalies
  2) cross-sectional anomalies (peer divergence)
  3) market-wide anomalies (breadth/dispersion/correlation snap)
- **Historical scorecards** (regime-conditioned hit rates and returns) for 15m/30m/60m/close horizons
- **Export APIs** for summaries, watchlists, and downloadable JSON/CSV
- **Scheduler** with step-level logging and retries

## Integration contract (critical)

This project reads from these views (you must create them as mappings to your existing intraday tables):

- `integration.v_security_minute_feature`
- `integration.v_market_minute_feature`
- `integration.v_universe_membership`
- `integration.v_index_daily_history`
- `integration.v_events_daily` *(optional; for event_watch enrichment)*

See `agent/DATA_CONTRACT.md` for required columns.

## UI/theming

This package does **not** render UI. It emits **semantic UI fields** so your existing branded UI can decide styling:

- `direction`: `up | down | neutral`
- `accent_token`: `green | red | white`
- `arrow`: `▲ | ▼ | •`

## Quick start (standalone)

### 1) Configure
Copy `.env.example` to `.env` and set `DATABASE_URL`.

### 2) Install
```bash
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
pip install -e .
```

### 3) Install SQL objects
```bash
python scripts/install_sql.py --database-url "$DATABASE_URL"
```

### 4) Start API
```bash
uvicorn nse_reco_state_aware_engine.api.main:app --host 0.0.0.0 --port 8010
```

### DB pool controls

- `DB_POOL_SIZE`
- `DB_POOL_MAX_OVERFLOW`
- `DB_POOL_TIMEOUT_SECONDS`
- `DB_POOL_RECYCLE_SECONDS`

The API now exposes the effective pool settings on `GET /health`.

### 5) Run one refresh chain
```bash
nse-reco-cli run --trade-date 2026-03-05 --index-code "NIFTY 50" \
  --steps baselines,regime,anomalies,recommendations,scorecards,quality
```

## Docker compose overlay

Use `docker-compose.overlay.yml` to add two services:
- `nse-reco-api`
- `nse-reco-scheduler`

Your main compose should already provide Postgres and the intraday capture/feature stack.

## Exports

- JSON: `/api/v1/reco/recommendations?horizon=30m&format=json`
- CSV:  `/api/v1/reco/recommendations?horizon=30m&format=csv`
- Manifest: `/api/v1/exports/manifest`

## Verification

```bash
pytest -q
python scripts/smoke_api.py
```

## For the coding agent

Start at:
- `agent/INTEGRATION_FOR_CODE_AGENT.md`
