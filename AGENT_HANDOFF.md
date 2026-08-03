# Agent Handoff — Phase 1 Data Foundation

**Updated:** 2026-08-02 UTC
**Repository:** `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
**Branch:** `DEV_PM_CODE`

## Outcome so far

Phase 1's bounded package is installed at `platform/nifty_stratlab`. It qualifies historical CSV input without modifying it, writes deterministic source manifests, and writes a separate quarantine manifest for failed sources. It also profiles the FII/DII workbook and explicitly excludes it from model features until an `available_at` publication-time rule is decided.

The first sequential full run was deliberately interrupted before publication because it was too slow for routine execution. The successful complete eight-worker run is `platform/nifty_stratlab/outputs/full_qualification_20260802T123539Z_workers8/`.

Do not edit or move any source CSV/XLSX under `/home/novius2/data`.

## Implemented files

- `platform/nifty_stratlab/` — controlled Phase 1 overlay.
- `platform/nifty_stratlab/tools/qualify_historical.py` — executable reusable full/pilot qualification runner.
- `platform/nifty_stratlab/src/nifty_stratlab/data/workbook_profiler.py` — FII/DII workbook sheet, header and date-coverage profiler.
- `platform/nifty_stratlab/run_phase1_qualification.sh` — Python 3 wrapper.
- `platform/nifty_stratlab/tests/phase1/test_workbook_profiler.py` — workbook test.
- `platform/nifty_stratlab/src/nifty_stratlab/data/csv_profiler.py` — now accepts interval-specific expected session-bar counts.

## Commands executed

```bash
# Repository and data checks
find /home/novius2 /opt /srv -maxdepth 5 -type d -name .git -print
find /home/novius2/data/nifty-50-minute-data/aaditya555 -type f -name '*.csv' | wc -l
find /home/novius2/data/nifty-50-minute-data/debashis74017 -type f -name '*.csv' | wc -l

# Preserve baseline and create controlled branch
git status --porcelain > /home/novius2/backups/nifty-backtesting/pre_phase1_status.txt
git diff > /home/novius2/backups/nifty-backtesting/pre_phase1_uncommitted.patch
git diff --staged > /home/novius2/backups/nifty-backtesting/pre_phase1_staged.patch
git switch -c DEV_PM_CODE
git branch backup/pre-nifty-phase1-<timestamp>

# Verify and install Phase 1 overlay
python3 APPLY_OVERLAY.py /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026 --dry-run
python3 APPLY_OVERLAY.py /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026

# Clean virtual environment, tests, smoke and pilot
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
python -m compileall -q src tools
python -m pytest -q
python tools/phase1_smoke.py
python tools/qualify_historical.py --limit 1 --output-dir /tmp/nifty_phase1_pilot.XXXXXX

# Full qualification (active at this update)
python tools/qualify_historical.py --workers 8 --output-dir outputs/full_qualification_20260802T123539Z_workers8 >outputs/full_qualification_20260802T123539Z_workers8/run_stdout.log 2>outputs/full_qualification_20260802T123539Z_workers8/run_progress.log
```

## Verified results

- Phase bundle manifest verification: **PASS**.
- Overlay dry run: **PASS** (24 planned additions, no overwrites).
- Clean package tests: **6 passed**.
- Phase 1 smoke test: **PASS**.
- Pilot: **3 WARN, 0 FAIL**. It processed one stock CSV, one interval-index CSV, and the FII/DII workbook.
- The FII/DII workbook contains seven sheets. Its main FII/DII sheet covers 2014-01-01 through 2023-07-14. Its `available_at` rule is deliberately pending.
- Full qualification: **781 source files, 15 PASS, 676 WARN, 90 QUARANTINED**.
  The source manifests total **8,807,648,935 bytes**: 100 stock CSVs (4,613,836,603 bytes), 680 index/VIX CSVs (4,191,830,080 bytes), and one workbook (821,252 bytes).
- Of 90 quarantines, 81 are content-quality counter failures. Nine historical sources predate the configured 2000-01-01 session profile and were safely quarantined with `CalendarError` instead of being processed under an invented modern session.

## How to resume or rerun

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
. .venv/bin/activate

# Full estate
./run_phase1_qualification.sh --workers 8 --output-dir outputs/full_qualification_$(date -u +%Y%m%dT%H%M%SZ)

# Small deterministic pilot
./run_phase1_qualification.sh --limit 5 --output-dir outputs/pilot_$(date -u +%Y%m%dT%H%M%SZ)

# Read result counts and quarantines
python - <<'PY'
import json
from pathlib import Path
root = Path('outputs/<run-id>')
print(json.loads((root / 'qualification_report.json').read_text())['summary'])
print(len(json.loads((root / 'quarantine_manifest.json').read_text())['records']))
PY
```

## Remaining release-gate items

- Configure `TRADING_DATABASE_URL` with a read-only role and a separate disposable `TRADING_TEST_DATABASE_URL`; neither was configured, so no PostgreSQL connection or migration was attempted.
- Add authoritative NSE holidays/special sessions before treating missing-minute warnings as source defects.
- Set and document the FII/DII `available_at` rule before using workbook values as features.
- Production migration and point-in-time universe integration remain blocked on absent database DSNs/schema evidence. No production data was written.
- Review and commit the work only after the full report is captured.

## 2026-08-03 derivatives research addition

Added `config/research/nifty_atm_long_straddle_v1.yml` and executable
`tools/audit_derivatives_readiness.py`. The requested NIFTY ATM CE+PE experiment
is deliberately research-only and `BLOCKED` until point-in-time contracts and
observed historical option quotes/premiums exist. Run:

```bash
cd platform/nifty_stratlab
./tools/audit_derivatives_readiness.py --json
```

The live dashboard, PostgreSQL publication and worker changes were implemented in
`/home/novius2/trading-stack`, which is not this Git repository and has no `.git`
metadata. See `/home/novius2/NIFTY50/AGENT_HANDOFF_UI_BACKTESTING_2026-08-03.md`
for the complete implementation, deployment and verification record.
