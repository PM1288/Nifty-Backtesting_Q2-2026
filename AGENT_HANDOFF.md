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

## 2026-08-03 canonical trading-stack import

The complete maintainable source from `/home/novius2/trading-stack` was merged
into this repository on branch `DEV_PM_CODE`. This repository is now the Git
home for the live stack as requested by the owner.

Imported scope includes:

- Go collectors, strategies, storage, backtests and commands
- Docker/Compose topology and operational scripts
- `neon-stock-terminal` Express/Prisma API and React/Vite UI
- PostgreSQL schema/migrations and the analytics/backtesting worker
- service packages, tests, contracts and configuration examples
- governed `platform/nifty_stratlab` research source
- current architecture, dashboard and operations documentation

Deliberately excluded from Git:

- `.env` and runtime credential files
- PostgreSQL/Redis/runtime state and exports
- virtual environments, `node_modules`, build output and caches
- generated backtest artifacts and qualification outputs
- temporary HTML/JSON captures, logs, ZIP exports, screenshots and videos
- local Android build state and `local.properties`

The exclusions are encoded in the root `.gitignore`. Never force-add these
paths. The source import was scanned with Gitleaks and reported no leaks.

Validation commands used:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
go test ./...

docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:latest \
  dir /repo --redact --exit-code 1 --no-banner --no-color

docker run --rm \
  -v "$PWD/services/nse_analytics_worker:/app" -w /app \
  trading-stack-nse-analytics-worker:latest \
  python -m unittest -v tests.test_backtesting_contracts

cd neon-stock-terminal
docker build --target builder -t nifty-github-import-dashboard-test .

cd ../platform/nifty_stratlab
./.venv/bin/python -m pytest -q
```

Results: Go suite passed; dashboard API/web production build passed; analytics
worker contracts passed (3); StratLab tests passed (29); Gitleaks found no
leaks. The Node production build reports 12 dependency audit findings (7
moderate, 3 high, 2 critical); upgrade them only in a separately tested change.

Live publication at import time:

- Compose project: `trading-stack-novius2`
- dashboard and analytics worker: running, restart count 0
- latest backtesting batch: `247`, published and validation passed
- primary scenario: `nifty_100:capital_16l`
- primary RSI run: 100 symbols, 67 closed trades
- pre-tax net P&L: INR 165,734.6353
- 35% reserve: INR 58,007.1219
- after-tax net P&L: INR 107,727.5134

For future synchronization, review changes from `/home/novius2/trading-stack`
and copy only maintainable source. Run Gitleaks and the relevant tests before
staging. Always use `docker compose -p trading-stack-novius2` for the live
project; omitting `-p` creates an unintended parallel Compose project.

## GitHub publication

- GitHub repository: `PM1288/Nifty-Backtesting_Q2-2026`
- remote: `https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git`
- branch: `DEV_PM_CODE`
- derivatives gate commit: `3e7efbe`
- canonical stack import commit: `4bf4178`
- draft pull request: https://github.com/PM1288/Nifty-Backtesting_Q2-2026/pull/1
- PR base/head: `master` <- `DEV_PM_CODE`

GitHub CLI is installed and authenticated as `PM1288`. Git HTTPS credentials
are routed through `gh auth git-credential`. Future agents should run
`gh auth status`, `git status -sb`, the relevant validations, and Gitleaks before
committing and pushing additional stack changes.

## Live backtesting dashboard ingress repair (2026-08-03)

The backtesting UI is publicly available at:

- overview: `https://n50.nifty50today.co.in/n50/backtesting`
- runs: `https://n50.nifty50today.co.in/n50/backtesting/runs`
- strategies: `https://n50.nifty50today.co.in/n50/backtesting/strategies`
- results: `https://n50.nifty50today.co.in/n50/backtesting/results`
- regimes: `https://n50.nifty50today.co.in/n50/backtesting/regimes`
- stocks: `https://n50.nifty50today.co.in/n50/backtesting/stocks`
- daily summary: `https://n50.nifty50today.co.in/n50/backtesting/daily-summary`
- comparison: `https://n50.nifty50today.co.in/n50/backtesting/compare`

The dashboard and API were healthy locally, but Cloudflare returned `502`
because its remotely managed ingress targets
`http://host.docker.internal:19090` while the connector lacked a Linux
`host.docker.internal` mapping. The `cloudflared50` connector was relaunched
with Docker's `host-gateway` mapping. Do not commit or print the tunnel token.

Safe relaunch pattern (obtain the token from the secret manager or Cloudflare,
never from a tracked file):

```bash
docker rm -f cloudflared50
docker run -d \
  --name cloudflared50 \
  --restart unless-stopped \
  --add-host host.docker.internal:host-gateway \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token "$N50_TUNNEL_TOKEN"
```

Verification commands and expected result:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:19090/n50/backtesting
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://n50.nifty50today.co.in/n50/backtesting
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://n50.nifty50today.co.in/n50/v1/backtesting/runs
```

All three probes returned `200` after the repair. The public runs endpoint
returned latest publish batch `247` with 100-symbol scenarios.

## Latest analysis report, visible run date, and manual-only login (2026-08-03)

The latest analysis is publish batch `247`:

- analysis report: `https://n50.nifty50today.co.in/n50/backtesting/results`
- run and validation audit: `https://n50.nifty50today.co.in/n50/backtesting/runs`
- generated: `2026-08-03T12:46:17.355Z` (`3 Aug 2026, 18:16 IST`)
- market data through: `2026-07-31`

Every backtesting page now shows a `Test run` timestamp in the shared header.
The overview also has a dedicated `Test run date` KPI and direct cards for the
latest analysis report and run audit.

Unsolicited login prompts are disabled by default. Timed prompts,
authentication-required browser events, verification prompts, and session-sync
errors no longer open the modal automatically. The account control can still
open login manually. Set `VITE_AUTO_AUTH_GATE=true` at web build time only if
the automatic gate is intentionally required again.

Build and targeted live deployment commands used:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
docker build \
  --build-arg VITE_BASE_PATH=/n50/ \
  --build-arg VITE_API_BASE_URL=/n50 \
  --build-arg VITE_WS_URL=/n50 \
  -t trading-stack-n50-dashboard:latest .

docker compose \
  -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml \
  up -d --no-deps --force-recreate n50-dashboard
```

The 12 changed API/UI source files were synchronized to
`/home/novius2/trading-stack/neon-stock-terminal` so a future Compose rebuild
does not revert the deployed behavior. The GitHub repository remains the
reviewable source of truth.

Validation completed:

- Docker production API and web TypeScript/Vite build: passed
- local dashboard and overview API: HTTP `200`
- public overview, results, and runs pages: HTTP `200`
- browser-visible header: `Test run 3 Aug 2026, 18:16 IST`
- browser login-dialog count after 35 seconds: `0`
- dashboard container restart count: `0`
- overview snapshot explicitly refreshed after deployment
