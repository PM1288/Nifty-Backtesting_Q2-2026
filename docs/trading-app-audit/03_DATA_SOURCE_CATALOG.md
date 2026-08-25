# Data source catalog

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

| Provider/system | Code evidence count | Runtime status |
| --- | --- | --- |
| SmartAPI / Angel One | 64 | UNVERIFIED unless separately identified in the runtime audit |
| NSE | 80 | UNVERIFIED unless separately identified in the runtime audit |
| Yahoo Finance | 50 | UNVERIFIED unless separately identified in the runtime audit |
| Redis | 80 | UNVERIFIED unless separately identified in the runtime audit |
| PostgreSQL | 80 | UNVERIFIED unless separately identified in the runtime audit |
| CDSL | 19 | UNVERIFIED unless separately identified in the runtime audit |
| Firebase | 31 | UNVERIFIED unless separately identified in the runtime audit |
| n8n webhook | 80 | UNVERIFIED unless separately identified in the runtime audit |
| Discord | 38 | UNVERIFIED unless separately identified in the runtime audit |


A provider keyword in source proves an integration surface exists; it does not prove the route currently uses it or that credentials/data are healthy. Follow each evidence entry in [data-source-map.json](evidence/data-source-map.json), then confirm with runtime source timestamps and service health.

<!-- RUNTIME_AUDIT_START -->
## Source-by-source operational interpretation

| Provider/system | Purpose | Frequency | Authentication | Expected delay | Fields/timezone/cache/retry | Accuracy status | Code evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SmartAPI / Angel One | Live broker market/instrument ingestion and archive paths | Streaming/event-driven where enabled | Broker credentials/service-token boundary | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | cmd/collector/archive_test.go:8, cmd/collector/depth_snapshots.go:11, cmd/collector/health.go:79, cmd/collector/main.go:24, cmd/collector/refresh.go:11, cmd/collector/seed_prices.go:10, cmd/collector/stock_webhook.go:16, cmd/collector/stock_webhook_test.go:41 |
| NSE | Exchange reports, bhavcopy, option chain, derivatives and reference data | Daily and intraday feature-specific schedules | Exchange access/session/report availability | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0/OIIS_DOE_Experiment_Config.json:181, bhavcopy_ingest.py:15, cmd/collector/archive_test.go:14, cmd/collector/health.go:75, cmd/collector/metrics.go:406, cmd/collector/session_phase_test.go:25, cmd/collector/stock_webhook_test.go:18, cmd/collector/subscriptions_test.go:10 |
| Yahoo Finance | Historical split-adjusted OHLC research/backfill | On-demand or scheduled backfill | Provider corrections, adjustment basis and availability | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | db/sql/025_nifty50_yfinance_daily_regime.sql:14, db/sql/026_nifty500_stock_daily_regime.sql:7, db/sql/027_global_market_daily_regime.sql:5, docs/trading-app-audit/evidence/data-source-map.json:392, docs/trading-app-audit/evidence/function-map.json:30272, docs/trading-app-audit/evidence/mock-placeholder-map.json:16648, docs/trading-app-audit/evidence/postgres-runtime-catalog.json:81865, docs/trading-app-audit/evidence/source-manifest.json:483 |
| Redis | Cache/realtime coordination | Event/TTL specific | Internal Compose service | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | .gitleaks.toml:9, compose/compose.base.yml:87, compose/compose.core.yml:36, compose/compose.dev.yml:270, compose/compose.stage.yml:36, docker-compose.yml:160, docs/trading-app-audit/evidence/data-source-map.json:797, docs/trading-app-audit/evidence/function-map.json:2530 |
| PostgreSQL | Canonical durable market, strategy and paper records | Writer-specific | Internal database roles/DSNs | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | cmd/backtest/main.go:60, cmd/collector/main.go:56, cmd/equilibrium/main.go:44, cmd/maxpain/main.go:44, cmd/rsiwillr/main.go:45, cmd/strategy/main.go:44, cmd/watchlist/main.go:46, compose/compose.base.yml:56 |
| CDSL | Institutional/FII daily inputs | Daily workflow | Report publication availability | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | compose/compose.core.yml:201, compose/compose.dev.yml:566, compose/compose.stage.yml:189, docs/modernisation/baseline/data-preservation-manifest-final.json:254, docs/modernisation/baseline/data-preservation-manifest-post.json:254, docs/modernisation/baseline/data-preservation-manifest-pre.json:254, docs/trading-app-audit/evidence/data-source-map.json:1449, docs/trading-app-audit/evidence/function-map.json:31217 |
| Firebase | User authentication and mobile notification delivery | Session/event driven | Firebase service credentials outside frontend | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | compose/compose.core.yml:14, compose/compose.dev.yml:248, compose/compose.stage.yml:14, docker-compose.yml:769, docs/trading-app-audit/evidence/data-source-map.json:1531, docs/trading-app-audit/evidence/function-map.json:3468, docs/trading-app-audit/evidence/postgres-runtime-catalog.json:15462, docs/trading-app-audit/evidence/runtime-audit.json:48 |
| n8n webhook | Operational/WhatsApp webhook delivery | Event and scheduled workflows | Webhook token/URL boundary | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | cmd/collector/stock_webhook.go:20, cmd/collector/stock_webhook_test.go:15, cmd/collector/tasks.go:247, compose/compose.base.yml:380, compose/compose.core.yml:37, compose/compose.dev.yml:271, compose/compose.market-status.yml:13, compose/compose.oiis-live.yml:16 |
| Discord | Market stream notification/dispatch channel | Scheduled/event driven | Bot/webhook credential boundary | UNVERIFIED per feature | Inspect linked adapter/config; no cross-feature default is assumed | UNVERIFIED until source timestamp and reconciliation pass | compose/compose.core.yml:39, compose/compose.dev.yml:273, compose/compose.stage.yml:39, config.example.yaml:492, db/sql/013_discord_market_stream.sql:3, discord_market_stream_design_pack/discord_market_stream_design_pack/config/alert-policy.example.yaml:5, discord_market_stream_design_pack/discord_market_stream_design_pack/config/discord-layout.example.yaml:54, discord_market_stream_design_pack/discord_market_stream_design_pack/schemas/discord_embed_payload.schema.json:3 |


This table intentionally avoids one global refresh claim: the same provider is used by daily jobs, intraday collectors, and historical backfills with different schedules.
<!-- RUNTIME_AUDIT_END -->
