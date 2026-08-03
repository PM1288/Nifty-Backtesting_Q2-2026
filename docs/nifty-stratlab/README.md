# NIFTY StratLab Integration

This directory is the human and agent entrypoint for the five-phase NIFTY research,
backtesting, discovery, option-research, and analyst-pack platform integrated into
the live trading stack.

## Reading order

1. `DOCUMENT_REVIEW.md` — what every supplied document/archive means and conflicts found.
2. `IMPLEMENTATION_PLAN.md` — phased architecture, boundaries, and release gates.
3. `DATABASE_INTEGRATION.md` — real PostgreSQL mapping and safe migration workflow.
4. `RUNBOOK.md` — copy/paste commands for install, tests, smoke, pilots, and recovery.
5. `AGENT_HANDOFF.md` — current status, exact evidence, blockers, and next tasks.
6. `COMMAND_LOG.md` — chronological commands and outcomes from this integration.
7. `v2/README.md` — V2.0 playbook review, frozen CLI, evidence status, and blockers.
8. `PRODUCTION_DEPLOYMENT.md` — active bounded run, database identity, and repeat commands.

## Code locations

- Canonical package: `platform/nifty_stratlab`
- Central migrations: `db/sql/014_nifty_stratlab_foundation.sql` through `019_nifty_stratlab_runtime_hardening.sql`
- Test wrapper: `scripts/nifty_stratlab_test.sh`
- Disposable migration wrapper: `scripts/nifty_stratlab_migrate_test.sh`
- One-off compose job: `nifty-stratlab` in `compose/compose.jobs.yml`

## Non-negotiable boundary

This platform performs research and produces evidence. It does not place broker
orders. The SmartAPI collector remains the live ingestion owner. The existing
`nse_app` backtesting marts remain the user-facing published read model until
row-level reconciliation and an explicit adapter release are complete.
