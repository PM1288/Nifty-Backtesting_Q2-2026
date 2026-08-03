# Agent Handoff

## Current outcome

The complete five-phase reference implementation is integrated additively into the
real `/home/novius2/trading-stack` under `platform/nifty_stratlab`. Root migration
ownership, a compose job, executable test/migration wrappers, bounded data tools,
section READMEs, ADR, source review, database mapping, runbook, and command evidence
are present.

The V2.0 all-phases playbook/handoff has also been reviewed. Its 49-command frozen
CLI is exposed with fail-closed acceptance gates, and all 50 criteria are represented
in a machine-readable audit. See `docs/nifty-stratlab/v2/README.md`; do not confuse
22 evidenced criteria with human phase acceptance.

The trading-stack root is not a Git repository. Do not claim a commit hash. Recovery
uses the initial-file backup plus `ROLLBACK.md` for later additive edits:

```text
/home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z/
```

## Verification summary

| Check | Result |
| --- | --- |
| Five ZIP overlays | PASS, sequential, no overwrite |
| ZIP integrity | PASS for every reviewed ZIP |
| Clean Python package tests | 28 passed after deterministic-pack and V2 tests |
| Phase smoke tests 1–5 | PASS |
| Shell syntax | PASS |
| Compose jobs configuration | PASS |
| Disposable migrations first pass | PASS |
| Disposable migrations second/idempotent pass | PASS |
| Package container build | PASS, 6.05 kB context after fix |
| Production coverage inspection | PASS, read-only |
| Explicit five-CSV pilot | 4 WARN, 1 QUARANTINED |
| Bounded workbook inspection | WARN, seven sheets, maximum 25 sampled rows/sheet |
| Production migration | PASS, additive 014–019 applied and reapplied |
| Broker order placement | NOT ADDED |

## Critical findings

1. The effective-dated universe table is not historically usable: 10,100 open-ended
   rows represent 100 symbols and coverage starts 2026-01-09. Strict reads now fail
   closed; diagnostic dedupe yields 100 latest rows.
2. The existing analytics worker uses current members and a silent embedded delivery-
   charge fallback. It remains a legacy published path pending reconciliation.
3. `public.option_greeks` lagged option-chain capture by several days on review.
4. India VIX pilot data contains 2,547 invalid OHLC relationships and is quarantined.
5. The example calendar lacks authoritative holidays and pre-2000 sessions.
6. The workbook lacks an approved publication-time/`available_at` rule and was not
   fully processed.

## Operational production state

The owner-authorised bounded deployment is live in `tradingdb`. Publication key
`research:rsi_1m_daily45_v1:RELIANCE` points to validated run
`run_73281f76f5923e14d832ea232650e66a`: 150 signals, 75 trades, 24,375 equity points,
zero accounting failures, and deterministic research-pack hash
`f071297ec7319d5cc82afadfceee7957468133901b3e45998cc1149457bbaed5`.

Two intermediate zero-result runs exposed a global-ID/weak-count-validation defect.
They were backed up and corrected to `failed/failed`; the publication guard rejects
them. Result IDs are now run-scoped and validation requires exact expected counts.
The active run was then repeated idempotently with the same pack hash and one shard
attempt. Collector, PostgreSQL, option watcher, and gateway remained healthy.

## Exact RSI strategy evidence

`rsi_1m_daily45_v1` is separate from the older RSI/Williams strategy. It buys at
the next 1-minute open after RSI(14) <30, provided the prior completed daily RSI(14)
is >45, and sells at the next 1-minute open after RSI(14) >70. The daily feature is
shifted one full session and has a mutation test against look-ahead. Target and stop
exits are disabled for this exact rule test.

The bounded RELIANCE run for 2025-05-01 through 2025-07-31 processed 24,375 regular-
session bars: 75 closed trades, 34.67% wins, -₹38,064.69 TEST_ONLY net P&L, -4.04%
maximum drawdown, and zero open positions. Every exit reason was
`strategy_exit_next_open`. The verified report is at
`platform/nifty_stratlab/outputs/rsi_1m_daily45_reliance_20250501_20250731`.

This proves the rule, simulator path, cost application, metrics, loose reports,
artifact checksums, and research-pack ZIP work on one real source. It does not prove
profitability, historical-universe readiness, or broker-fee accuracy.

## Files by ownership

### Canonical platform

- `platform/nifty_stratlab/**`

### Central database/deployment

- `db/sql/014_nifty_stratlab_foundation.sql`
- `db/sql/015_nifty_stratlab_economics.sql`
- `db/sql/016_nifty_stratlab_replay.sql`
- `db/sql/017_nifty_stratlab_discovery.sql`
- `db/sql/018_nifty_stratlab_options.sql`
- `scripts/db_migrate_all.sh`
- `scripts/nifty_stratlab_test.sh`
- `scripts/nifty_stratlab_migrate_test.sh`
- `compose/compose.jobs.yml`
- `Makefile`

### Human/agent documentation

- `docs/nifty-stratlab/**`
- `docs/adr/ADR-012-nifty-stratlab-bounded-research-platform.md`
- updates to root README, current architecture/source-of-truth, schema ownership,
  and migration strategy.

## Next tasks in strict order

### Task 1 — Repair historical universe source

Owner boundary: `services/nse_intraday_intelligence` membership loader and its SQL.

1. Determine whether each dated row is a snapshot or a true membership event.
2. Close superseded intervals or build a snapshot-as-of view with one row/symbol/date.
3. Backfill NIFTY 50/100 membership for the intended historical window from a licensed
   source.
4. Add overlap, count, and effective-date tests.
5. Re-run strict `point_in_time_universe`; do not enable diagnostic dedupe in research.

### Task 2 — Freeze authoritative market rules

Owner boundary: `platform/nifty_stratlab/config` and calendar tests.

Load NSE holidays, special sessions, historical session changes, expiry-rule changes,
tick sizes, and lot sizes with source references. Re-run CSV pilots before full data.

### Task 3 — Broker economics reconciliation

Owner boundary: `platform/nifty_stratlab/costs`, golden vectors, then adapters.

Use sanitised contract notes for intraday and delivery. Freeze a fee profile, compare
canonical results with Go and analytics-worker results, then remove the worker's
dynamic/silent fallback only after exact parity evidence.

### Task 4 — Real-data replay ladder

Run levels 1–3 first: synthetic, one stock/five days, five stocks/three months. Save
signals, fills, charges, P&L, cash, quality, and checksums. Then test interruption and
resume. Do not start ten-year/all-market replay before prior gates pass.

### Task 5 — Publication adapter

Only after replay reconciliation, map last-good canonical `research/simulation`
results into the existing `nse_app` API read model. Keep the API snapshot reader;
do not make page requests trigger raw backtests.

### Task 6 — Discovery and options

Reserve the untouched holdout before discovery. For options, qualify actual contract
and premium history, enforce freshness, and use Greeks only diagnostically. Continue
to prohibit broker orders.

## Copy/paste resume command

```bash
cd /home/novius2/trading-stack
sed -n '1,320p' docs/nifty-stratlab/AGENT_HANDOFF.md
./scripts/nifty_stratlab_test.sh
./scripts/nifty_stratlab_migrate_test.sh
```

Before changing a delivered file, verify the non-Git baseline:

```bash
cd /home/novius2/trading-stack
sha256sum -c docs/nifty-stratlab/CHANGE_MANIFEST.sha256
```

The pre-change recovery snapshot is
`/home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z`.

## 2026-08-02 — Test-Strat RSI15/Daily40 bounded review runner

Reviewed all three outer Test-Strat files, the complete DOCX body, and all 56 ZIP
entries. ZIP integrity and its internal SHA-256 manifest passed. The exact contract
is daily RSI(D-1)>40, first 1m RSI<15 entry, RSI>70 exit, next-open execution,
14:45 entry cut-off, 15:15 forced-exit decision, one trade/day, no carry, ₹500 as
evaluation only, and 2.5 bps per-side slippage.

The canonical RSI calculation was corrected from an ambiguous pandas EWM seed to
explicit `rsi_wilder_sma_seed_v1`. The canonical strategy/simulator now support
the required entry window, one-entry-per-day state, forced exit, and explicit exit
reason. Added the bounded runner, executable human wrapper, HTML report, three SVG
charts, validation/timing/quality/P-Diagram evidence, CSVs, and checksums.

Evidence:

- `docs/nifty-stratlab/RSI15_DAILY40_IMPLEMENTATION_COMPLETION.md`
- `docs/nifty-stratlab/RSI15_DAILY40_EVIDENCE_INDEX.md`
- golden artifact `platform/nifty_stratlab/artifacts/backtests/rsi15_daily40_golden_20260802T171109Z`
- RELIANCE five-session artifact `platform/nifty_stratlab/artifacts/backtests/rsi15_daily40_RELIANCE_2025-07-01_2025-07-07_20260802T171135Z`

Results: supplied golden 10/10, canonical golden validated with one trade and
₹2,364.54 TEST_ONLY net P&L, real five-session smoke validated with one trade and
−₹165.06 net P&L, all report/checksum checks passed, and 29 repository tests passed.
No full-history run, DB write, publication, or broker order occurred.

Resume/go command:

```bash
cd /home/novius2/trading-stack/platform/nifty_stratlab
./scripts/run_rsi15_daily40.sh check
./scripts/run_rsi15_daily40.sh run RELIANCE 2025-01-01 2025-12-31 \
  /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv
./scripts/run_rsi15_daily40.sh last
```

The larger multi-symbol/full-history/UI/resume/broker-reconciliation items in the
starter specification remain explicit later gates; see the completion document.
