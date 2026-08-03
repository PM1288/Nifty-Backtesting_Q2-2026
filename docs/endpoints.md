# Trading Stack Endpoints Reference

Last reviewed: 2026-03-31

This document reflects the current N50 dashboard stack that is actually deployed from `docker-compose.yml`. It replaces older notes that referred to Grafana, n8n, and legacy dashboard paths that are no longer part of the public product surface.

Current doc path:

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)

## Public entrypoints

### Production

- Root host: `https://m.nifty50today.co.in/`
- App base path: `https://m.nifty50today.co.in/n50/`

### Stage

- Root host: `https://stage.nifty50today.co.in/`
- App base path: `https://stage.nifty50today.co.in/n50-stage/`

### Local

- Reverse proxy: `http://localhost:19090`
- PROD app: `http://localhost:19090/n50/`
- STAGE app: `http://localhost:19090/n50-stage/`
- Local Matomo admin: `http://localhost:19091/`

## Public website routes

The browser app is a React SPA mounted under `/n50/` for PROD and `/n50-stage/` for STAGE.

Main routes:

- `/`
- `/analytics`
- `/analytics/regime`
- `/analytics/supporting-metrics`
- `/analytics/setups`
- `/analytics/risk`
- `/analytics/flows`
- `/analytics/learn`
- `/analytics/simulator`
- `/analytics/indicators`
- `/analytics/indicators/:slug`
- `/analytics/stock/:symbol`
- `/analytics/system/map`
- `/analytics/system/quality`
- `/feedback`
- `/options`
- `/backtesting`
- `/backtesting/strategies`
- `/backtesting/strategies/:strategyId`
- `/backtesting/results`
- `/backtesting/regimes`
- `/backtesting/stocks`
- `/backtesting/daily-summary`
- `/backtesting/compare`
- `/backtesting/runs`
- `/heatmap/change`
- `/heatmap/rsi`
- `/heatmap/will`

Legacy redirects still supported:

- `/option-chain` -> `/options`
- `/analytics/quality` -> `/analytics/system/quality`
- `/analytics/signals/flows` -> `/analytics/flows`
- `/change-heatmap` -> `/heatmap/change`
- `/rsi-surface` -> `/heatmap/rsi`
- `/will-surface` -> `/heatmap/will`
- `/stock/:symbol` -> `/analytics/stock/:symbol`

## Core app/API endpoints

These endpoints are served by the N50 dashboard app container itself.

### Health and internal

- `GET /health`
- `GET /ready`
- `POST /internal/snapshots/refresh`

### Auth and session

- `GET /auth/session`
- `GET /auth/csrf`
- `POST /auth/session/login`
- `POST /auth/session/logout`
- `POST /auth/profile/signup`

### Feedback

- `GET /v1/feedback/challenge`
- `POST /v1/feedback`

### Dashboard data

- `GET /v1/overview`
- `GET /v1/leaderboard`
- `GET /v1/analytics/dashboard`
- `GET /v1/analytics/flows`
- `GET /v1/analytics/quality`
- `GET /v1/analytics/supporting-metrics`
- `GET /v1/analytics/simulator/universe`
- `GET /v1/analytics/simulator`
- `GET /v1/analytics/indicators/:slug`
- `GET /v1/analytics/indicators/:slug/strategies/:scenarioId`
- `GET /v1/stocks/:symbol`
- `GET /v1/change-heatmap`
- `GET /v1/rsi-surface`
- `GET /v1/will-surface`

### Disclosures operations

- `GET /v1/disclosures/health`
- `GET /v1/disclosures/latest-run`
- `POST /v1/disclosures/run`
- `POST /v1/disclosures/load`

### NSE FII reports operations

- `GET /v1/fii-reports/health`
- `GET /v1/fii-reports/latest-run`
- `GET /v1/fii-reports/runs`
- `GET /v1/fii-reports/runs/:kind/:runId`
- `POST /v1/fii-reports/latest`
- `POST /v1/fii-reports/backfill`
- `POST /v1/fii-reports/load`

### Discord market stream operations

- `GET /v1/discord-stream/health`
- `GET /v1/discord-stream/recent`
- `POST /v1/discord-stream/preview`
- `POST /v1/discord-stream/test`
- `POST /v1/discord-stream/dispatch`

### Backtesting

- `GET /v1/backtesting/overview`
- `GET /v1/backtesting/strategies`
- `GET /v1/backtesting/strategies/:strategyId`
- `GET /v1/backtesting/strategies/:strategyId/summary`
- `GET /v1/backtesting/strategies/:strategyId/equity`
- `GET /v1/backtesting/strategies/:strategyId/drawdown`
- `GET /v1/backtesting/strategies/:strategyId/open-positions`
- `GET /v1/backtesting/strategies/:strategyId/trades`
- `GET /v1/backtesting/strategies/:strategyId/stocks`
- `GET /v1/backtesting/strategies/:strategyId/regimes`
- `GET /v1/backtesting/daily-summary`
- `GET /v1/backtesting/compare`
- `GET /v1/backtesting/runs`

## Proxied API endpoints

The app also proxies selected upstream services through the same origin so the web bundle can stay on one host/base path.

### Export and summary APIs

These are forwarded to `nse-export-api`:

- `GET /api/v1/dashboard/*`
- `GET /api/v1/watchlists`
- `GET /api/v1/ops/*`
- `GET /api/v1/exports/*`

### Intraday intelligence APIs

These are forwarded to `nse-intraday-api`:

- `GET /api/v1/intraday/*`

### Matomo proxy

These are forwarded to the local Matomo container:

- `GET /matomo/*`
- `HEAD /matomo/*`
- `POST /matomo/*`

In production the effective tracking paths are:

- `https://m.nifty50today.co.in/n50/matomo/`
- `https://stage.nifty50today.co.in/n50-stage/matomo/`

## Option Chain service endpoints

The option chain watcher remains a separate service mounted by nginx outside the React app base path.

Public paths:

- `GET /option-chain/healthz`
- `GET /option-chain/readyz`
- `GET /option-chain/api/latest`
- `GET /option-chain/api/series`
- `GET /option-chain/api/analytics`
- `GET /option-chain/api/screenshot`

The React app route `/options` uses these APIs under the hood.

## Direct host ports still exposed locally

These are available on the machine and are useful for ops/debugging:

- Postgres: `localhost:5432`
- Collector health: `http://localhost:8080/healthz`
- Reco API: `http://localhost:8010`
- Export API: `http://localhost:8091`
- Intraday API: `http://localhost:8092`
- Disclosures API: `http://localhost:8000`
- NSE FII reports API: `http://localhost:8001`
- Matomo admin: `http://localhost:19091/`

## Auth and access notes

- Main dashboard browsing works on the public host/base path.
- Feedback submission requires a signed-in user.
- PROD and STAGE are isolated by cookie name, cookie path, and Redis DB index, while still sharing one PostgreSQL database.

## Related docs

- [Source of truth](./SOURCE_OF_TRUTH.md)
- [Current architecture](./ARCHITECTURE_CURRENT.md)
- [Current stack inventory](./stack-current.md)
- [Product surface map](./product-surface-map.md)
- [N50 stage/prod hosting](./n50-stage-prod-hosting.md)
- [Discord market stream](./discord-market-stream.md)
- [Analytics and attribution](../neon-stock-terminal/docs/analytics/README.md)
- [Options module](../neon-stock-terminal/docs/options/README.md)
- [Backtesting module](../neon-stock-terminal/docs/backtesting/README.md)
