# Phase 1 Completion Report — Data Foundation and Qualification

**Date:** 2026-08-02 UTC
**Branch:** `DEV_PM_CODE`

## Delivered

`platform/nifty_stratlab` now provides effective-dated session and expiry contracts,
canonical schemas, additive database migration preparation, immutable source
manifests, streaming CSV quality checks, workbook profiling, and an executable
qualification command.

Run it from the package directory:

```bash
. .venv/bin/activate
./run_phase1_qualification.sh --workers 8 \
  --output-dir outputs/full_qualification_$(date -u +%Y%m%dT%H%M%SZ)
```

It never alters the three input data folders. Failed CSVs are written to
`quarantine_manifest.json`, not repaired or moved.

## Validation evidence

```text
python -m pytest -q                 6 passed
python tools/phase1_smoke.py        PASS
full qualification                 781 sources
  PASS                              15
  WARN                              676
  QUARANTINED                       90
```

Complete report and immutable manifests:

```text
platform/nifty_stratlab/outputs/full_qualification_20260802T123539Z_workers8/
  qualification_report.json
  quarantine_manifest.json
  aaditya555_stocks_source_manifest.json
  debashis74017_indices_source_manifest.json
  fii_dii_workbook_source_manifest.json
```

The 100 stock CSVs, 680 index/VIX interval CSVs, and FII/DII workbook total
8,807,648,935 bytes. The workbook has seven sheets; its principal FII/DII data
sheet covers 2014-01-01 to 2023-07-14. It remains excluded from model features
until a publication-time (`available_at`) rule is approved.

## Qualification interpretation

The 90 quarantines are intentional fail-closed results. Eighty-one have detected
quality counters such as invalid OHLC or conflicting duplicate observations.
Nine earlier sources hit the missing pre-2000 calendar profile and were quarantined
rather than processed with an assumed session. WARN does not mean research-ready:
review source-level fields in `qualification_report.json`, especially missing-minute
counts until authoritative NSE holiday/special-session data is loaded.

## Database safety and rollback

No database connection was made, no migration was applied, and no broker order code
was introduced. `TRADING_DATABASE_URL` and `TRADING_TEST_DATABASE_URL` were absent.
The prepared additive migration is `platform/nifty_stratlab/db/migrations/001_foundation.sql`.
Test it only against the disposable test DSN after obtaining schema evidence.

Rollback is a Git revert of this phase commit; input data and output reports are
separate and source data was not changed. A pre-phase branch and uncommitted/staged
patches are retained under `/home/novius2/backups/nifty-backtesting/`.

## Remaining Phase 1 acceptance blockers

1. Configure a read-only production DSN and a disposable test DSN, inspect existing
   `nse_intraday.universe_membership`, then test the additive migration only on the
   disposable database.
2. Load authoritative effective-dated NSE holiday, special-session, and pre-2000
   session profiles; rerun qualification to resolve the calendar-origin quarantines.
3. Decide and document the FII/DII workbook `available_at` rule.
4. Review each WARN/QUARANTINED source before admitting it to strategy research.
