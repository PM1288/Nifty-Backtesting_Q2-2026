# ADR-004: Centralized Migration Flow and Schema Ownership

## Status

Accepted

## Context

The repo currently mutates PostgreSQL schema from multiple places:

- Go collector embedded migrations
- Python package SQL loaders
- Node API runtime table creation
- option-chain watcher startup migrations
- limited Prisma usage without committed Prisma migration history

This makes production behavior hard to reason about, and some user-facing services can currently create or alter tables on boot or on first request.

## Decision

- Define schema ownership explicitly in `db/SCHEMA_OWNERSHIP.md`.
- Define one migration execution order in `db/MIGRATION_STRATEGY.md`.
- Add a root migration runner at `scripts/db_migrate_all.sh`.
- Disable silent startup-time DDL by default for:
  - Node API runtime helpers
  - Node API startup performance/index DDL
  - option-chain watcher startup
  - intraday intelligence startup SQL
  - orchestration exports startup SQL
- Keep transitional DDL paths behind explicit non-default flags while the repo still has mixed migration technologies.
- Assign `nse_app.backtest_*` ownership to the analytics worker and keep the Node API read-only for that table family.

## Consequences

### Positive

- Operators can tell what mutates which schema and in what order.
- Production deploys no longer rely on user-facing services silently patching schema.
- Clean bootstrap remains possible through an explicit runner.

### Negative

- There is still no single migration technology across the stack.
- Node API and option-chain watcher remain transitional owners until Phase 2 consolidation moves them to explicit committed migration packages.
- Local compose operators must keep persisted Postgres credentials aligned with the sanitized repo `.env` or override them explicitly during startup.

## Deferred

- Converting all Python SQL packages to a shared migration ledger
- Moving option-chain tables to a dedicated schema
- Converting API-owned operational tables to committed Prisma or SQL migrations
