## Status
Accepted

## Context
`services/institutional_flow_ingest` was initially scaffolded as a self-contained DuckDB/parquet pipeline. The current stack already runs a shared PostgreSQL service in `docker-compose.yml`, and the operational requirement for this service is:

- use the existing stack Postgres instance
- keep raw/staging files local only long enough to validate and normalize them
- log every loaded file and dataset action centrally
- delete downloaded payloads after successful load to save disk space

DuckDB was fine for local analytics prototyping, but it created an isolated operational island with no stack-level visibility and no shared audit trail.

## Decision
`services/institutional_flow_ingest` now uses the stack PostgreSQL instance for:

- ingestion registry tables
- source capability tracking
- completeness tracking
- raw file audit/version records
- normalized analytical tables
- derived analytical views

Local filesystem storage remains in place only for transient execution needs:

- `raw/` for downloaded payloads
- `staging/` for temporary extraction
- `curated/` only when explicitly retained
- `logs/` and `run_reports/` for operator artifacts

By default:

- `MIF_RETAIN_RAW_FILES=false`
- `MIF_RETAIN_CURATED_FILES=false`

After successful normalization and audit logging, raw files are deleted to minimize persistent disk usage.

## Consequences
Positive:

- one authoritative operational datastore for the stack
- easier inspection and backup via existing PostgreSQL tooling
- central auditability of downloaded files even after local cleanup
- simpler integration into `docker-compose`

Trade-offs:

- the service now depends on PostgreSQL availability
- tests need a lightweight SQLite-compatible path or a live Postgres integration path
- analytical locality benefits of DuckDB are traded for integration and audit consistency

## Notes
The service remains storage-aware rather than storage-complete. Raw file retention can still be enabled per environment when forensic preservation is required, but disk-saving defaults are now aligned with the stack’s operational goals.
