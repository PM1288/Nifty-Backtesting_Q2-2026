# ADR-009: Institutional Flow Ingestion Pipeline

## Status
Accepted

## Context
The repo already contains `services/nse_ingestor`, a PostgreSQL-based NSE EOD pipeline focused on archive ingestion into normalized relational tables. A separate requirement now exists for a research-friendly institutional-flow ingestion system that:

- preserves raw exchange files for auditability,
- writes curated parquet outputs,
- keeps its own ingestion/completeness/capability registry,
- uses DuckDB as the default analytical warehouse,
- supports five-year backfill and daily 08:10 IST repair runs,
- classifies public-source gaps explicitly.

This new service needs a clean separation from the live app/runtime services and from the legacy Postgres ingestor so it can evolve independently without changing current production behavior.

## Decision
Create a new standalone Python service at:

`services/institutional_flow_ingest`

This service will:

- use medallion-style local storage (`raw/`, `staging/`, `curated/`, `warehouse/market_data.duckdb`),
- manage its own `ingestion_registry`, `dataset_completeness`, and `source_capabilities` in DuckDB,
- prefer official NSE/BSE public sources only,
- use browser-assisted fallback only as a source adapter extension point,
- implement Phase 1 with production-grade core ingestion for NSE FII/DII and NSE CM bhavcopy,
- add additional Tier 1/Tier 2 datasets modularly with capability classification when unavailable.

## Consequences
### Positive
- Does not destabilize the existing `nse_ingestor` or live product stack.
- Keeps raw files and curated analytical outputs together for operator/debugging use.
- Makes public-source limitations explicit and machine-readable.
- Supports safe reruns, late-arrival repair, and five-year backfill planning.

### Negative
- Introduces a second ingestion service in the repo.
- Some dataset overlap with `nse_ingestor` will exist until ownership is rationalized later.
- Some source discovery behavior will remain brittle where NSE/BSE pages are JS-heavy or change DOM structure.

## Deferred
- Full replacement or consolidation of `services/nse_ingestor`.
- S3/object-storage backend.
- Full production scheduler/deployment wiring into root `docker-compose.yml`.
- Complete implementation of every Tier 1/Tier 2 dataset if source verification remains incomplete.
