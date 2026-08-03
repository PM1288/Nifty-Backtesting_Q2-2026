# Historical Grafana + Loki Note

Last reviewed: 2026-03-31

This file is a historical / optional observability note.

Grafana is not part of the current public N50 product surface described in:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)
- [Current stack inventory](./stack-current.md)

# Grafana + Loki

This stack emits structured logs to stdout. Loki + Promtail can scrape container logs and make them available in Grafana.

## Custom Grafana image (cloud-viz reference)
- The `grafana` service in `docker-compose.yml` now builds `trading-stack/custom-grafana:12.3.1` from `custom-grafana/dockerfile_qio-cloud-viz`.
- Branding assets are taken from `mod-grafana/cloud-viz/img`.
- Plugins are preinstalled using `GF_PLUGINS_PREINSTALL_SYNC` (latest Grafana syntax).
- Existing dashboards, datasources, alert rules, and users are preserved because runtime data still uses the same named volume: `grafana_data:/var/lib/grafana`.
- Safe redeploy command:
  - `docker compose --env-file .env -f docker-compose.yml up -d --build grafana nginx`

## Home dashboard + cross-dashboard navigation
- Default home dashboard is set via `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/dashboards/trading-stack-home.json`.
- Org preference home is set to UID `trading-stack-home`.
- Every dashboard includes Grafana built-in dashboard links configured as a dropdown (`type=dashboards`, `asDropdown=true`) for fast navigation between dashboards.
- Home dashboard (`Trading Stack Home`) uses a Text (HTML) panel with native links to:
  - Dashboard pages (`/d/...`)
  - UIs (`/paper`, `/watcher`, `/rsi-willr/`, `/option-chain/`, `/n8n/`, `/gateway/`)
  - Key APIs (`/backend/healthz`, `/backend/paper/summary`, `/backend/watcher/summary`, `/option-chain/api/latest`)

## Enable Loki + Promtail
```bash
docker compose --env-file .env -f docker-compose.yml -f compose/loki/docker-compose.loki.yaml up -d
```

## Add Loki data source in Grafana
- URL: `http://loki:3100`
- Access: Server

## Sample LogQL
- All collector logs:
  `{service="collector"}`
- Warnings:
  `{service="collector"} |= "warn"`

## Metrics + SLA dashboards (Postgres)
The collector rolls up ingestion health into `metrics_1m` every minute. This table is used for Grafana SLA panels and alerts.

### Tables created for metrics
- `instrument_universe` (expected tokens per universe)
- `source_sla` (expected cadence + staleness thresholds)
- `trading_calendar` (market hours)
- `instrument_state` (last seen tick, last price)
- `index_constituents` (index composition metadata)
- `symbol_perf_snapshot` (per-minute performance snapshot for heatmaps)
- `api_request_log` (endpoint success/latency + 429s)
- `metrics_1m` (minute rollups: coverage, staleness, bars, API health)

### Dashboards
- `trading-stack-overview` (subscriptions + bars overview)
- `trading-stack-sla` (coverage, staleness, bars missing, API errors/429)
- `trading-stack-trading` (live market view: NIFTY50/BANKNIFTY, top movers, options/futures slice)
- `trading-stack-market-data` (order flow + depth: total buy/sell, best bid/ask, depth-5, circuits, 52-week range, volume, OI, OI change %, OHLC)
- `trading-stack-market-data` uses `instrument_state` for live order flow and depth snapshots; depth-5 is updated from WebSocket when `ws.enable_depth_snapshots` is true.
- `trading-stack-strategy` (strategy runs, signals, paper positions/trades, A02 parameter editor + change log)
- `trading-stack-sector-heatmap` (sector → stock treemap using `index_constituents` + `symbol_perf_snapshot`)
- `trading-stack-option-greeks` (latest Greeks + IV + trade volume by strike/expiry)
- `trading-stack-equilibrium` (normalized CE/PE mean series, strike snapshots, equilibrium/ATM view)
- `trading-stack-max-pain` (max pain strike summary + per-strike pain curve + spot reference)
- `trading-stack-watchlist` (HTML manager for watchlist targets + recent alert events)
- `trading-stack-backtest` (A02 runs, win rate, net P&L, trade-date performance, parameter snapshot, recent live signals/trades)
- `trading-stack-backtest` also includes archive swing replay panels (runs, win rate, net P&L, latest swing trades)
- `trading-stack-portfolio` (Portfolio tracker: add/close positions via `/backend/portfolio/positions`)

### Grafana data source
- Postgres: use the provisioned `postgres` datasource (already wired in `compose/grafana/provisioning`).

### HTML panel support
- `GF_PANELS_DISABLE_SANITIZE_HTML=true` is required for the watchlist HTML widget to run its JS.

### Key panels (from `metrics_1m`)
- Equity coverage: `source_name='equity_ticks'`
- Equity bars completeness: `source_name='equity_bars_1m'`
- Indices staleness: `source_name='indices_ticks'`
- Options coverage (NIFTY): `source_name='options_index_nifty_ticks'`
- API errors/429: `sum(api_error_count)` / `sum(api_429_count)`
- OI change % panels source from `oi_snapshots_*` (computed deltas) instead of WS dummy field.

### Max pain tables
- `max_pain_summary` (latest strike + spot)
- `max_pain_levels` (per-strike pain curve per run)
- `max_pain_runs` (run status + counts)

### Validation workflow
- During market hours: coverage >= 99%, equity bars missing = 0 within 2 minutes of close.
- Outside market hours: staleness expected; check API error/429 panels for throttling.
