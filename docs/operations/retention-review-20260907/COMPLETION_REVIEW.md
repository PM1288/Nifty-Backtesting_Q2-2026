# Completion review and archive reliability follow-up

Base: `6aaa7c6`; branch: `fix/retention-completion-review`.

## Verified status

- Canonical source and pushed deployment work from the preceding report exist.
- Live database measured 406,041,689,111 bytes during this review. Both
  `operations.retention_gate` and `operations.retention_result` contain zero rows.
  Bulk cleanup has **not** completed. The prior 184 KiB redundant-index removal
  must not be described as solving database growth.
- Found an existing backup at
  `/home/novius2/backups/postgresql/trading-stack/20260809T144133Z/`:
  `tradingdb.dump` is 13,039,461,367 bytes; manifest records ARCHIVE_VERIFIED;
  `restore-proof-tradingdb.json` records PASS, 519 expected/restored relations,
  isolated network and no published ports on August 9.
  This is documentary restore evidence, **not a fresh checksum/restore test**.
  It does not cover September writes. Prior statements implying no existing
  backup destination/evidence was found are superseded by this inspection.

## Implemented in this follow-up

1. Replace yesterday-only daily preservation with a resumable 15-calendar-day
   catch-up. Each session uses its own transaction, 8-second SQL timeout,
   1-second lock timeout and a 90-second between-session budget. An in-flight
   statement may extend that budget by at most its timeout plus connection wait.
2. Persist per-date archive checkpoints. Revisit checkpoints after 24 hours for
   late corrections; skip recent checkpoints so interrupted runs resume.
   Weekends are not skipped: actual special-session data inside the existing
   regular session window remains eligible for preservation.
3. Missing archive migration or incomplete catch-up blocks NSE cleanup. Exceptions
   propagate to local job handling before the delete transaction is entered.
   Existing daily/paper/dependency/restore approval gates are still mandatory.
4. Zero affected rows are `NO_ROWS_CHANGED`, not proof of archival coverage.
   This can mean an empty session or protection against overwriting a fuller
   archive with partially purged source data. No fake coverage is inferred.
5. Manual retention prints its structured result locally. The standalone archive
   command records client timeouts with an explicit checkpoint-verification note.
   No WhatsApp or other notification integration was added.

## Verification

- Seven new isolated Python unit tests pass: multiple dates, zero rows, checkpoint
  resume, absent migration, time budget, incomplete-preservation delete block and
  exception delete block.
- Six PostgreSQL daily-preservation fixture subtests pass, including late
  correction, empty checkpoint, guarded cutover, exact OHLCV, official priority
  and survival after fixture-only raw deletion.
- Existing Python PostgreSQL gated/idempotent cleanup fixture: 1/1 pass.
- Go `internal/store` and `cmd/collector` suites pass; canonical gate passes.
- No frontend, route, formula, accounting or paper execution change. Earlier
  UI test evidence is not represented as a fresh complete dashboard regression.

## Still not complete

| Work | Remaining evidence/action |
| --- | --- |
| Bulk reclamation | Fresh exact-object export/restore, dependencies and daily/paper holds before approving explicit partitions/tables |
| Full daily coverage | Tracked-symbol × exchange-calendar anti-join; source/bar counts alone are insufficient |
| Missed history older than 15 days | Explicit archive backfill; automatic catch-up is intentionally bounded |
| Special evening sessions | Existing 09:15–15:30 archive policy needs canonical session-calendar support before raw expiry |
| Index continuity during missed archive jobs | Current view depends on prior-day archive; catch-up reduces the gap but does not supply an instantaneous raw fallback |
| Paper and backtests | Automatic pinned paths, seven-session holds, published/latest backtest lifecycle and lease reconciliation |
| Other storage | Effective-dated instrument compaction, remaining producer policies and operational-log expiry |
| Performance/security | Controlled restored-stack load test, targeted DB tuning and compatibility-tested dependency advisory remediation |
| Full UI acceptance | Numerical chart/export parity and Institutional Flow accessibility finding |

Do not blanket-approve retention gates or call this full completion.

## Deployment and rollback

Merge/push master before deployment. Apply `scripts/sql/daily_archive_20260907.sql`
first (additive/idempotent); build/recreate only NSE intraday API and scheduler
using active `compose/compose.base.yml` + `compose/compose.core.yml`, protected
`.env`, project `trading-stack-novius2`. No change to collector image is needed.

Run `python -m nse_intraday_intelligence.manual_jobs retention` inside that API
container and inspect JSON. Expected with current empty gates: preserved daily
checkpoints plus BLOCKED_UNVERIFIED per deletion family and zero deleted rows.
Repeat to verify checkpoint reuse. A timeout is not permission to increase
production load or bypass preservation.

Rollback only these two service images to the preceding intraday image
`sha256:b8f0c179a94cc15d46ae250387b929d8039d62fe568bfbb8c97507a81846d447`.
Keep additive archive/checkpoint data. Do not revert to pre-gate cleanup code.
