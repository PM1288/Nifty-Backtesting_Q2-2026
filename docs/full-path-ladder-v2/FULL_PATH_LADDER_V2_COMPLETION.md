# Full-Path Ladder V2 Completion

## Implemented

- A pure full-path evaluator scans every eligible minute bar from fill through
  D+5 without breaking on reward or adverse events.
- I030/I050/I070 are evaluated independently on D0.
- S100/S200/S500 and A050/A100/A200/A500/A1000/A_GT1000 are evaluated
  independently from fill through D+5.
- First-touch timestamp, D-stage, gap/touch type, opportunity price,
  prior/inclusive MFE/MAE and same-bar ambiguity are stored.
- Six session-close checkpoints and cumulative monotonic invariants are stored.
- A separate no-stop/no-timeout execution scenario sells at I030 on D0,
  otherwise at S100 after D0, including after D+5. It cannot rewrite D+5 facts.
- PostgreSQL migration 022 adds normalized path/event/checkpoint/scenario tables.
- Migration 023 marks V1.1/V1.2 results non-comparable and clears abandoned
  V1.1 `RUNNING` records.
- OIIS V1.3 writes consolidated CSV, JSON and Markdown artifacts in one run
  folder and persists the same facts to PostgreSQL.

## Canonical result

- Run ID: `53b5bb32-6a33-470f-9884-8613fa18ad21`
- Period: 2023-08-06 requested; 2023-08-07 through 2026-08-05 actual
- Universe: 99 current-panel symbols; TMPV excluded
- Decisions: 68,743
- Enterable signals: 23
- Accepted paths: 18 across 16 symbols
- Reward rows: 108; adverse rows: 108; checkpoints: 108
- Coverage: 18 PASS, 0 partial
- Execution: 15 I030 exits, 3 later S100 exits, 0 open
- Realised after-tax P&L: ₹7,406.4913
- Invariants: PASS
- Data warning: minute CSVs missing for `M&M` and `MAXHEALTH`; their five
  enterable signals were not fabricated or accepted.

Reward hits were I030 15, I050 12, I070 10, S100 15, S200 11 and S500 6.
Adverse hits were A050 18, A100 17, A200 14, A500 6, A1000 1 and A_GT1000 1.

This is an isolated opportunity scan, `NOT_RANKABLE / NR`, not a finite-capital
portfolio claim and not live-order authority.
