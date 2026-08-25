# Application architecture

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Technology inventory

| Layer | Technology | Evidence |
| --- | --- | --- |
| Web UI | React 18, TypeScript, Vite 5 | `neon-stock-terminal/apps/web/package.json` |
| Query/state | TanStack React Query plus React context/local state | `apps/web/src/lib/hooks.ts`, component hooks |
| Charts | Apache ECharts 6 and custom SVG/DOM visuals | web package and visual components |
| Gateway API | Express 4, TypeScript, Zod | `apps/api/package.json` |
| ORM/store | Prisma plus direct PostgreSQL SQL | API package, SQL migrations, service adapters |
| Realtime/cache | WebSocket and Redis | `apps/api/src/ws/stream.ts`, Redis dependency |
| Core collector | Go | root `go.mod`, `cmd/collector`, `internal/*` |
| Strategy/services | Python/FastAPI workers | `services/*/pyproject.toml` and source |
| Deployment | Docker Compose/Nginx | `compose/*`, `docker-compose.yml` |
| Tests | Node test runner, pytest, Go test, Playwright | source test inventory |

## Service/package inventory

| Service | Languages | Source files | Declared endpoints | Tests | Package evidence |
| --- | --- | --- | --- | --- | --- |
| bff | TypeScript/JavaScript | 4 | 0 | 0 | services/bff/package.json |
| cdsl_fii_daily_ingest | Python | 7 | 0 | 0 | — |
| fno_volatility | Python | 8 | 0 | 1 | services/fno_volatility/pyproject.toml |
| institutional_flow_ingest | Python | 75 | 0 | 8 | services/institutional_flow_ingest/pyproject.toml |
| lite-dashboard | TypeScript/JavaScript | 2 | 11 | 0 | services/lite-dashboard/package.json |
| market_data_gateway | Python | 2 | 14 | 0 | — |
| market_status | Python | 16 | 0 | 5 | services/market_status/pyproject.toml |
| nifty-parrot-premium | TypeScript/JavaScript | 28 | 6 | 0 | services/nifty-parrot-premium/client/package.json, services/nifty-parrot-premium/package.json, services/nifty-parrot-premium/server/package.json |
| nifty100_disclosures_pipeline | Python | 21 | 8 | 6 | services/nifty100_disclosures_pipeline/pyproject.toml |
| nse_analytics_worker | Python | 40 | 0 | 3 | — |
| nse_fii_reports_service | Python | 23 | 14 | 7 | services/nse_fii_reports_service/pyproject.toml |
| nse_ingestor | Python | 26 | 0 | 5 | — |
| nse_intraday_intelligence | Python, TypeScript/JavaScript | 50 | 2 | 0 | services/nse_intraday_intelligence/pyproject.toml |
| nse_orchestration_exports | Python, TypeScript/JavaScript | 42 | 2 | 0 | services/nse_orchestration_exports/pyproject.toml |
| nse_premium_cockpit | Python, TypeScript/JavaScript | 42 | 8 | 2 | services/nse_premium_cockpit/pyproject.toml |
| nse_reco_state_engine | Python | 50 | 2 | 5 | services/nse_reco_state_engine/pyproject.toml |
| oiis_live | Python | 10 | 0 | 3 | services/oiis_live/pyproject.toml |
| option-chain-watcher | TypeScript/JavaScript | 19 | 0 | 2 | services/option-chain-watcher/package.json |
| paper_trading | Python, TypeScript/JavaScript | 4855 | 134 | 64 | services/paper_trading/pyproject.toml |
| realtime-engine | Python | 7 | 6 | 0 | — |
| rolling_monthly | Python | 12 | 0 | 3 | services/rolling_monthly/pyproject.toml |


## Deployment boundary

The versioned source is this repository. The live Compose integration directory is `/home/novius2/trading-stack`. Drift is possible; screenshot/runtime evidence records the observed deployment, while file links resolve to the versioned source.

See [application-architecture.mmd](diagrams/application-architecture.mmd).
