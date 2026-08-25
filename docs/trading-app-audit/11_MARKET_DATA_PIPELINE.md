# Market data pipeline

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The repository contains SmartAPI collector/WebSocket/archive code, PostgreSQL minute bars/instruments, NSE report ingestion, an NSE option-chain watcher, Yahoo historical adapters, and a market-data gateway. Which source wins is feature-specific.

1. Collector/provider adapter receives ticks, bars, option-chain, or reports.
2. Validation normalises symbol/time/session fields.
3. Durable records are written to PostgreSQL or report artifacts.
4. Analytical workers materialise snapshots/signals.
5. Gateway routes query canonical tables/services.
6. React Query polling or WebSocket updates the UI.

Session-window suppression and unchanged-snapshot handling must be verified per collector. Corporate-action adjustment is provider/dataset-specific; never combine Yahoo split-adjusted OHLC with raw execution prices without labelling the basis.
