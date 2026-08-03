# Implementation Plan and Release Gates

## Architecture call

The package remains at `platform/nifty_stratlab`, matching the delivery boundary.
This is stronger than embedding new research logic in the Go collector, analytics
worker, or Node API because it keeps deterministic research compute away from live
ingestion and preserves one canonical set of contracts.

## Phase implementation status

### Phase 1 — Data foundation

Implemented: contracts, effective-dated calendars/expiry, source manifests, CSV
quality profiling, bounded workbook inspection, read-only PostgreSQL coverage,
point-in-time universe adapter, qualification/quarantine semantics, and migration.

Acceptance still requires authoritative holidays/session history and review of
WARN/FAIL sources. Workbook publication timing remains blocked.

### Phase 2 — Economics and simulator

Implemented: Decimal fee schedules, target solver, technical feature registry,
prefix-parity protection, immutable strategy manifests, finite-cash next-bar event
simulation, path policies, and fee golden vectors.

Acceptance still requires real broker contract-note reconciliation and parity with
any Go/TypeScript calculation retained in a published path.

### Phase 3 — Resumable replay

Implemented: deterministic run specs/IDs, sharding, file/PostgreSQL stores,
claim/heartbeat/checkpoint state, metrics, artifacts, and last-good publication
guard contracts.

Acceptance still requires interrupted-run/restart evidence on a representative real
dataset and a published-read-model adapter after result reconciliation.

### Phase 4 — Discovery and calibration

Implemented: executable opportunity labels, chronological purge/embargo splits,
feature association, calibrated probability evidence, and migration entities.

Production workflow must reserve a final untouched holdout before candidates are
selected. Discovered rules remain research artifacts until frozen and replayed.

### Phase 5 — Options, parity, and research packs

Implemented: point-in-time contract observations, actual-premium long-option
simulation, lot/cash rules, diagnostic Greeks/IV, batch/online parity oracle,
safe checksummed ZIP packs, and analyst response schema.

Acceptance is conditional on qualified historical option premium/contract data.
No broker order code is present or authorised.

## Integration sequence

1. Keep the live collector and current APIs unchanged.
2. Test all package code and golden vectors locally.
3. Test the five additive migrations twice against the disposable database.
4. Inspect production coverage through a read-only transaction.
5. Run only representative CSV pilots and bounded workbook structure sampling now.
6. Reconcile fee and universe behavior before switching existing daily marts.
7. Add a read-only publication adapter only after Phase 3 real-data evidence passes.
8. Run discovery after an untouched holdout is reserved.
9. Run options only over qualified actual premiums.
10. Move later to paper/shadow operation under a separate authorisation programme.

## Definition of safe completion for this integration

- Five overlays installed without replacing existing manifests or services.
- Package tests and all five smoke tests pass in a clean environment.
- Central migrations pass first and idempotent second application on a disposable DB.
- Production DB is inspected read-only and never migrated automatically.
- Workbook is structure/sampled only.
- Compose and shell configuration validate.
- Every command, result, decision, rollback path, and blocker appears in handoff docs.
