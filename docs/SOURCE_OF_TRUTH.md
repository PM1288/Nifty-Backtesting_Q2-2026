# Source of Truth for the N50 Stack

Last reviewed: 2026-03-31

This is the starting point for engineers, operators, and reviewers who need the current deployed shape of the N50 product.

If multiple docs appear to disagree, trust them in this order:

1. Running code and active config
   - `docker-compose.yml`
   - `compose/nginx/nginx.conf`
   - `neon-stock-terminal/apps/web/src/App.tsx`
   - `neon-stock-terminal/apps/api/src/server.ts`
2. Current-state docs
   - [Architecture current](./ARCHITECTURE_CURRENT.md)
   - [Endpoints reference](./endpoints.md)
   - [Current stack inventory](./stack-current.md)
   - [Product surface map](./product-surface-map.md)
   - [Stage / prod hosting](./n50-stage-prod-hosting.md)
3. Operational ownership docs
   - [Schema ownership](../db/SCHEMA_OWNERSHIP.md)
   - [Migration strategy](../db/MIGRATION_STRATEGY.md)
   - [Performance baseline](./perf/PERF_BASELINE.md)
   - [DB retention and capacity](./perf/DB_RETENTION_AND_CAPACITY.md)
4. Module-specific docs
   - [Neon Stock Terminal module README](../neon-stock-terminal/README.md)
   - `neon-stock-terminal/docs/*`
5. Historical / legacy docs
   - [Historical architecture note](./ARCHITECTURE.md)
   - [Historic stack inventory (2026-03-13)](./stack-container-inventory-2026-03-13.md)
   - [Legacy Grafana note](./grafana.md)
   - [Historical build brief](./codex-summary.md)
   - `docs/phase-*.md`

## Start here

Use this reading order when resuming work:

1. [README](../README.md)
2. [Source of truth](./SOURCE_OF_TRUTH.md)
3. [Architecture current](./ARCHITECTURE_CURRENT.md)
4. [Endpoints reference](./endpoints.md)
5. [Current stack inventory](./stack-current.md)
6. [Product surface map](./product-surface-map.md)
7. [Stage / prod hosting](./n50-stage-prod-hosting.md)
8. [Schema ownership](../db/SCHEMA_OWNERSHIP.md)
9. [Migration strategy](../db/MIGRATION_STRATEGY.md)
10. [NIFTY StratLab integration](./nifty-stratlab/README.md)
11. [Backtesting and training dashboard architecture](./BACKTESTING_DASHBOARD_ARCHITECTURE.md)

## What each current doc answers

| Question | Current doc |
|---|---|
| What is the deployed system right now? | [ARCHITECTURE_CURRENT.md](./ARCHITECTURE_CURRENT.md) |
| Which public and same-origin routes exist? | [endpoints.md](./endpoints.md) |
| Which services are in the live stack? | [stack-current.md](./stack-current.md) |
| Which user-facing pages and interactions exist? | [product-surface-map.md](./product-surface-map.md) |
| How do prod and stage coexist on one machine? | [n50-stage-prod-hosting.md](./n50-stage-prod-hosting.md) |
| Who owns schema and migrations? | [../db/SCHEMA_OWNERSHIP.md](../db/SCHEMA_OWNERSHIP.md), [../db/MIGRATION_STRATEGY.md](../db/MIGRATION_STRATEGY.md) |
| How does data freshness / retention / performance work? | [perf/PERF_BASELINE.md](./perf/PERF_BASELINE.md), [perf/DB_RETENTION_AND_CAPACITY.md](./perf/DB_RETENTION_AND_CAPACITY.md) |
| How is governed research/backtesting integrated? | [nifty-stratlab/README.md](./nifty-stratlab/README.md) |
| How do I add a strategy, result mart, or dashboard? | [BACKTESTING_DASHBOARD_ARCHITECTURE.md](./BACKTESTING_DASHBOARD_ARCHITECTURE.md) |

## Current diagrams

- [System context](./diagrams/system-context.mmd)
- [Request flow](./diagrams/request-flow.mmd)
- [Data lifecycle](./diagrams/data-lifecycle.mmd)
- [Stage / prod topology](./diagrams/stage-prod-topology.mmd)
- [User navigation flow](./diagrams/user-navigation-flow.mmd)

## Historical docs status

The following docs remain useful, but they are not authoritative for the live N50 stack:

- `docs/ARCHITECTURE.md`
  - older generic architecture summary
- `docs/stack-container-inventory-2026-03-13.md`
  - dated inventory snapshot
- `docs/grafana.md`
  - legacy/optional observability note; Grafana is not part of the current public stack
- `docs/codex-summary.md`
  - historical implementation brief, not a current-state doc
- `docs/phase-1.md` to `docs/phase-4.md`
  - phased implementation specs and history, not live deployment guides
