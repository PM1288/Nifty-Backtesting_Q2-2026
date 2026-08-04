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

## Backtesting visual analytics rebuild (2026-08-03)

The full UI guidance set in `/home/novius2/NIFTY50/UI-CHnages-1` was reviewed, including the Markdown implementation brief, CSV widget catalogue, DOCX UX specification and embedded images, and HTML reference. The implementation record is in `docs/backtesting-ui/README.md`.

The new story order is trust, money, risk, explanation, stability, and action. The overview now explains the closed-book/open-book contradiction. Compare only ranks compatible rows and lets the reviewer select the objective. Strategy detail tells the full rules-to-portfolio journey. Missing OOS, walk-forward, capacity, and parameter-stability evidence is shown as unavailable rather than synthesized.

Primary live review URLs:

```text
https://n50.nifty50today.co.in/n50/backtesting
https://n50.nifty50today.co.in/n50/backtesting/compare
https://n50.nifty50today.co.in/n50/backtesting/strategies/rsi30_willr80_closegtprev_tp125
```

Commands used to compile, synchronize, deploy, and verify:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
docker build --target builder -t nifty-backtesting-ui-v2-test .

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
rsync -a neon-stock-terminal/apps/web/src/components/visual/EChartSurface.tsx \
  /home/novius2/trading-stack/neon-stock-terminal/apps/web/src/components/visual/EChartSurface.tsx
while IFS= read -r changed_file; do
  case "$changed_file" in
    neon-stock-terminal/apps/web/src/pages/*)
      rsync -a "$changed_file" \
        /home/novius2/trading-stack/neon-stock-terminal/apps/web/src/pages/
      ;;
  esac
done < docs/backtesting-ui/BACKTEST_UI_CHANGED_FILES.txt

docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml \
  build n50-dashboard
docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml \
  up -d --no-deps --force-recreate n50-dashboard

docker exec trading-stack-novius2-n50-dashboard-1 \
  node -e "fetch('http://127.0.0.1:18184/health').then(async r=>console.log(r.status,await r.text()))"
cd /tmp/nifty-playwright-test
node backtesting-ui-acceptance.mjs
```

Final acceptance result: four browser journeys passed with no failed backtesting API requests, no page errors, no modal login dialogs, and no page-level horizontal overflow. Viewports were 1440x1000 for overview, comparison, and strategy detail, plus 430x932 for mobile overview. Results are recorded in `docs/backtesting-ui/BACKTEST_UI_TEST_RESULTS.json`; screenshots are in `docs/backtesting-ui/screenshots/`.

The source files were also synchronized to `/home/novius2/trading-stack/neon-stock-terminal` so the next Compose rebuild retains the UI. Do not use a broad sync that overwrites unrelated stack changes; follow `docs/backtesting-ui/BACKTEST_UI_CHANGED_FILES.txt`.

## Per-strategy CSV persistence (2026-08-03)

Every future successful `refresh-all` or `refresh-backtesting` now exports the published database batch to persistent CSV when `BACKTEST_CSV_EXPORT_ENABLED=1` (default). A manual export command is also available and does not rerun the backtest.

Host path:

```text
/home/novius2/trading-stack/services/nse_analytics_worker/runtime/exports/backtesting
```

Layout and contract: `docs/backtesting-csv/README.md`. Each batch has one folder per strategy. Each strategy folder contains `strategy_summary.csv`, `trades.csv`, `open_positions.csv`, `daily_equity.csv`, `stock_summary.csv`, `regime_summary.csv`, `skipped_signals.csv`, `validation.csv`, and `manifest.csv`. Files carry batch, strategy version, and scenario tags; stock results are rows, not separate files.

Commands used to build, deploy, and export the existing published batch without rerunning it:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 -f docker-compose.yml build nse-analytics-worker
docker compose -p trading-stack-novius2 -f docker-compose.yml \
  up -d --no-deps --force-recreate nse-analytics-worker
docker compose -p trading-stack-novius2 -f docker-compose.yml exec -T \
  nse-analytics-worker python -m app.cli export-backtesting-csv
```

Initial proof for batch `247`: 3 strategy folders, 252,753 exported data rows, 0 checksum failures. The worker container was healthy with 0 restarts after export. Six focused backtesting/CSV unit tests passed in the production image.

## Backtesting promoted in the primary sidebar (2026-08-03)

The complete Backtesting navigation group was moved directly below Overview in the primary sidebar. It is now visible without scrolling on desktop and appears at the top of the mobile navigation drawer. No route was duplicated or changed. The group retains these eight destinations: Overview, Strategy Leaderboard, Portfolio Results, Regime Analysis, Stock Insights, Daily Summary, Compare, and Run Monitor.

Source changed:

```text
neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx
```

Commands used to build, synchronize, deploy, and verify:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
docker build --target builder -t nifty-sidebar-backtesting-test .

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
rsync -a neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx \
  /home/novius2/trading-stack/neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx
docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml build n50-dashboard
docker compose -p trading-stack-novius2 \
  -f /home/novius2/trading-stack/docker-compose.yml \
  up -d --no-deps --force-recreate n50-dashboard
docker exec trading-stack-novius2-n50-dashboard-1 \
  node -e "fetch('http://127.0.0.1:18184/health').then(async r=>console.log(r.status,await r.text()))"

cd /tmp/nifty-playwright-test
node sidebar-backtesting-acceptance.mjs
```

Live acceptance passed at `https://n50.nifty50today.co.in/n50/backtesting` on desktop `1440x1000` and a real mobile viewport `430x932`. Both tests found all eight sidebar links exactly once, confirmed Backtesting Overview has `aria-current="page"`, confirmed the group is in the initial viewport, and found zero modal login dialogs. Machine-readable evidence is in `docs/backtesting-ui/SIDEBAR_BACKTESTING_TEST_RESULTS.json`; screenshots are `docs/backtesting-ui/screenshots/sidebar-backtesting-desktop.png` and `sidebar-backtesting-mobile.png`.

## Daily rising oversold intraday strategy (2026-08-03)

Added the research-only Strategy Lab manifest and plugin:

```text
platform/nifty_stratlab/config/strategies/daily_rising_oversold_intraday_v1.yml
platform/nifty_stratlab/src/nifty_stratlab/strategies/reference_equity.py
platform/nifty_stratlab/src/nifty_stratlab/features/technical.py
```

The point-in-time-safe rule is: previous completed daily RSI(14) `< 30` and
greater than both preceding daily RSI values; next session open above the prior
close; then a completed 1-minute bar from `09:30:00` through `12:00:00` IST with
RSI(14) `< 25`, Williams %R `< -80`, and `low > lower Bollinger(20, 2)`. Entry
is the next 1-minute open and RSI `> 70` remains the exit signal. The manifest
preserves the existing `1.25%` target assumption; target/stop execution remains
owned by the simulator, with no broker order authority.

The daily context is shifted before joining to intraday bars, so the current
day's close cannot leak into its own signal. Validation:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
.venv/bin/python - <<'PY'
from pathlib import Path
from nifty_stratlab.strategy.sdk import load_manifest, instantiate_strategy
m = load_manifest(Path('config/strategies/daily_rising_oversold_intraday_v1.yml'))
print(m.strategy_version_id, type(instantiate_strategy(m)).__name__)
PY
.venv/bin/pytest -q tests/phase2/test_rsi_daily_regime.py
.venv/bin/pytest -q
```

Manifest load passed; focused tests passed (`4 passed`) and the full Strategy
Lab suite passed (`31 passed`). This change was not run across all symbols.

One-symbol execution was then run on the supplied RELIANCE minute CSV:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
PYTHONPATH=src:tools .venv/bin/python tools/run_daily_rising_oversold_intraday.py \
  --csv /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv \
  --symbol RELIANCE --start 2024-01-01 --end 2025-07-31 \
  --output-dir outputs/daily_rising_oversold_reliance_20240101_20250731
```

Result: `PASS`, 147,205 evaluation bars, 0 entries, 0 closed trades, 0 open
positions, final cash `₹16,00,000`. The zero-trade result is consistent with the
strict daily gate: diagnostic counts found zero daily setup bars for RELIANCE in
this window before the intraday filters were applied. No broker orders were
created. Review artifacts are in
`platform/nifty_stratlab/outputs/daily_rising_oversold_reliance_20240101_20250731/`.

## Relaxed daily RSI gate and RELIANCE rerun (2026-08-03)

The daily condition was relaxed per request. It now requires only:

```text
setup-day daily RSI(14) > immediately preceding day's daily RSI(14)
```

The daily `<30` threshold and comparison against the second prior day were
removed. The opening-gap, 09:30–12:00 intraday RSI/WILLR/Bollinger conditions,
next-minute-open execution, RSI `>70` exit, and target profile are unchanged.

Focused tests and the full Strategy Lab suite were rerun after this change. The
RELIANCE bounded runner should be rerun with the same command above; its new
summary will show whether the relaxed gate creates qualifying signals.

RELIANCE rerun result: `PASS`, 147,205 bars, 2 entries, 2 exits, 2 closed
trades, 0 open positions, final cash `₹15,98,801.77`. Net trade P&L was
`₹173.00 - ₹1,371.23 = -₹1,198.23` after the configured delivery charges. Both
trades exited on the RSI `>70` rule before the target was reached. The detailed
CSV evidence is in
`platform/nifty_stratlab/outputs/daily_rising_oversold_reliance_20240101_20250731/`.

Correction: that first relaxed run incorrectly allowed RSI `>70` to emit an exit.
That behavior has been removed. This strategy is now target-only: the simulator
calculates the target from the actual buy price and configured ticket/target
profile, and a position remains open until the target is reached (or the run
ends). RSI is never an exit condition.

Corrected target-only rerun result: `PASS`, 147,205 bars, 1 entry, 1 closed
trade, 0 open positions, final cash `₹16,02,501.76`. The trade entered at
`₹1,340.25` and exited at `₹1,360.15` with exit reason `target_intraday_hit`;
net P&L after charges was `₹2,501.76`. The previous two-trade RSI-exit result
must not be used for strategy evaluation.

The two-stage target rerun then used `0.3%` same-day and `1.0%` swing targets.
RELIANCE produced 2 target-only trades: 1 same-day target (`₹135.75` net) and
1 swing target (`₹1,519.47` net), for total net P&L `₹1,655.22`. Final cash was
`₹16,01,655.22`; capital was returned to cash after each target exit. Both exits
were `target_intraday_hit`; no RSI exit and no stop exit was used.

## Historical CSV minute importer (2026-08-03)

Added the resumable, non-destructive importer documented in
`docs/csv-minute-import/README.md`. It loads IST regular-session CSV bars into
`public.bars_1m` without overwriting conflicts and stores technical indicators
in `research.security_minute_technical`. `catalog.csv_minute_import` records
SHA-256, requested date scope, counts, timestamps, and status so completed work
can resume safely.

Important design call: historical rows are not copied to
`nse_intraday.raw_security_1m`, because that table is monthly-partitioned and the
operational intraday cleanup job deletes old history. `public.bars_1m` is the
durable raw source used by the existing stack. The dedicated research feature
table avoids deleting/rebuilding live operational feature partitions.

Commands used for validation:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
.venv/bin/pip install -e '.[postgres,dev]'
.venv/bin/pytest -q tests/phase2/test_csv_minute_import.py
.venv/bin/pytest -q
```

Live bounded proof imported RELIANCE for `2025-07-01`: 375 accepted IST bars,
375 new raw rows, and 375 technical rows. Indicator non-null counts were RSI
361, Williams %R 362, and lower Bollinger 356; earlier nulls are expected
warm-up. Repeating the same source/date scope kept the raw count at 375 and the
audit correctly skipped completed work. No existing raw rows were changed or
deleted. The all-symbol import was not started.

Full-file RELIANCE dry-run proof: 972,529 source rows, 971,871 accepted
regular-session rows, 658 rejected out-of-session rows, 0 invalid OHLCV rows,
and 0 duplicate timestamps. Accepted coverage was `2015-02-02 09:15 IST`
through `2025-08-06 15:29 IST`. Special NSE weekend sessions are deliberately
retained rather than rejected by weekday.

The initial all-symbol run completed 92 full files and recorded 7 token lookup
failures (`DABUR`, `HEROMOTOCO`, `ICICIPRULI`, `INDUSINDBK`, `MM`, `SWIGGY`,
`TATAMOTORS`). The importer was then updated to fall back to
`public.instruments`, with explicit historical aliases `MM -> M&M-EQ` and
`TATAMOTORS -> TMPV-EQ`. A repair run for those seven files is active as of
2026-08-04; its progress is visible in `catalog.csv_minute_import` and its
report is `outputs/csv_minute_import_failed_repair_20250804.json`.

## 2026-08-04 Batch backtest

Created `tools/run_daily_rising_oversold_batch.py`: discovers CSV symbols, excludes TMPV, runs the established target-only RSI/Bollinger strategy with two subprocess workers, writes per-symbol artifacts and a consolidated JSON report.

Command launched:
`nohup .venv/bin/python tools/run_daily_rising_oversold_batch.py --csv-dir /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50 --output-dir outputs/daily_rising_oversold_batch_20260804 --start 2015-02-02 --end 2025-08-06 --workers 2 --exclude TMPV --report outputs/daily_rising_oversold_batch_20260804/batch_summary.json`

## 2026-08-04 Host PostgreSQL conflict resolved

The host PostgreSQL 16 cluster was listening on port 5432 and conflicted with the Docker stack. It was stopped and disabled (data/package preserved):

```bash
systemctl stop postgresql@16-main.service postgresql.service
systemctl disable postgresql@16-main.service postgresql.service
```

Docker PostgreSQL remains healthy and verified with:

```bash
docker exec -e PGPASSWORD=CHANGE_ME_POSTGRES_PASSWORD trading-stack-novius2-postgres-1 \
  psql -U trader -d tradingdb -c 'select current_user,current_database();'
```

Docker database endpoint: `172.25.0.21:5432` (container network); hostname `postgres` is valid only from the Docker network.

## 2026-08-04 pgAdmin Tailscale access

Postgres is published only on the Tailscale interface using `trading-stack/compose/compose.base.yml`:
`100.86.108.108:5432:5432`. Verified from the host with `psql -h 100.86.108.108`.

pgAdmin fields:
- Host: `100.86.108.108`
- Port: `5432`
- Maintenance database: `tradingdb`
- Username: `trader`
- Password: `CHANGE_ME_POSTGRES_PASSWORD`
- SSL mode: `Prefer` (or `Disable` for initial LAN/Tailscale test)

## 2026-08-04 — 96-strategy hybrid catalogue setup

Reviewed all supplied artifacts in `/home/novius2/NIFTY50/TEST-STRAt_ALL`, including the MD guidance, DOCX text, machine JSON/CSV and ZIP members. The catalogue contains 96 strategies: Wave 1 = 24, Wave 2 = 36, Wave 3 = 36.

Implemented `platform/nifty_stratlab/tools/setup_hybrid_catalogue.py` and `scripts/strategy_catalogue.sh`. Generated one isolated workset per strategy under `config/workloads/hybrid_catalogue_v1/<STRATEGY_ID>/workload.json`. Every workset uses:

- 2015-02-02 through 2025-08-06;
- all 100 available CSV symbols, with TMPV explicitly excluded if present;
- two workers;
- target-only exit: 0.3% during the entry session, then 1.0% swing target from the original buy price;
- ₹16 lakh/eight concurrent ₹2 lakh positions and unlimited-capital scenarios;
- CSV, JSON, HTML and PostgreSQL reporting requirements.

Commands executed:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
.venv/bin/pip install -e '.[postgres,dev]'
./scripts/strategy_catalogue.sh validate
./scripts/strategy_catalogue.sh setup
./scripts/strategy_catalogue.sh smoke RELIANCE
.venv/bin/python scripts/baseline_comparison_v1/reference_golden_suite.py
.venv/bin/python scripts/baseline_comparison_v1/validate_suite.py
.venv/bin/pytest -q tests
```

Results: 96/96 workload contracts passed; RELIANCE source exists for all 96; nine existing reference manifests passed golden next-bar signal/fill checks; full test suite passed 35 tests. The full ten-year run was not launched. Only nine catalogue strategies currently map to existing reference manifests, and D2/D3 strategies require aligned point-in-time market/sector/VIX/cross-sectional inputs. `full_run_authorized` remains false to comply with the source package's fail-closed stop conditions. See `docs/HYBRID_CATALOGUE_IMPLEMENTATION_COMPLETION.md` and `docs/HYBRID_WAVE1_LIMITATIONS.md`.

### Assumption-backed completion after trading-stack review

The operator authorized explicit assumptions for missing/ambiguous rules. Reviewed the authoritative trading-stack source-of-truth, backtesting architecture, intraday intelligence contract, recommendation-engine feature contract, StratLab handoff and live database schema. Located historical files:

- `/home/novius2/data/nifty-50-minute-data/debashis74017/NIFTY 50_minute.csv` — 1,048,738 data rows, 2015-01-09 onward;
- `/home/novius2/data/nifty-50-minute-data/debashis74017/INDIA VIX_minute.csv` — 1,048,338 data rows, 2015-01-09 onward;
- daily NIFTY 50 and India VIX histories in the same directory;
- `public.index_constituents` — 100 rows/99 tokens/17 sectors at inspection;
- 100 stock CSV files for the synchronized panel.

Added `hybrid_narrative_assumptions_v1`, a deterministic feature builder and narrative-rule compiler. Frozen assumptions include current-panel survivorship bias, static sectors, beta=1 residual proxy, NIFTY proxy for unavailable sector indexes, first signal per symbol/session, 8 bps estimated round-trip same-day costs and 22 bps swing costs. Added the consolidated runner `tools/run_hybrid_catalogue.py`.

Real smoke command:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
./scripts/strategy_catalogue.sh smoke-run RELIANCE
```

Result: SUCCESS; 22,980 RELIANCE bars, 96/96 detectors executed, 87 produced signals, 96 per-strategy report folders, 1,763 closed smoke trades and 73 open positions across the 96 independent strategy studies. Actual NIFTY 50 and India VIX minute history are aligned into the smoke features. These aggregate trade counts must not be interpreted as one portfolio. Full tests: 36 passed. Shell/Python syntax passed. Full-run gate correctly exits 2 without approval.

Operator-approved full launch command (do not run before explicit go-ahead):

```bash
CONFIRM_FULL_HYBRID_RUN=YES ./scripts/strategy_catalogue.sh full
```

## 2026-08-04 — Full 96-strategy run started

Operator gave the go-ahead. Started the full 100-symbol run with four parallel symbol workers; each worker evaluates all 96 strategies sequentially for its symbol:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
CONFIRM_FULL_HYBRID_RUN=YES ./scripts/strategy_catalogue.sh full
```

Run range is 2015-02-02 through 2025-08-06, excluding TMPV. First two completed symbols were `ADANIGREEN` and `ADANIENSOL`, both with return code 0 and no errors. The process remains active in the terminal session; final consolidated reports are written after all symbols complete under `outputs/hybrid_catalogue_v1_full`.
