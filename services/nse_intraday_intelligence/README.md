# NSE Intraday Intelligence Suite

This package is the **fourth layer** in the stack. It assumes the following are already integrated into your application:

1. The daily NSE ingestor into PostgreSQL.
2. The daily analytics / dashboard layer.
3. The orchestration + export API layer with `nse_ops.*` tables.
4. Your branded UI shell and theme contract.
5. Existing **1-minute capture** for:
   - the target index feed (for example Nifty 50 / Nifty 100 index minute bars)
   - the Nifty 100 basket of stocks

## What this package adds

- Canonical **minute-bar warehouse** tables in PostgreSQL
- Compatibility-view contract for attaching an existing capture pipeline
- Intraday feature materialization for the index and Nifty 100 basket
- Market-state labeling:
  - trend day up / down
  - gap-and-go
  - gap-fill / failed open
  - high-volatility chop
  - late-day reversal
  - narrow leadership vs broad participation
- Intraday stock intelligence layer:
  - intraday strength / weakness
  - VWAP reclaim candidates
  - opening-range breakouts
  - late reversal candidates
- Live dashboard snapshots and detail sections for the application
- Intraday watchlist snapshots
- Export APIs for summary, sections, watchlists, and stock detail payloads
- Scheduled refresh orchestration
- Historical state statistics to improve confidence once enough data accumulates

## Important semantic boundary

Because the intraday basket is the **Nifty 100 universe**, the package explicitly labels breadth as:

- `large_cap_breadth`
- `nifty100_participation`
- `weighted_participation`

It does **not** claim full-market breadth.

## Integration model

The package supports two integration modes.

### Mode A: Canonical raw tables
Your existing capture process writes into:

- `nse_intraday.raw_security_1m`
- `nse_intraday.raw_index_1m`

### Mode B: Compatibility views
Your existing capture process stays unchanged and the coding agent creates these views:

- `integration.v_source_security_1m`
- `integration.v_source_index_1m`
- `integration.v_prev_security_daily`
- `integration.v_prev_index_daily`
- `integration.v_universe_membership`
- `integration.v_index_daily_history`

Then this package runs a sync job that copies from those views into the canonical raw tables.

See `docs/DATA_CONTRACT.md`.

## New conclusions you can draw now

With 1-minute index + 1-minute Nifty 100 basket, you can now answer:

- Is the current index move broad enough to trust?
- Is the move being carried by a few heavyweights?
- Is the day behaving like a continuation day or a mean-reversion day?
- Was the open accepted or rejected?
- Is the session trending, chopping, or reversing late?
- Which Nifty 100 names are confirming the index versus diverging from it?

## Tables added by this package

### Raw + feature tables
- `nse_intraday.raw_security_1m`
- `nse_intraday.raw_index_1m`
- `nse_intraday.universe_membership`
- `nse_intraday.security_minute_feature`
- `nse_intraday.market_minute_feature`
- `nse_intraday.stock_intraday_live`
- `nse_intraday.market_session_summary`

### Snapshot tables for the app
- `nse_ops.dashboard_snapshot_intraday`
- `nse_ops.dashboard_section_intraday`
- `nse_ops.watchlist_snapshot_intraday`

## Live API surface

- `GET /health`
- `GET /api/v1/intraday/summary`
- `GET /api/v1/intraday/sections/{section_slug}`
- `GET /api/v1/intraday/state`
- `GET /api/v1/intraday/breadth/timeline`
- `GET /api/v1/intraday/leadership`
- `GET /api/v1/intraday/stocks/{symbol}`
- `GET /api/v1/intraday/watchlists`
- `GET /api/v1/intraday/watchlists/{slug}`
- `GET /api/v1/intraday/ticker-tape`
- `GET /api/v1/intraday/exports/summary`
- `GET /api/v1/intraday/exports/sections/{section_slug}`
- `GET /api/v1/intraday/exports/watchlists/{slug}`
- `GET /api/v1/intraday/exports/stocks/{symbol}`
- `GET /api/v1/intraday/exports/manifest`
- `GET /api/v1/intraday/ops/status`
- `POST /api/v1/intraday/ops/run/{job_key}`

## Installation

```bash
cp .env.example .env
# edit the env values and confirm the integration views or raw-table writer are in place
docker compose -f docker-compose.yml -f docker-compose.overlay.yml up -d --build
```

## SQL bootstrap

```bash
docker compose exec nse-intraday-api python scripts/install_sql.py
```

`INSTALL_SQL_ON_START` is now a transitional, explicit opt-in and defaults to off in the main stack.
Use the central runner or the manual install command instead of relying on startup SQL in production.

## DB pool controls

- `NSE_INTRADAY_DB_POOL_MIN_SIZE`
- `NSE_INTRADAY_DB_POOL_MAX_SIZE`
- `NSE_INTRADAY_DB_POOL_TIMEOUT_SECONDS`
- `NSE_INTRADAY_DB_POOL_MAX_IDLE_SECONDS`

The main stack defaults to a small bounded pool and exposes the effective values on `GET /health`.

## Recommended runtime order

1. Sync raw minute bars from the current capture source
2. Refresh security minute features
3. Refresh market minute features
4. Refresh live stock state
5. Refresh dashboard snapshot + sections
6. Refresh watchlist snapshots
7. Run quality checks
8. Finalize the session after market close
9. Retention cleanup

## Historical value

The package is materially more powerful once history builds up. The highest-value history-driven outputs are:

- state hit rates
- next-day follow-through after each session type
- failure rate of gap-and-go days
- reliability of broad-participation breakouts
- reversal tendency after narrow-leadership moves
- stock-level intraday pattern persistence

See:
- `docs/ANALYSIS_CATALOG.md`
- `docs/HISTORICAL_VALUE.md`
- `docs/STATE_LABELS.md`
- `docs/INTEGRATION_FOR_CODE_AGENT.md`
