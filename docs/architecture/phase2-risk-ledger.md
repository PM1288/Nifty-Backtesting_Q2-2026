# Phase 2 DB And Startup Risk Ledger

Last reviewed: 2026-04-03

This document records the database-capacity ledger and the startup/readiness issues intentionally deferred to later phases. Phase 2 isolates deployment layers; it does not redesign pool sizing or solve startup ordering.

## DB Connection-Budget Ledger

Postgres still starts with `max_connections=50`.

### Explicit pool ceilings visible in the current configuration

| Service | Current cap evidence | Worst-case connections | Included in prod-like runtime? | Notes |
|---|---|---|---|---|
| `option-chain-watcher` | no explicit pool env found in compose | unknown | yes | keep as uncapped risk until Phase 6 |
| `nse-orchestrator` | `DB_POOL_SIZE=4` | 4 | yes | export/orchestration codebase |
| `nse-export-api` | `DB_POOL_SIZE=4` | 4 | yes | same codebase as orchestrator |
| `nse-intraday-api` | `DB_POOL_SIZE=4` | 4 | yes | intraday API |
| `nse-intraday-scheduler` | `DB_POOL_SIZE=4` | 4 | yes | intraday scheduler |
| `nse-reco-api` | `DB_POOL_SIZE=4`, `DB_POOL_MAX_OVERFLOW=2` | 6 | yes | reco API |
| `nse-reco-scheduler` | `DB_POOL_SIZE=4`, `DB_POOL_MAX_OVERFLOW=2` | 6 | yes | reco scheduler |
| `n50-dashboard` | `connection_limit=2` | 2 | yes | dashboard server DB client |
| `nse_ingestor` | no explicit pool env found in compose | unknown | yes | needs explicit budget in Phase 6 |
| `nse-analytics-worker` | no explicit pool env found in compose | unknown | yes | needs explicit budget in Phase 6 |
| `market-data-gateway` | no explicit pool env found in compose | unknown | yes | may not use Postgres for all flows; still uncapped from compose evidence |

### Prod-like explicit subtotal

- Explicitly capped prod-like subtotal: `32`
- Postgres `max_connections`: `50`
- Remaining headroom before counting uncapped services: `18`

### Baseline full-stack comparison

The Phase 1 baseline estimated approximately `41` explicit connections for the full mixed stack before counting uncapped services. The prod-like topology is smaller because stage and legacy services are no longer part of the default path, but Phase 6 still needs to:

- cap the uncapped services
- decide whether schedulers should share smaller pools
- confirm whether any connection multipliers are hidden inside app defaults

## Deferred Readiness And Startup Risks

### `service_started` chains that still need real readiness in Phase 5

- `nse-analytics-worker` -> `nse_ingestor`
- `nse-orchestrator` -> `nse_ingestor`
- `nse-orchestrator` -> `nse-analytics-worker`
- `nse-export-api` -> `nse-orchestrator`
- `nse-intraday-api` -> `nse-orchestrator`
- `nse-intraday-scheduler` -> `nse-intraday-api`
- `nse-reco-api` -> `nse-intraday-api`
- `nse-reco-scheduler` -> `nse-reco-api`
- `n50-dashboard` -> `nse-reco-api`
- `n50-dashboard` -> `market-data-gateway`

### Install/migration-on-start patterns still present

- `option-chain-watcher`: `NSE_OC_RUN_MIGRATIONS_ON_START`
- `nse-orchestrator`: `INSTALL_SQL_ON_START`
- `nse-export-api`: `INSTALL_SQL_ON_START`
- `nse-intraday-api`: `INSTALL_SQL_ON_START`
- `nse-intraday-scheduler`: `INSTALL_SQL_ON_START`
- `nse-reco-api`: `INSTALL_SQL_ON_START`
- `nse-reco-scheduler`: `INSTALL_SQL_ON_START`

### Bind-mount and build-context issues intentionally deferred

- Several backend services still build from repo-root contexts. That remains for Phase 3 image/build cleanup.
- Runtime bind mounts remain in place for many services. That remains for Phase 4 immutability work.

## `nse-reco-scheduler` Observation

Known baseline risk:

- Before Phase 2, `nse-reco-scheduler` had shown at least one restart/recreation symptom during stack bring-up.

Phase 2 observation:

- In the prod-like `base + core` startup used for verification, `nse-reco-scheduler` reached `running` state with restart count `0`.
- No additional restart-loop masking was added in this phase.

What this means:

- The service is stable enough for the single Phase 2 verification startup.
- It has not been fully validated under repeated cold-start or restart churn.
- Phase 5 still needs explicit restart/retry/readiness hardening and should treat `nse-reco-scheduler` as a watch item.
