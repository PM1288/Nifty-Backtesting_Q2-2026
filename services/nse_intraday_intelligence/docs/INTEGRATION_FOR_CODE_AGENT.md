# Integration guide for the coding agent

This package assumes the earlier layers are already in production:

- daily warehouse
- daily analytics
- orchestration / export API layer
- branded UI shell
- minute-bar capture pipeline

Do **not** replace the existing capture system if it already works. Attach this package through compatibility views or direct writes into the canonical tables.

## Recommended integration order

### 1) Merge the package
Copy into the application repository:

- `src/nse_intraday_intelligence`
- `sql`
- `contracts`
- `agent.d`
- `scripts`
- selected docs from `docs`
- `docker-compose.overlay.yml`
- `docker/Dockerfile`

Add dependencies from `requirements.txt`.

### 2) Install SQL
Run:

```bash
python scripts/install_sql.py
```

This creates:

- `nse_intraday.*` raw, feature, and summary tables
- `nse_ops.*` intraday snapshot tables
- `integration.*` compatibility-view stubs

### 3) Create the compatibility views
The package is designed so the coding agent only has to map the current application tables into these view names:

- `integration.v_source_security_1m`
- `integration.v_source_index_1m`
- `integration.v_prev_security_daily`
- `integration.v_prev_index_daily`
- `integration.v_universe_membership`
- `integration.v_index_daily_history`

Do not change the package SQL or Python first. Create the views first.

### 4) Decide how raw minute bars arrive

#### Option A: Existing capture writes directly into canonical tables
If your application can write directly into:

- `nse_intraday.raw_security_1m`
- `nse_intraday.raw_index_1m`

then the sync step may be skipped.

#### Option B: Existing capture stays unchanged
Create the compatibility views and keep the sync job enabled:
- `intraday_sync_raw`

This is the safer choice for integration because it isolates the new package from current capture internals.

### 4.1) Recommended path for historical alpha baselines

In this repository, the fastest and most accurate path is:

- keep `nse_intraday.raw_security_1m` / `nse_intraday.raw_index_1m` for the current session materialization
- compute historical beta and minute-volume baselines from the compatibility views:
  - `integration.v_source_security_1m`
  - `integration.v_source_index_1m`

Do not force a large historical copy into `nse_intraday.raw_*` just to make stock-alpha work. If archived minute bars already exist behind the compatibility views, use them directly for:

- `nse_intraday.stock_daily_beta_profile`
- `nse_intraday.stock_minute_volume_profile`

This keeps the alpha layer grounded in the actual archived source while avoiding a slow historical raw-sync backlog.

### 5) Mount the API
Either run as a sidecar service or mount the routers in the main API.

```python
from nse_intraday_intelligence.routers.intraday import router as intraday_router
from nse_intraday_intelligence.routers.exports import router as intraday_exports_router
from nse_intraday_intelligence.routers.ops import router as intraday_ops_router

app.include_router(intraday_router)
app.include_router(intraday_exports_router)
app.include_router(intraday_ops_router)
```

### 6) Run the initial refresh chain
After the compatibility views return data:

```bash
python -m nse_intraday_intelligence.manual_jobs sync-raw --trade-date YYYY-MM-DD
python -m nse_intraday_intelligence.manual_jobs refresh-features --trade-date YYYY-MM-DD --index-code "NIFTY 50"
python -m nse_intraday_intelligence.manual_jobs refresh-dashboard --trade-date YYYY-MM-DD --index-code "NIFTY 50"
python -m nse_intraday_intelligence.manual_jobs refresh-watchlists --trade-date YYYY-MM-DD --index-code "NIFTY 50"
python -m nse_intraday_intelligence.manual_jobs run-quality-checks --trade-date YYYY-MM-DD --index-code "NIFTY 50"
```

If the current-session raw tables were cleared or not yet populated, first materialize the target day into:

- `nse_intraday.raw_security_1m`
- `nse_intraday.raw_index_1m`

Then run the refresh chain.

### 7) Enable scheduler
Bring up the scheduler container or service after the manual chain works end-to-end.

### 8) Bind the frontend
The frontend should read from the read APIs only, not from raw tables:

- `/api/v1/intraday/summary`
- `/api/v1/intraday/sections/{section_slug}`
- `/api/v1/intraday/stocks/{symbol}`
- `/api/v1/intraday/watchlists`
- `/api/v1/intraday/watchlists/{slug}`

## Acceptance checks

The integration is complete only if all are true:

1. `GET /health` returns `ok`.
2. `select count(*) from nse_intraday.raw_security_1m` returns minute bars for the expected day.
3. `select count(*) from nse_intraday.market_minute_feature where trade_date = ...` is non-zero.
4. `select * from nse_intraday.market_session_summary where trade_date = ...` returns a current state row.
5. `GET /api/v1/intraday/summary` returns hero, state, summary table, breadth, leaders, and ticker tape.
6. `GET /api/v1/intraday/sections/market-state` returns a section payload.
7. `GET /api/v1/intraday/watchlists` returns seeded watchlists.
8. `GET /api/v1/intraday/stocks/{symbol}` returns a time series.
9. `select * from nse_ops.watchlist_snapshot_intraday where trade_date = ...` is non-zero.
10. `GET /api/v1/intraday/exports/manifest` shows export entries after calling any export endpoint.

### Stock-alpha acceptance checks

For a fully working stock-alpha integration, these should also hold on a known trade date:

1. `run-quality-checks` reports non-zero `beta_coverage`.
2. `run-quality-checks` reports non-zero `volume_profile_coverage`.
3. `/api/v1/intraday/sections/stock-quality` shows real `beta_20d` values rather than universal fallback `1.0`.
4. `/api/v1/intraday/stocks/{symbol}` shows real:
   - `beta_20d`
   - `beta_60d`
   - `residual_return_*`
   - `minute_volume_ratio`
   - `cum_volume_vs_profile`
   - `volume_curve_surprise`

## Non-negotiable behavioral rules

- Label breadth correctly as **Nifty 100 / large-cap intraday breadth**.
- Do not present the market-state output as a trading instruction.
- Keep the UI token-driven: use `direction`, `accent_token`, and `arrow`.
- Do not interpret missing intraday data as zero values.
- Do not blend unrelated color logic into the payloads.
- Preserve the educational disclaimer semantics in all summary / export surfaces.

## Where to patch if the application schema differs

Patch the compatibility views, not the package internals, unless there is a genuine contract gap.

See `docs/DATA_CONTRACT.md`.
