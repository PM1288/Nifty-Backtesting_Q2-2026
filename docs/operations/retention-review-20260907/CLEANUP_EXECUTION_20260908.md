# Production cleanup execution — 8 September 2026

## Outcome

The bounded production cleanup completed. PostgreSQL decreased from
`408,212,880,407` bytes (380.18 GiB) to `176,482,483,223` bytes (164.36 GiB):
**231,730,397,184 bytes / 215.82 GiB reclaimed from the database**. The database
volume is now 166 GiB on disk and the host has 974 GiB available.

The user explicitly directed execution without a new backup. A dump started
before that instruction was cancelled, never verified or used, and its 11 GiB
artifact was removed. Each deletion manifest row therefore records
`USER_DECLINED_BACKUP`. These committed objects cannot be restored from a fresh
8 September recovery copy.

## What was deleted

Sixteen exact relations/partitions were retired without `CASCADE`. The durable
database record is `operations.retired_relation_manifest`.

| Group | Objects | Rows | Bytes before |
| --- | ---: | ---: | ---: |
| Old derived minute indicators | 1 | 88,181,575 | 46,501,691,392 |
| Superseded 8 August migration copies | 7 | 24,548,102 | 7,769,423,872 |
| June/July minute, index-OI and Greeks partitions | 6 | 10,092,091 | 2,335,727,616 |
| August raw market ticks and depth metrics | 2 | 299,325,789 | 175,406,661,632 |
| **Database manifest total** | **16** | **422,147,557** | **232,013,504,512** |

The database manifest is authoritative for exact per-object rows and bytes. The
summary deliberately distinguishes object bytes from net database-size change,
because normal live ingestion continued during the operation.

Removed objects:

- `research.security_minute_technical` (derived indicators only; no OHLCV).
- Seven tables under `migration_backup_20260808`.
- `public.bars_1m_2026_06`, `public.bars_1m_2026_07`.
- June/July `oi_snapshots_index` and `option_greeks` partitions.
- `public.market_ticks_2026_08` and `public.depth_5_metrics_2026_08`.

## What was preserved

- `public.bars_1d`: 217,841 rows, 9 January 2023 through 7 September 2026.
- `nse.fact_eod_prices`: 3,408,530 rows after concurrent EOD ingestion, March
  2021 through 7 September 2026.
- `public.minute_daily_archive`: 7,697 stock/session summaries representing
  2,639,317 regular-session minute bars, June through 7 September.
- August and September minute candles, including the 15-day intraday window.
- Current September raw tick/depth data (at least seven rolling days).
- August/September option-chain data subject to the 30-day option policy.
- All Paper Trading tables; trade-group count remained 88.
- OIIS decision snapshots: 6,907,703 rows unchanged.
- OISS runs/candidates: 132 / 27,456 unchanged.
- Daily/index/sector/VIX data, current instruments, paper audit and strategy
  lineage.

Before dropping June/July minute partitions, the transaction compared every
regular-session NSE/BSE daily OHLCV aggregate against
`public.minute_daily_archive`; mismatch count was zero. Raw August tick/depth
partitions were eligible only because their newest timestamps were older than
seven rolling days and retained minute bars existed.

## Validation

- PostgreSQL, collector, dashboard, Paper API and OISS containers: healthy,
  zero restarts.
- OISS validation: PASS; 132 runs, 27,456 observations, zero leakage violations
  and zero duplicate candidates.
- Paper, OIIS and OISS protected counts remained unchanged.
- The post-cleanup retention planner reports no further whole expired partitions.
- No `VACUUM FULL`, blanket reindex, schema-wide cascade, volume deletion, or
  unrelated container/process termination was used.

Evidence is in `output/retention-cleanup-20260908/`:

- `baseline.tsv`
- `dependencies.txt`
- `archive-coverage.txt`
- `candidate-facts.txt`
- `protected-counts-before.txt`
- `protected-counts-after.txt`
- `largest-after-final.txt`
- `retention-plan-after.txt`
- `container-health-before.txt`
- `container-health-after.txt`
- `oiss-validation-after.json`

## Remaining retained storage

The largest remaining objects are current or protected evidence:

- September market ticks: 52 GiB.
- OIIS decision snapshots: 17 GiB.
- September quotes: 13 GiB.
- September option OI: 13 GiB.
- September depth metrics: 7.8 GiB.
- Instrument-master snapshots: 6.2 GiB.
- Published backtest daily equity: 5.2 GiB.

These were not deleted because they are current-window data or published/audit
evidence. Monthly partition boundaries remain an efficiency limitation: current
month raw data cannot be returned to the OS until the whole partition expires,
unless it is rewritten. The initial cleanup did not falsely mark restore
verification as passed; the follow-up below records the user's waiver explicitly.

## Recurring cleanup activation

Follow-up commit `3bca92b` added an explicit, auditable alternative to lying
about restore verification. `operations.retention_gate` now accepts either a
verified restore or a recorded backup waiver. All 21 approved high-frequency
families have:

- `backup_waived=true` with the user's 8 September direction recorded;
- `rolling_cutoff=true`, so the 15/30-day policy advances instead of freezing at
  the approval date;
- daily, paper-evidence and dependency verification flags;
- a one-year approval expiry and evidence link.

The collector remains single-flight and runs cleanup every 30 minutes in bounded
10,000-row table batches. NSE intraday retention remains scheduled daily at
02:25 IST and archives recent daily summaries before deletion.

Production proof after deployment:

- Collector startup cleanup committed automatically.
- A separate manual collector cycle committed 40,000 expired rows.
- NSE intraday cleanup committed 43,332 expired rows across its five families.
- `operations.retention_result` contains the per-family committed audit rows.
- A subsequent freshness probe found 26,717 market ticks, 3,016 minute bars,
  11,441 quotes, 38,842 option-OI rows and 6,920 futures-OI rows in the preceding
  15 minutes during pre-open collection.
- Option Greeks and SmartAPI option-chain snapshots correctly remained at the
  prior session before the derivatives market opened; this is not treated as a
  fabricated current value.
- Collector, PostgreSQL and dashboard were healthy; recreated collector/NSE
  services had zero restarts.

The waiver can be revoked immediately by setting `backup_waived=false` or
expiring/removing the relevant exact gate row. Cleanup then fails closed again.

## Re-run and audit

The exact transactions are:

```text
scripts/sql/retire_verified_legacy_20260908.sql
scripts/sql/retire_expired_partitions_20260908.sql
scripts/sql/retire_expired_raw_market_partitions_20260908.sql
```

They are historical execution artifacts, not recurring blanket-purge commands.
Each has exact table names, age/parity guards, short lock timeouts, no cascade,
and one atomic transaction. The permanent recurrence path remains
`scripts/db_cleanup.sh`, governed by `operations.retention_gate`.
