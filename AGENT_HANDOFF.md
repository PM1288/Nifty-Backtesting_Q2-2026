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

### Full run completion

The run completed at `2026-08-04T21:06:34Z` with `SUCCESS`: 100 symbols, 96 strategies, four workers, requested period 2015-02-02 through 2025-08-06, and TMPV excluded. All 96 strategy report folders were produced. Across independent strategy studies there were 2,107,930 total trade rows, 2,100,150 closed trades and 7,780 open swing positions. The sum of independent-study net P&L was ₹856,501,092.34 and the sum after the 35% positive-profit tax assumption was ₹556,725,646.97.

These sums are not a single investable portfolio: each strategy was evaluated independently and the run intentionally has no cross-strategy capital netting. Use each strategy's `summary.json`, `trades.csv` and `symbol_summary.csv` for review; finite-capital portfolio replay and dashboard publication remain separate reconciliation work.

## 2026-08-05 — Analysis ZIP

Packaged the complete full-run output into:

`/home/novius2/NIFTY50/hybrid_catalogue_v1_full_20260804.zip`

Archive verification passed (`unzip -tq`). It contains 386 files and 309,168,233 uncompressed bytes. ZIP size is approximately 61 MB. SHA-256:

`6a16bf06b79825041d418c960b042e81993a4297266d7e314b958bff0aa52032`

Recreate/verify commands:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
apt-get update -qq && apt-get install -y -qq zip
zip -r -q /home/novius2/NIFTY50/hybrid_catalogue_v1_full_20260804.zip \
  platform/nifty_stratlab/outputs/hybrid_catalogue_v1_full
sha256sum /home/novius2/NIFTY50/hybrid_catalogue_v1_full_20260804.zip
unzip -tq /home/novius2/NIFTY50/hybrid_catalogue_v1_full_20260804.zip
```

## 2026-08-06 — Strategy Evaluation Rules of Engagement v1.0

### What was reviewed

Reviewed every artifact in `/home/novius2/NIFTY50/Rules-of-engegemnt`:

- `CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md` — 1,471 lines;
- `NIFTY_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.docx` — 1,468 extracted paragraphs;
- `Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx` — all nine sheets;
- `NIFTY_STRATEGY_EVALUATION_RULES_AND_CODEX_IMPLEMENTATION_V1.0.zip` — integrity tested and every member reviewed.

The ZIP Markdown and DOCX are byte-identical to the standalone copies. The workbook contains 52 events, 208 event-window records and 30 registered sources. The source workbook has nine sheets; the Rules document's 24 sheets are the mandatory generated strategy evidence workbook.

Integrity commands:

```bash
cd /home/novius2/NIFTY50
unzip -t Rules-of-engegemnt/NIFTY_STRATEGY_EVALUATION_RULES_AND_CODEX_IMPLEMENTATION_V1.0.zip
sha256sum Rules-of-engegemnt/*
```

Source hashes used by the live policy:

- Rules Markdown: `24f3b2a7504fbb05e15917f6abda5ad56c9c1e77c595c9c1eaf2830e14eefdbf`
- Event workbook: `1ea6a94fab4977d8eb6ea26e25a0396643a1a89ff859036ee8bac470ba857bf7`

### Critical interpretation

The prior 96-strategy target-only run must not be described as a true or rankable backtest. Under `NIFTY-SEROE-V1.0`, no loss exit plus no timeout means `OPPORTUNITY_SCAN`, `NOT_RANKABLE`, rating `NR`, regardless of eventual target hits or aggregate P&L. This correction is implemented in code and UI.

All validation dimensions remain independent. Any failed hard gate blocks a score. Current published runs fail one or more of point-in-time universe, complete MFE/MAE path evidence, effective-dated cost certification, untouched out-of-sample evidence or independent reproduction. Therefore no current run receives an A-E quality rating.

### Code and schema added

- `db/sql/020_strategy_evaluation_roe.sql` — additive `strategy_eval` schema with 17 tables plus latest-evaluation view;
- `platform/nifty_stratlab/config/evaluation/strategy_evaluation_roe_v1.json` — versioned thresholds, ladders, capital/tax mandate and weights;
- `platform/nifty_stratlab/src/nifty_stratlab/evaluation/roe.py` — pure result taxonomy, trend and rankability rules;
- `platform/nifty_stratlab/tools/import_strategy_evaluation_roe.py` — transactional workbook/regime/evaluation importer;
- `platform/nifty_stratlab/tools/export_strategy_evaluation_pack.py` — exact 24-sheet workbook and CSV/MD/JSON/checksum exporter;
- `platform/nifty_stratlab/docs/STRATEGY_EVALUATION_RULES_INTEGRATION.md` — architecture, formulas, limits and operations;
- API response enrichment in `neon-stock-terminal/apps/api/src/lib/backtestingPublished.ts`;
- strategy-detail UI evidence banner, gate grid and suitability story;
- migration ownership/order and per-section README/runbook updates.

### Regime semantics and live coverage

Stock and NIFTY are classified independently from returns available through that date. Primary trend uses 21 sessions, falling back to 5 then 1 only during warm-up. The classifications are `UPWARD`, `DOWNWARD`, `SIDEWAYS`, `TRANSITION`, or `INSUFFICIENT_DATA`. Realized 20-session volatility plus same-date India VIX create the market zone.

Live committed rows:

- 19,730 `strategy_eval.market_regime_daily` rows;
- index coverage: NIFTY 50, Bank NIFTY and India VIX, `2021-03-08` to `2026-08-05`;
- stock coverage: 100 symbols, `2025-11-10` to `2026-08-05`, from latest published batch 255;
- event coverage: `2016-02-29` to `2026-08-04`.

All 52 historical events currently have `point_in_time_eligible=false`. This is intentional: workbook event outcomes and inferred post-event regimes are retrospective and the source review status does not certify them as trading-time features.

### Import and evaluation commands

Always test rollback first:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/import_strategy_evaluation_roe.py \
  --workbook /home/novius2/NIFTY50/Rules-of-engegemnt/Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx \
  --rules /home/novius2/NIFTY50/Rules-of-engegemnt/CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md \
  --dry-run
```

Committed execution is the same command without `--dry-run`. The verified result was:

```text
events=52 event_windows=208 sources=30 regime_rows=19730 evaluated_runs=15 committed=true
```

Current evaluation counts:

```text
OPPORTUNITY_SCAN / NOT_RANKABLE / NR = 5
TRUE_BACKTEST_ISOLATED / NOT_RANKABLE / NR = 2
TRUE_BACKTEST_PORTFOLIO / NOT_RANKABLE / NR = 8
```

Opportunity-scan regime slices are always `UNKNOWN`, never `GOOD` or `AVOID`, because a target-only close set is mechanically winner-only evidence.

### Evidence pack

Generated default portfolio pack:

`platform/nifty_stratlab/outputs/evaluation_packs/rsi30_willr80_closegtprev_tp125/nifty_100_capital_16l`

It contains seven files: `strategy_evaluation.xlsx` with all 24 mandatory sheets, `trades.csv`, `slice_metrics.csv`, `stock_performance.csv`, Markdown/JSON summaries and `checksums.sha256`. The workbook ZIP structure passed `unzip -tq`. Every file is registered in `strategy_eval.artifact_manifest`.

Recreate:

```bash
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/export_strategy_evaluation_pack.py \
  --strategy-id rsi30_willr80_closegtprev_tp125 \
  --scenario nifty_100:capital_16l \
  --output-dir outputs/evaluation_packs/rsi30_willr80_closegtprev_tp125/nifty_100_capital_16l
```

### Tests completed

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
.venv/bin/python -m py_compile tools/import_strategy_evaluation_roe.py tools/export_strategy_evaluation_pack.py src/nifty_stratlab/evaluation/roe.py
.venv/bin/pytest tests/phase1 tests/phase2 tests/phase3/test_rules_of_engagement.py
# 24 passed

cd ../../neon-stock-terminal
npm ci --no-audit --no-fund
npm run prisma:generate --workspace=apps/api
npm run build --workspace=apps/api
npm run build --workspace=apps/web
# both production builds passed
```

The image build reported 13 npm audit findings in the pruned dependency tree (8 moderate, 3 high, 2 critical). These were not auto-fixed because dependency-major changes are outside this feature and require a separate compatibility/security change.

### Docker deployment and smoke proof

Runtime source was mirrored to `/home/novius2/trading-stack`, and only the dashboard image/service was rebuilt:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps --force-recreate n50-dashboard
docker compose -p trading-stack-novius2 ps n50-dashboard
```

During the first replace, Docker encountered a transient temporary-container ID/name race. Rerunning the scoped `--force-recreate` command resolved it. No database or other service was stopped.

Smoke endpoint:

```bash
curl -fsS 'http://127.0.0.1:19090/n50/v1/backtesting/strategies/rsi30_willr80_closegtprev_tp125?scenario=nifty_100%3Acapital_16l'
```

Verified response: `OPPORTUNITY_SCAN`, `NOT_RANKABLE`, `NR`, `FAIL`, zero `goodWhen`, zero `avoidWhen`, and 20 `watch` slices. Confirmed Oversold Recovery correctly returns `TRUE_BACKTEST_PORTFOLIO`, still `NOT_RANKABLE / NR`, with controlled-backtest suitability slices.

The strategy page is available at:

`http://100.86.108.108:19090/n50/backtesting/strategies/rsi30_willr80_closegtprev_tp125?scenario=nifty_100%3Acapital_16l`

## 2026-08-06 — Single-stock governed acceptance and complete regime context

The requested one-strategy/one-stock acceptance used Confirmed Oversold
Recovery on RELIANCE, scenario `single_stock:capital_16l:RELIANCE`, from the
latest validated published batch `255` (backtest run `90786`). The partial test
did not replace the full production dashboard batch.

The audit found and fixed two gaps: exact single-stock scenarios could not be
selected by the evaluator, and per-trade context omitted Bank NIFTY. Migration
`db/sql/020_strategy_evaluation_roe.sql` now additively stores stock/NIFTY
persistence and volatility plus Bank NIFTY trend, persistence, volatility and
market zone. Full regime records are retained in `context_json`. Eight slices
are produced: stock trend/zone, NIFTY trend/zone, Bank NIFTY trend/zone,
stock/NIFTY matrix and VIX regime.

Reusable command:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/accept_strategy_single_stock.py \
  --strategy-id rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10 \
  --symbol RELIANCE --capital-mode capital_16l
```

Acceptance result: `PASS` across all five gates. The run has one closed trade,
zero open positions and complete stock, NIFTY 50, Bank NIFTY and India VIX
context. Regime coverage was RELIANCE 158 rows (2025-11-10 to 2026-08-05), and
1,314 rows each for NIFTY 50, Bank NIFTY and India VIX (2021-03-08 to
2026-08-05).

The strategy verdict remains `TRUE_BACKTEST_ISOLATED / NOT_RANKABLE / NR` because
Rules-of-Engagement evidence gates fail. Pipeline acceptance does not override
strategy-quality governance.

Artifacts are under:

`platform/nifty_stratlab/outputs/acceptance/rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10/RELIANCE_capital_16l/`

This folder contains the 24-sheet workbook, three CSVs, strategy and acceptance
JSON/Markdown, and checksums. All files are registered in
`strategy_eval.artifact_manifest`.

During deployment verification the dashboard background scheduler showed Prisma
pool timeouts with the old default of two connections and five seconds. The
Compose defaults for the N50 API processes were raised to eight connections and
a 15-second pool timeout. The live dashboard was force-recreated with those
values and produced no further pool-timeout messages during the post-deploy
monitoring window. No database restart was required.

## 2026-08-06 — OIIS Phase-A three-year replay implementation

Reviewed every file in `/home/novius2/NIFTY50/TEST-OISS`: 951-line integration
prompt, 995 non-empty DOCX paragraphs/tables, database-mapping CSV, both PNG
diagrams, all ZIP entries, canonicalisation JSON and QA/readme files. The ZIP
passed `unzip -tq`; duplicate DOCX, Markdown and CSV copies are byte-identical
to the standalone files.

Critical interpretation: OIIS is a multi-engine framework, not a plug-and-play
single indicator. Six source conflicts remain owner/quant approval items. For
research only, `OIIS-CASH-DAILY-RESEARCH-V1.0` freezes the detailed documents'
nine-component OFactor and XFactor definitions. Live orders, options, futures,
probabilities and unapproved risk claims remain blocked.

Implemented:

- `platform/nifty_stratlab/src/nifty_stratlab/oiis/engine.py`: numeric DQ,
  independent LONG/SHORT OFactor, daily setup state, XFactor, structural
  penalties and hard-gate-first decisions;
- `platform/nifty_stratlab/config/oiis/formulas/oiis_cash_daily_research_v1.json`;
- guarded three-year workload
  `config/workloads/oiis_cash_daily_research_v1.json`;
- `db/sql/021_oiis_research.sql`: immutable `oiis` formula/run/decision/outcome/
  performance/artifact schema;
- `tools/run_oiis_cash_daily_replay.py`: current-panel Nifty 100 EOD feature
  construction, four-worker-ready replay, next-open controlled LONG outcomes,
  PostgreSQL persistence and consolidated reports;
- `scripts/oiis.sh`: no-agent validate, preflight, replay and verify commands;
- deterministic golden tests and full documentation under `docs/oiis`.

The Rules-of-Engagement regime importer was corrected to source current-panel
stock closes from `nse.fact_eod_prices` instead of the short latest backtest
feature batch. Committed live coverage is now 125,429 calculated rows: 121,484
stock rows for 100 symbols plus 3,945 index rows for NIFTY 50, Bank NIFTY and
India VIX. Stock coverage begins 2021-03-08 and covers the requested three-year
window.

Commands executed:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
chmod +x scripts/oiis.sh platform/nifty_stratlab/tools/{run_oiis_cash_daily_replay.py,validate_oiis_config.py,verify_oiis_replay.py}
bash -n scripts/oiis.sh
./scripts/oiis.sh validate-config
platform/nifty_stratlab/.venv/bin/pytest -q platform/nifty_stratlab/tests/phase3/test_oiis_cash_daily.py

cd platform/nifty_stratlab
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  .venv/bin/python tools/import_strategy_evaluation_roe.py \
  --workbook /home/novius2/NIFTY50/Rules-of-engegemnt/Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx \
  --rules /home/novius2/NIFTY50/Rules-of-engegemnt/CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md \
  --evaluation-strategy-id rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10 \
  --evaluation-scenario single_stock:capital_16l:RELIANCE

cd ../..
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' ./scripts/oiis.sh preflight
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --symbol RELIANCE --start 2023-08-06 --end 2026-08-05 --workers 1
./scripts/oiis.sh verify platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/04374697-c11e-4568-b0af-082eeeed5120
```

Acceptance run `07f2f31f-17d3-4f2e-8204-6fafe5bb3412` succeeded for RELIANCE:
718 daily decisions from 2023-08-07 through 2026-08-05, one enterable decision,
one target exit, ₹3,376.1881 after-tax net P&L and 100% win rate. This single
trade proves the pipeline only; it is not statistical evidence that OIIS works.
All 718 decisions have non-null stock, NIFTY 50, Bank NIFTY and VIX regimes.
Observed classes include four stock, four NIFTY, four Bank NIFTY trends and
three VIX regimes. Five artifact checksums passed.

OIIS replay runs are explicitly stored as
`TRUE_BACKTEST_ISOLATED / NOT_RANKABLE / NR`. The future all-symbol output is a
collection of isolated stock studies, not a disguised ₹16L/max-eight portfolio;
finite-capital cross-symbol replay remains a separate evaluation.

Two failed replay attempts remain in `oiis.replay_run` as deliberate audit
evidence. The first exposed an untyped nullable PostgreSQL filter; the second
exposed NaN JSON. Both were fixed. A final missing exact-date index session was
fixed with a backward-only, maximum-seven-day as-of join, never future data.

Acceptance artifacts:

`platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/07f2f31f-17d3-4f2e-8204-6fafe5bb3412/`

The guarded full replay was subsequently run and completed successfully:

```bash
CONFIRM_FULL_OIIS_REPLAY=YES \
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --start 2023-08-06 --end 2026-08-05 --workers 4
```

Full replay evidence (`e0c2ceab-7d88-47a2-9ea9-9a876fd58d16`) covers 99 eligible
current-panel symbols (TMPV excluded), 68,743 daily decisions and 23 isolated
LONG trades from 2023-08-07 through 2026-08-05. After-tax net P&L is
₹-50,181.8842 and win rate is 39.1304%. All persisted decisions have stock,
NIFTY, Bank NIFTY and India VIX regime context (zero missing values). Five
artifact checksums pass. The run is deliberately classified
`TRUE_BACKTEST_ISOLATED / NOT_RANKABLE / NR`: each stock is evaluated
independently, without ₹16L/max-eight finite-capital netting, and the result is
not evidence of profitability. The consolidated artifacts are at
`platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/e0c2ceab-7d88-47a2-9ea9-9a876fd58d16/`.

During the requested monitoring window the replay process was active at high
CPU with `oiis.replay_run` still `RUNNING` and no error; it then completed and
atomically persisted the database rows and reports. No restart was required.

The full query enforces the workload's TMPV demerger exclusion; the expected
eligible current-panel count is 99, not 100.

Every result is consolidated by run and includes symbol columns; the runner
does not create hundreds of per-stock folders. Dedicated OIIS API/UI/P-Diagram
pages remain Phase B and are explicitly recorded as not implemented in
`reports/oiis/OIIS_UI_RECONCILIATION.json`.

## 2026-08-06 — Common target-only exit correction

The preceding OIIS V1.0 result is superseded for comparison. It incorrectly
allowed OIIS to replace the programme's shared exit mandate with a structural
stop, 2R target and ten-session timeout. Database run
`e0c2ceab-7d88-47a2-9ea9-9a876fd58d16` is retained but its governance JSON now
contains `comparison_status=SUPERSEDED_EXIT_POLICY`.

The governing interpretation is now frozen in `docs/common-exit-contract/`.
Every long-equity strategy defines entry only. The actual exit is +0.30% during
the entry session; if not filled, the position becomes swing and exits only at
+1.00% from the original buy price. There is no stop-loss, indicator exit,
timeout, forced close or run-end sale. Adverse ladders, MAE and marked
liquidation value record risk without releasing capital.

Implemented formula `OIIS-CASH-DAILY-RESEARCH-V1.1`, shared evaluator
`evaluation/common_exit.py`, OIIS/hybrid integration, upward tick rounding,
entry-bar target evaluation, open-position accounting, target/adverse CSVs and
nullable/open outcome persistence. Phase 2 and Phase 3 tests pass 31/31.

Persisted RELIANCE acceptance run `51140c91-82f6-4437-92ad-555279108f74`
evaluated 718 decisions and one enterable position. It entered at ₹2,685.90 and
filled I030 at ₹2,694.00 at 09:28 IST on 2024-01-25. Quantity 74 produced
₹599.40 gross, ₹159.0053 proxy costs, ₹154.1382 tax reserve and ₹286.2566
after-tax realised P&L. MAE was -0.3463%; no stop or timeout field is populated.
All seven checksummed artifacts pass. The result remains
`OPPORTUNITY_SCAN / NOT_RANKABLE / NR` and is pipeline evidence only.
Its evidence-bound run hash includes the exact minute CSV SHA-256.

The corrected 99-symbol V1.1 replay is documented below. It completed with a
data warning for two symbols without minute CSV evidence.

## 2026-08-06 — Corrected full-universe replay

The corrected full run completed as
`37409597-ffd7-499c-b56f-885ec4d748bd` using formula V1.1 and the common
target-only exit. It evaluated 99 eligible symbols and 68,743 decisions. There
were 23 enterable decisions and 18 accepted positions with available minute
data; 15 closed at I030 and 3 closed at S100. All 18 closed positions released
capital only after target fill. After-tax realised P&L was ₹7,406.4913, gross
P&L ₹15,104.90, proxy costs ₹3,710.30 and tax reserve ₹3,988.11. No stop-loss,
timeout, indicator or forced-close exit occurred.

The best realised trade was VEDL at ₹1,020.5044 after tax. The lowest realised
winner was HAL at ₹281.4240. The worst observed path risk was VEDL MAE of
-22.3906%; that drawdown was recorded and did not trigger an exit. M&M and
MAXHEALTH lacked minute CSV evidence, accounting for five enterable decisions
not accepted. The run is therefore `SUCCEEDED_WITH_DATA_WARNINGS`, not a
complete all-source claim. No daily fallback or synthetic exit was used.

Artifacts:
`platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/37409597-ffd7-499c-b56f-885ec4d748bd/`
# 2026-08-06 — Full-path ladder V2 correction

The complete correction requested in `/home/novius2/NIFTY50/Fix-strategy`
is documented under `docs/full-path-ladder-v2/`. Start with its `README.md` and
source review. The important architecture rule is: the entry-path evaluator
scans all reward and adverse ladders through D+5 without early termination;
the separately named execution scenario may sell and release capital without
changing that evidence.

Canonical implementations:

- `evaluation/full_path_ladder.py`: six reward rows, six adverse rows and six
  checkpoints per accepted entry; no P&L or exit authority.
- `simulation/execution_scenarios.py`: no-stop/no-timeout I030-else-S100
  execution economics.
- `evaluation/common_exit.py`: compatibility facade only.
- migrations 022 and 023: normalized evidence plus old-run governance.

Commands executed from repository root:

```bash
git rev-parse --show-toplevel
git status --short
git branch --show-current
git remote -v

platform/nifty_stratlab/.venv/bin/python -m pytest \
  platform/nifty_stratlab/tests/phase3/test_full_path_ladder_v2.py \
  platform/nifty_stratlab/tests/phase3/test_common_exit_contract.py -q
platform/nifty_stratlab/.venv/bin/python -m pytest platform/nifty_stratlab/tests -q
./scripts/oiis.sh validate-config

# Migration 022 was applied twice to a disposable database, its four tables
# were inspected, and the disposable database was dropped. Production changes
# were then applied only after that check.
docker exec -i trading-stack-novius2-postgres-1 \
  psql -U trader -d tradingdb -v ON_ERROR_STOP=1 \
  < db/sql/023_full_path_ladder_run_governance.sql

# For local replay, read only the three PostgreSQL keys from the stack .env,
# strip CRLF, and build a libpq conninfo string. Do not source the whole file:
# its unquoted browser user-agent line is not shell syntax.
db_user="$(sed -n 's/^POSTGRES_USER=//p' /home/novius2/trading-stack/.env | head -1 | tr -d '\r')"
db_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' /home/novius2/trading-stack/.env | head -1 | tr -d '\r')"
db_name="$(sed -n 's/^POSTGRES_DB=//p' /home/novius2/trading-stack/.env | head -1 | tr -d '\r')"
export DATABASE_URL="host=100.86.108.108 port=5432 dbname=$db_name user=$db_user password=$db_password"

./scripts/oiis.sh replay --symbol RELIANCE --start 2023-08-06 --end 2026-08-05 --workers 1
./scripts/oiis.sh replay --symbol VEDL --start 2023-08-06 --end 2026-08-05 --workers 1

CONFIRM_FULL_OIIS_REPLAY=YES ./scripts/oiis.sh replay \
  --start 2023-08-06 --end 2026-08-05 --workers 4

./scripts/oiis.sh verify \
  platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/53b5bb32-6a33-470f-9884-8613fa18ad21
```

Acceptance sequence:

- 63 repository tests passed, including 12 required synthetic ladder cases.
- RELIANCE V1.3 acceptance: `26803207-5b90-4cdd-8ca9-f59601245291`.
  Its one entry reached all I030/I050/I070/S100/S200/S500 rungs even though
  the selected execution sold at I030.
- VEDL V1.3 late-exit acceptance: `3dc1de20-9d49-4a1b-bef9-91f85f06a137`.
  It reached no S target by D+5 but later sold at S100. This proves D+6 does
  not rewrite D+5 evidence and D+5 is not a hidden execution sale/timeout.
- Five-symbol V1.2 path pilot passed for RELIANCE, VEDL, PFC, WIPRO and HAL;
  V1.2 execution economics are nevertheless superseded because that adapter
  incorrectly ended at D+5.
- Canonical full V1.3 run: `53b5bb32-6a33-470f-9884-8613fa18ad21`.
  It has 99 symbols, 68,743 decisions, 23 enterable signals, 18 accepted
  positions, 108 reward rows, 108 adverse rows and 108 D0-D+5 checkpoints.
  All 18 paths passed coverage and monotonic invariants. Fifteen executions
  sold at I030 and three at later S100; realised after-tax P&L is ₹7,406.4913.

Correct full-run reach counts:

```text
Reward:  I030=15 I050=12 I070=10 S100=15 S200=11 S500=6
Adverse: A050=18 A100=17 A200=14 A500=6 A1000=1 A_GT1000=1
```

The old full V1.1 run `37409597-ffd7-499c-b56f-885ec4d748bd` and every other
V1.1 replay are now marked
`SUPERSEDED_EARLY_EXIT_TRUNCATED_LADDER / NOT_COMPARABLE_WITH_FULL_PATH_V2`.
V1.2 runs are marked as having valid V2 path labels where successful but
non-comparable D+5-truncated execution economics. V1.3 succeeded runs are
`CANONICAL_FULL_PATH_V2`.

Known data warning: minute CSV evidence is absent for `M&M` and `MAXHEALTH`.
The runner skipped their five enterable signals instead of fabricating paths.
The canonical result remains `OPPORTUNITY_SCAN / NOT_RANKABLE / NR`; it is not
a finite-capital portfolio result, a profitability claim, or order authority.
# Low trade-count diagnostic workbook

The all-stock V1.3 run had 68,743 daily decisions, 23 enterable signals and
18 accepted paths. This is expected from the strict OFactor/XFactor, setup,
reward-risk, liquidity and minute-data gates. Generate the review workbook with:

```bash
platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/create_oiis_diagnostic_workbook.py \
  platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/bc8b50e8-a3b5-4424-bea0-8bb06cbcf6be
```

The workbook is `oiis_diagnostic_review.xlsx` in that run folder. It includes
decision/gate counts, near-threshold rows, per-symbol frequency, all trades,
all reward/adverse ladder rows, regime slices and the two missing minute-data
symbols (`M&M`, `MAXHEALTH`). Do not relax thresholds based only on trade count;
review the `NearThreshold` and `GateFailures` sheets first.
# 30-session swing potential analysis

For each of the 18 accepted paths in run
`bc8b50e8-a3b5-4424-bea0-8bb06cbcf6be`, the maximum minute high over the next 30
available trading sessions was calculated. The result is
`swing_30_session_potential.csv` and the `Swing30DayPotential` sheet in
`oiis_diagnostic_review.xlsx`.

The first exploratory calculation was rejected because duplicate rows in
`nse.fact_eod_prices` can select a wrong instrument for a symbol/date and create
impossible prices. The final calculation uses the continuous minute series
anchored to the actual entry price; it is a hindsight potential measure, not a
guaranteed executable profit.

Final range: best ADANIPOWER +44.96% (gross position potential ₹89,745.55;
2024-06-03); lowest maximum-upside path VEDL +1.61% (₹3,214.78; 2024-07-05).
Median maximum upside was +13.245% across 18 entries.

# H30 V3 formal 30-session opportunity extension (2026-08-07)

The exploratory minute-high calculation above is retained as history but is
superseded for governed comparison by H30 V3, which uses canonical official
daily close. Begin at `docs/h30-v3/README.md`; the contract, code map, exact
commands and acceptance evidence are split into four low-context documents.

Implemented evaluator/ranking/report/database/API/UI and upgraded the OIIS
adapter to `OIIS-CASH-DAILY-RESEARCH-V1.4-H30`. The H30 evaluator is separate
from execution, receives no exit input, and always scans D0..D+29 when mature.
It cannot release capital or rewrite the D0/D+5 path.

Commands executed:

```bash
platform/nifty_stratlab/.venv/bin/pip install -e 'platform/nifty_stratlab[postgres,dev]'
platform/nifty_stratlab/.venv/bin/pytest \
  platform/nifty_stratlab/tests/phase3/test_h30_opportunity_v3.py \
  platform/nifty_stratlab/tests/phase3/test_full_path_ladder_v2.py \
  platform/nifty_stratlab/tests/phase3/test_common_exit_contract.py -q
npm --prefix neon-stock-terminal run --workspace @app/api typecheck
npm --prefix neon-stock-terminal run --workspace @app/web typecheck
npm --prefix neon-stock-terminal run --workspace @app/api build
npm --prefix neon-stock-terminal run --workspace @app/web build
docker exec -i trading-stack-novius2-postgres-1 psql -U trader -d tradingdb \
  -v ON_ERROR_STOP=1 < db/sql/024_h30_opportunity_v3.sql
./scripts/oiis.sh verify \
  platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/91992dfe-b09b-4c65-b409-d0a2c13fbece
```

Migration 024 was applied twice successfully. Final one-stock acceptance run
`91992dfe-b09b-4c65-b409-d0a2c13fbece` succeeded with one mature H30
observation and exactly 30 checkpoints. Its actual execution sold at I030 on
D0, while H30 continued to its maximum official close on D+27. All six reward
rungs remained true and the inherited ladder invariant remained PASS.

Artifacts are under:
`platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/91992dfe-b09b-4c65-b409-d0a2c13fbece`.
The UI route is `/backtesting/h30`; API is
`/v1/backtesting/h30/latest`. A one-stock result must remain
`PROVISIONAL_BLOCKED`, never final-ranked.

Validation: 69/69 Python tests passed; Node API/web typechecks and production
builds passed; OIIS verifier reconciled 22 checksummed files. The unrelated
full Node API suite is 56/57 because its `analyticsEventContext` test has a
calendar fixture that treats April 2026 as upcoming even though current date is
August 2026. This existing time-sensitive fixture was documented, not hidden.

# Full OIIS H30 re-evaluation started (2026-08-07)

The all-symbol updated-rule replay is running as
`3f6695e6-e55f-4d12-a672-9208039558e9` with four workers, requested range
`2016-01-01` through `2026-08-05`, and no symbol filter. It was started from
the repository root with:

```bash
dashboard_dsn="$(docker inspect trading-stack-novius2-n50-dashboard-1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DATABASE_URL=//p')"
host_dsn="${dashboard_dsn/@postgres/@100.86.108.108}"
host_dsn="${host_dsn%%\?*}"
CONFIRM_FULL_OIIS_REPLAY=YES \
  platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/run_oiis_cash_daily_replay.py \
  --database-url "$host_dsn" --start 2016-01-01 --end 2026-08-05 --workers 4
```

Initial monitoring confirmed a CPU-active worker and PostgreSQL reads with
status `RUNNING`; no error was recorded. The runner persists atomically after
all symbols, so intermediate decision/path counts remain zero until commit.
When complete, read the printed `output_dir`, run `./scripts/oiis.sh verify
<output_dir>`, and compare H30 ranking status, coverage, ladder invariants,
charts and the PostgreSQL summary before promoting any strategy.

Completion status for run `3f6695e6-e55f-4d12-a672-9208039558e9`:

- `SUCCEEDED`; requested 2016-01-01 through 2026-08-05.
- 99 symbols, 121,316 daily decisions, 27 accepted paths/trades.
- 27/27 H30 observations mature with 30 checkpoints each.
- Full-path ladder invariant `PASS`; after-tax execution P&L ₹13,026.2505.
- H30 diagnostic score `56.0429`; final rank correctly remains
  `PROVISIONAL_BLOCKED` because certified cost/sector/corporate-action gates
  and the 100-mature-entry gate are not met.
- Missing minute evidence remained limited to `M&M` and `MAXHEALTH`; these
  symbols were skipped rather than given fabricated execution paths.
- Output directory:
  `platform/nifty_stratlab/outputs/oiis_cash_daily_research_v1/3f6695e6-e55f-4d12-a672-9208039558e9`
- `./scripts/oiis.sh verify <output_dir>` passed all 22 checksums and required
  H30 artifacts.

# OIIS low-trade diagnosis (2026-08-07)

Detailed gate analysis is in
`docs/oiis/OIIS_LOW_TRADE_DIAGNOSIS_2026-08-07.md`. The key result is 121,316
decisions → 32 enterable signals → 27 executable paths. The dominant primary
rejections were `NO_OPPORTUNITY` (104,622; 86.24%) and `DO_NOT_CHASE` (12,136;
10.00%). Overlapping gate evidence shows `OFACTOR_BELOW_MINIMUM` on 107,295
rows and `NO_VALID_SETUP` on 101,770 rows. Five enterable signals lacked
usable minute coverage: M&M and MAXHEALTH have no file, while PFC,
SHRIRAMFIN and VEDL signals are after the 2025-08-06 minute-file endpoint.
The generated workbook is `oiis_diagnostic_review.xlsx` in the completed run
folder.

Exact live entry criteria, formulas, thresholds, and decision precedence are
documented in `docs/oiis/OIIS_ENTRY_GATE_CRITERIA.md`. It also records the
important distinction between thresholds present in the JSON configuration and
thresholds that are currently enforced by the engine.
## Numeric OIIS decision flow

The detailed indicator definitions, threshold sequence, actual full-run funnel counts, accepted-signal medians, execution coverage, and ladder/exit interpretation are documented in [OIIS_DECISION_FLOW_NUMERIC_2026-08-07.md](docs/oiis/OIIS_DECISION_FLOW_NUMERIC_2026-08-07.md).
## Three entry-only strategy integration

The supplied EMA61 reclaim, ICE accumulation, and monthly/weekly reversal strategies are integrated through `platform/nifty_stratlab/tools/run_three_entry_only_replay.py`. Their rules, shared exit mapping, smoke result, and full-run command are documented in [THREE_ENTRY_ONLY_STRATEGIES_INTEGRATION.md](docs/strategies/THREE_ENTRY_ONLY_STRATEGIES_INTEGRATION.md).

## NIFTY 50 daily Yahoo regime ingestion (2026-08-08)
- Script: `platform/nifty_stratlab/tools/ingest_nifty50_yfinance_regime.py`
- Migration: `db/sql/025_nifty50_yfinance_daily_regime.sql`
- PostgreSQL table: `strategy_eval.nifty50_daily_regime` (one row per NIFTY trading date).
- Excel/CSV outputs: `platform/nifty_stratlab/outputs/nifty50_yfinance_regime/`.
- Run: set `DATABASE_URL` (or `TRADING_DATABASE_URL`) and execute the script; it is idempotent/upsert-based and never deletes existing rows.
- Rules and examples: `platform/nifty_stratlab/docs/NIFTY50_YFINANCE_REGIME_INGESTION.md`.

## NIFTY 500 stock daily Yahoo regime ingestion (2026-08-08)
- Script: `platform/nifty_stratlab/tools/ingest_nifty500_yfinance_regime.py`.
- PostgreSQL table: `strategy_eval.stock_daily_regime`, keyed by `(stock_name, trade_date)`.
- The current NSE NIFTY 500 list is fetched from the NSE archive and symbols are mapped to `<SYMBOL>.NS`.
- Excel is split into `DAILY_1`, `DAILY_2`, etc. because a single Excel sheet cannot exceed 1,048,576 rows.
- `--csv-input <file>` reloads an existing CSV into PostgreSQL without refetching Yahoo data.
- Detailed rules: `platform/nifty_stratlab/docs/NIFTY500_YFINANCE_REGIME_INGESTION.md`.

## Global market daily regimes (2026-08-08)
- Script: `platform/nifty_stratlab/tools/ingest_global_yfinance_regime.py`.
- Table: `strategy_eval.global_market_daily_regime`, keyed by `(instrument_name, trade_date)`.
- Instruments: `CRUDE_OIL`, `GOLD`, `USD_INR`, `DOW_JONES`, `INDIA_VIX`.
- Outputs: `platform/nifty_stratlab/outputs/global_yfinance_regime/`.
- Detailed ticker/rule reference: `platform/nifty_stratlab/docs/GLOBAL_MARKET_YFINANCE_REGIME_INGESTION.md`.

## Universal Strategy Evaluation V2 (2026-08-08)

- Governing source reviewed completely: `/home/novius2/NIFTY50/Universal-Evalaution/UNIVERSAL_STRATEGY_EVALUATION_MASTER_PROMPT_V2.0.md` and its usage guide.
- Main evaluator: `platform/nifty_stratlab/tools/evaluate_strategy_universal.py`.
- Future-run wrapper: `platform/nifty_stratlab/tools/run_with_universal_evaluation.py`; this runs the backtest first and creates the universal artifacts only after a zero exit code.
- Policy: `platform/nifty_stratlab/config/evaluation/universal_strategy_evaluation_v2.json`.
- Database migration: `db/sql/028_universal_strategy_evaluation.sql`.
- Operating guide: `platform/nifty_stratlab/docs/UNIVERSAL_STRATEGY_EVALUATION_V2_IMPLEMENTATION.md`.
- Default output is one detailed Excel workbook and one consolidated `<STRATEGY>_Trades.csv` for all stocks in the run. Do not create per-stock trade-report folders.
- Use `--authoritative-exit` only when the supplied `exit_reason` is owned by the versioned strategy. Never use it for entry-only/shared-RoE scenario exits.
- Smoke command:
  `platform/nifty_stratlab/.venv/bin/python platform/nifty_stratlab/tools/evaluate_strategy_universal.py --input-dir platform/nifty_stratlab/outputs/OIIS_49_FACTOR_ANALYSIS_BUNDLE_2026-08-07/results/o70_x70 --strategy-name OIIS_O70_X70 --strategy-version 2026-08-07 --archetype ENTRY_ONLY --output-dir platform/nifty_stratlab/outputs/universal_evaluation_v2/OIIS_O70_X70`
- Validated output: `platform/nifty_stratlab/outputs/universal_evaluation_v2/OIIS_O70_X70/`; 137 trade rows, 25 Excel sheets, DOCX, JSON, CSV, charts, SHA catalogue and ZIP.
- Correct fail-closed result: `NOT_SCORABLE_METHOD_FAILURE`. Exit authority, finite-capital daily equity and chronological OOS evidence were not supplied, so no numeric score or portfolio-return claim is allowed.
- Tests: `platform/nifty_stratlab/.venv/bin/python -m pytest platform/nifty_stratlab/tests/phase3/test_universal_evaluation.py platform/nifty_stratlab/tests/phase3/test_full_path_ladder_v2.py platform/nifty_stratlab/tests/phase3/test_h30_opportunity_v3.py platform/nifty_stratlab/tests/phase3/test_rules_of_engagement.py` -> 24 passed.

## OIIS component DOE and regime integration (2026-08-08)

- Extracted and reviewed `OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0.zip`; archive integrity passed. Governing matrix contains 147 registered trials.
- Do not call the prior 49 O/X threshold combinations factors. Component DOE covers the nine actual OFactor and nine actual XFactor components. FFactor remains undefined.
- Engine update: `src/nifty_stratlab/oiis/engine.py` accepts governed fraction/percentage mixture weights and returns component weights plus weighted contributions.
- Runner: `platform/nifty_stratlab/tools/run_oiis_component_doe.py`.
- Database migration: `db/sql/029_oiis_component_doe.sql`.
- Full implementation and runbook: `platform/nifty_stratlab/docs/OIIS_COMPONENT_DOE_V1_IMPLEMENTATION.md`.
- Regime joins use `strategy_eval.stock_daily_regime`, `strategy_eval.nifty50_daily_regime` and `strategy_eval.global_market_daily_regime`; retained indicator positions include RSI14, volatility, 21-day return, trend score and distance from SMA20/SMA50.
- Default output remains one consolidated `trades.csv` across stocks/trials, plus `component_event_scores.csv` and one detailed Excel workbook in the same run folder.
- Successful acceptance run: `platform/nifty_stratlab/outputs/oiis_component_doe_v1/5a4494f1-4737-43ec-87fa-989fbb9e1835` for RELIANCE, 2024-01-01 through 2025-12-31, baseline + O_MRS ablation + X_SIS ablation.
- Acceptance counts: 3 trials, 498 decisions/trial, 40,338 component-event rows, 3 scenario trades; PostgreSQL status `SMOKE_SUCCEEDED`.
- The test is not factor-ranking evidence: only one accepted trade per treatment. Proceed to Stage 0 multi-stock baseline reconciliation before the 147-trial DOE.

### Full-universe DOE launch (2026-08-08)

- Runner now supports `--all-stocks` (all symbols in `strategy_eval.stock_daily_regime`) and `--all-trials` (all 147 governed matrix rows), with consolidated per-run CSV artifacts rather than per-stock folders.
- Validation command launched:
  `pw=$(grep '^POSTGRES_PASSWORD=' /home/novius2/trading-stack/.env | cut -d= -f2- | tr -d '\r'); export DATABASE_URL="postgresql://trader:${pw}@100.86.108.108:5432/tradingdb"; platform/nifty_stratlab/.venv/bin/python platform/nifty_stratlab/tools/run_oiis_component_doe.py --all-stocks --start 2024-01-01 --end 2025-12-31 --max-trials 3`
- Live validation output folder: `platform/nifty_stratlab/outputs/oiis_component_doe_v1/dfc02ea6-27cc-4ad1-b8fc-0512a5869662`; process is monitored by the active terminal session. It writes consolidated `component_event_scores.csv`, `trades.csv`, target/adverse events, decision component events, trial summary, factor effects and regime performance.
- Actual minute CSV inventory is 100 files under `/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50`; the PostgreSQL daily regime universe is 500 symbols. All 500 receive daily/component DOE evaluation; minute-level path evidence is available only where a matching CSV exists and is never fabricated.
- After validation completes without errors, launch the full matrix with `--all-stocks --all-trials` using the same command and archive the run folder. Full component-event output is intentionally large.
- Code commit pushed to `DEV_PM_CODE`: `877d948`.
# Current OIIS DOE milestone

The corrected OIIS baseline and complete 18-component screening workflow is documented in [docs/nifty-stratlab/OIIS_18_COMPONENT_SCREENING_RUNBOOK.md](docs/nifty-stratlab/OIIS_18_COMPONENT_SCREENING_RUNBOOK.md). Use `./scripts/oiis_doe.sh status` before starting or resuming work. Do not optimise weights or O/X aggregate thresholds in this milestone.

## 2026-08-08 completed OIIS screening execution

- Branch: `DEV_PM_CODE`.
- Recovery branch: `recovery/pre-oiis-18-component-screening-20260808`.
- Experiment: `OIIS18_20260808T171037Z`.
- Output: `platform/nifty_stratlab/outputs/oiis_complete_screening_v2/OIIS18_20260808T171037Z`.
- Stable handoff ZIP: `OIIS_COMPLETE_18_COMPONENT_SCREENING_HANDOFF_FINAL.zip` in the experiment output directory. The timestamped authoritative source path, exact size and SHA-256 are stored in `state.json` under `steps.export`; verify again with `sha256sum` and `unzip -tq` after any metadata refresh.
- Frozen feature evidence: 226,575 stock-date decisions, 497 symbols, 2024-01-01 through 2025-12-31.
- Minute evidence: 100 files and 89,243,241 rows; 99 admitted and HDFCLIFE rejected under the >=1% malformed-OHLC policy. Admitted-source common range is 2024-11-13 through 2025-08-06.
- Corrected baseline: deterministic hash `db2c379fefed9e8cb15fb206a15c2e42f1cc7b9496edd9f0cde00392dc26585e`; 28,300 O-qualified, 120 enterable, 22 executed, INR 8,560.9558 total NLV P&L, 40.9091% clean I030-before-A050 and 95.4545% D+5 success.
- Baseline mode A: INR 8,560.9558 NLV P&L and -2.3280% daily total-NLV maximum drawdown.
- Baseline mode B: INR 8,560.9558 NLV P&L and -1.4565% daily total-NLV maximum drawdown.
- D+5 diagnostic portfolio: INR -19,504.3074, clearly separated from the authoritative target-only exit.
- Completed: 18 primary ablations, 13 material neutral-at-50 sensitivities and 3 focused double-off factorial cells; 35 governed trial rows total.
- MRS: `RETAIN_PROVISIONALLY`, primary influence 54.7247/100, net benefit 59.7504/100 and evidence confidence only 2.75/100.
- SIS/TCS: `UNRESOLVED`; their single-ablation economics are identical and the 2x2 interaction has only 15 effective paths.
- CCS, TSQ and IOQ: `NOT_ESTIMABLE`; each is static in the full 226,575-row component event table.
- O-LTS/X-LSQ: identical on 100% of decisions with correlation 1.0; redundancy remains a hypothesis, not removal authority.
- Chronology: zero valid outer folds; one descriptive non-compliant block; final holdout not validly evaluable and prospective 60-session shadow pending.
- Promotion blockers: one repeated historical constituent panel (`BLOCKED_LEAKAGE`) and corporate-action facts beginning only 2026-02-20 (`BLOCKED_DATA`).
- Tests: all `platform/nifty_stratlab/tests` passed (91 tests); focused Phase 3 suite passed (58 tests).
- Disposable database: migration `db/sql/030_oiis_doe_v2.sql` applied idempotently to `oiis_doe_test`; export persisted 35 trials, 108 factor-effect rows and 375 artifact catalogue rows.

Commands used are reproduced in the ZIP at `18_RUN_COMMANDS.md`. The latest live logs are under the experiment `logs/` directory. Do not promote, optimise weights, or optimise aggregate O/X thresholds until point-in-time universe and corporate-action blockers are repaired and the study is rerun.

## OIIS all-signal O=0/X=1 diagnostic capture (2026-08-08)

- Purpose: create an uncensored dataset for later OFactor/XFactor threshold and component-sensitivity analysis. `O=0` and `X=1` are diagnostic floors, never a proposed live configuration. FFactor is not defined in the accepted engine, so the user's “F=1” instruction is represented by the execution/XFactor floor.
- Run ID: `22808cf7-c0b3-4beb-9420-6b9e2b40f7ac`.
- Output: `platform/nifty_stratlab/outputs/oiis_all_signal_capture_v1/22808cf7-c0b3-4beb-9420-6b9e2b40f7ac`.
- Requested period: 2023-01-01 through 2026-08-07. Actual signal coverage: 2023-01-02 through 2026-08-06.
- Universe: 499 eligible stocks from the 500-stock PostgreSQL regime universe. TMPV remains excluded because of the previously governed demerger exception.
- Source: 536 files/20 GiB at `/home/novius2/data/algo-trading-data-nifty-100-data-with-indicators`; 496/499 symbols resolved to base `_minute.csv` files. CIEINDIA, JSWDULUX and PFOCUS retain daily/H30 evidence but carry `MINUTE_FILE_NOT_FOUND` for minute paths.
- Result: 388,240 stock-date observations and 242 columns. Minute path status: 353,822 complete, 31,594 absent entry sessions, 1,592 missing minute sources, 733 incomplete entry sessions and 499 no-next-session rows.
- Master artifacts: `OIIS_ALL_SIGNAL_MASTER.parquet` (274 MiB), `OIIS_ALL_SIGNAL_MASTER.csv.gz` (249 MiB), `OIIS_ALL_SIGNAL_EXECUTIVE_SUMMARY.xlsx` and `OIIS_ALL_SIGNAL_REGIME_SUMMARY.csv`.
- Indicator fields include RSI14, Williams %R14, EMA61 and close distance, Bollinger 20/2 levels and position, stochastic FastK/SlowK, volume/SMA20/EMA20/EMA60 and ratios, MACD line/signal/histogram, all long/short O and X component values and weighted contributions, gates, Nifty/Bank Nifty/VIX and CRUDE_OIL/DOW_JONES/GOLD/INDIA_VIX/USD_INR context.
- Outcomes independently retain intraday +0.3/+0.5/+0.7, D0-D5 +1/+2/+5, H30 +1/+2/+5/+10/+20, the full adverse ladder, timing, MFE/MAE, and Nifty-relative returns. These are path diagnostics with no early exit and no realised-P&L claim.
- PostgreSQL: `oiis_research.all_signal_run`, partitioned parent `oiis_research.all_signal_observation`, 44 monthly `all_signal_observation_YYYYMM` partitions and latest-run view `oiis_research.all_signal_latest`. Exactly 388,240 production research rows reconciled after an 866-row disposable database smoke.
- Warm-up gaps are not fabricated: RSI14 1,375 nulls; Williams %R14 1,276; EMA61 6,132; MACD 2,464. Use `data_quality_score`/`data_permission` and explicit null checks in analysis.
- Validation: RELIANCE smoke produced 866 rows/242 columns and 800 complete minute paths. Full uniqueness, observation-hash completeness, target-ladder monotonicity and PostgreSQL reconciliation passed. Entire project suite: 94 passed.
- Implementation: `platform/nifty_stratlab/tools/run_oiis_all_signal_capture.py`; wrapper `scripts/oiis_all_signal_capture.sh`; migration `db/sql/031_oiis_all_signal_capture.sql`; detailed guide `platform/nifty_stratlab/docs/OIIS_ALL_SIGNAL_CAPTURE_V1.md`; tests `platform/nifty_stratlab/tests/phase3/test_oiis_all_signal_capture.py`.

Exact commands:

```bash
./scripts/oiis_all_signal_capture.sh init --start 2023-01-01 --end 2026-08-07
./scripts/oiis_all_signal_capture.sh run --workers 1 --symbol RELIANCE --start 2023-01-01 --end 2026-08-07
./scripts/oiis_all_signal_capture.sh run --workers 12 --start 2023-01-01 --end 2026-08-07
./scripts/oiis_all_signal_capture.sh consolidate
POSTGRES_DB=oiis_doe_test ./scripts/oiis_all_signal_capture.sh load-db
./scripts/oiis_all_signal_capture.sh load-db
./scripts/oiis_all_signal_capture.sh status
platform/nifty_stratlab/.venv/bin/python -m pytest platform/nifty_stratlab/tests -q
```

The first disposable COPY exposed and then verified fixes for a column-count mismatch and a missing terminal-row hash. The failed COPY transactions rolled back; no partial database evidence survived. Consolidation initially exposed Arrow null/string inference across sparse new-listing fragments; the final typed pandas union corrected it without rerunning or altering source paths.

## Universal PostgreSQL paper-trading service (2026-08-09)

- Versioned source: `services/paper_trading`; stack overlay: `compose/compose.paper-trading.yml`; runtime copy: `/home/novius2/trading-stack/services/paper_trading`.
- This is PAPER-only. Startup requires `PAPER_TRADING_ONLY=true`, the public API rejects `environment=LIVE`, and there is no broker adapter or dormant live execution path.
- Architecture: one image with `paper-api`, `paper-monitor-worker`, `paper-webhook-worker`, `paper-scheduler`, and one-shot `paper-migrate`. PostgreSQL is both system of record and durable work queue.
- Source market contract verified on the live database: `public.bars_1m(ts, exchange, symbol_token, open, high, low, close, volume, source, created_at, oi)` and `public.instruments`. Paper state is additive and isolated in schema `paper_trading`.
- Live migration: `001_init`; 56 tables/views are present. The application records requests, idempotency, groups/legs, orders/fills, positions, independent targets, 5/30-session observations, ledgers, audit events, cursors, summaries, outbox attempts and dead letters.
- Strategy integration: POST the universal schema in `services/paper_trading/schemas/inbound/trade-intent-v1.schema.json` with bearer auth and a stable `Idempotency-Key`. Start with `examples/requests/01_oiis_long_stock.json`; details are in `README.md` and `docs/api-contracts.md`.
- Actual execution and analytical evidence are separate. Intraday 0.3/0.5/1% and swing 1/3/5% tracks are independently evaluated; all targets crossed in a bar are retained; analytical tracks continue after the actual position closes; 5- and 30-session paths record MFE, MAE, drawdown and censoring.
- Cash equities and atomic or incrementally assembled multi-leg options are supported. A group closes only after every leg has zero remaining quantity and no active orders; option group valuations require synchronous valid marks and an explicit percentage denominator.
- Decimal/NUMERIC financial logic separates gross P&L, itemised costs, net-before-tax, the configurable 35% positive-profit management provision and net-after-tax. Analytical profits are marked hypothetical and never summed as realised portfolio profit.
- Webhooks use a transactional outbox, CloudEvents payloads, HMAC-SHA256, Basic authentication, retry/backoff, dead letters and replay. The configured production URL currently returns n8n 404: `POST codex-paper-trade` is not registered/active. Import and activate `services/paper_trading/n8n/workflows/paper-trading-events-v1.json`; configure Basic auth and `PAPER_WEBHOOK_SIGNING_SECRET`; then replay retained events.
- Live services: `trading-stack-novius2-paper-api-1`, `-paper-monitor-worker-1`, `-paper-webhook-worker-1`, and `-paper-scheduler-1`. API binds only to `127.0.0.1:18088`; PostgreSQL exposure was not changed.
- Runtime secrets are in `/home/novius2/trading-stack/.env.paper-trading`, mode 0600, and must never be committed or echoed. The repository contains only `.env.example` and deterministic test credentials.
- Start/update commands:
  `cd /home/novius2/trading-stack && docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml --profile tools run --rm --no-deps paper-migrate`
  then `docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml up -d --build --no-deps paper-api paper-monitor-worker paper-webhook-worker paper-scheduler`.
- Verify commands: `curl -fsS http://127.0.0.1:18088/health/ready`; `docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml exec paper-api papertrade reconcile --account paper-main`; query `paper_trading.v_open_trade_groups`, `v_trade_execution_performance`, `v_target_track_results`, `v_webhook_delivery_health`, and `v_data_freshness`.
- Test command: from `services/paper_trading`, start its disposable PostgreSQL with `docker compose up -d postgres mock-n8n && docker compose run --rm paper-migrate`, then run `TEST_DATABASE_URL=postgresql://paper:paper-test-only@127.0.0.1:15432/papertrade ./scripts/test.sh`.
- Verified gates: 18 tests passed against PostgreSQL 16, Ruff passed, mypy passed, 84% overall meaningful coverage, dependency audit found no known vulnerabilities, Docker image build passed, internal API readiness passed, monitor-once passed, and live reconciliation found zero invalid closed groups.
- Benchmark: 187,500 bars for 500 symbols and 562,500 target evaluations completed in 0.7735 seconds on the local CPU (242,420 bars/sec; 727,260 target evaluations/sec; 449,180 KiB maximum RSS). This is a compute benchmark, not a production PostgreSQL soak test.
- Least-privilege role guidance is in `services/paper_trading/migrations/roles.example.sql`. Review and set passwords out-of-band before applying; do not replace the deployed database role without a coordinated credential rotation.

### n8n activation and replay verification (2026-08-09)

- The production n8n endpoint is now active and accepted a signed paper event with HTTP 200.
- Replay initially exposed an abandoned-lease/attempt-number defect. `papertrade replay-dead-letters` now preserves delivery history; the webhook worker requeues expired `PROCESSING` leases and chooses the next unused attempt number.
- After rebuilding the API and webhook worker, all four retained events were reclaimed as attempt 2 and delivered HTTP 200. The live outbox is fully `DELIVERED` with no stuck rows.
- The service regression gate remains green: 18 PostgreSQL-backed tests, Ruff, mypy and 84% coverage.

## Deployed trading-stack source reconciliation (2026-08-09)

- `/home/novius2/trading-stack` is the deployed runtime directory and is intentionally not a Git checkout. Its canonical, secret-free source is this repository on branch `DEV_PM_CODE`.
- Reconciled the previously runtime-only NIFTY LargeMidcap 250 SmartAPI collector, three-year resumable daily backfill, F&O plan, monthly `YYYY_MM` partitions and consolidated equity webhook forwarder into Git.
- Never copy runtime `.env`, `.env.collector.runtime`, `.env.paper-trading`, `config/config.yaml`, `state/OpenAPIScripMaster.json`, logs, caches or generated data into Git. Only `config.example.yaml` and documented placeholders are versioned.
- Universe evidence: 250 active equities and nine indices. Current active subscriptions are 250 EQUITY, 379 FUT, 162 OPTIDX and 2,200 OPTSTK. The latest derivative plan contains 2,953 rows: 2,575 active and 378 capacity-dropped rows retained for REST rotation.
- Daily-history evidence: 198,852 rows for 259 distinct tokens from 2023-01-09 through 2026-08-07. Backfill resumes per token via `LatestBar1DDate`.
- Storage evidence: 33 current monthly child relations use readable `_YYYY_MM` names. The migration preserves recovery originals and validates row counts before cutover.
- Collector webhook is configured only through ignored `STOCK_WEBHOOK_URL` and `STOCK_WEBHOOK_ENABLED`. It sends one symbol-sorted, equity-only JSON batch after a successful primary quote cycle; failures never roll back database persistence.
- Relevant implementation files: `cmd/collector/stock_webhook.go`, `cmd/collector/tasks.go`, `internal/config/config.go`, `internal/store/partitions.go`, `scripts/update_nifty250_universe.py`, and `scripts/migrate_timeseries_monthly_partitions.sql`.
- Full operations and evidence: `docs/worklogs/nifty250-smartapi-cash-fno-history.md`, `docs/worklogs/stock-quote-webhook-forwarding.md`, `docs/adr/ADR-013-nifty250-smartapi-cash-fno-history.md`, and `docs/adr/ADR-014-readable-monthly-timeseries-partitions.md`.
- Verification run: `go test ./...` passed; the universe refresh script compiled; base/core and paper Compose configurations parsed; collector, PostgreSQL and all four paper-trading services were healthy; collector restart count was zero; paper API readiness and migration `001_init` passed.
- Repeat validation:
  `cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026 && go test ./... && python3 -m py_compile scripts/update_nifty250_universe.py`
  and from `/home/novius2/trading-stack`: `docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.core.yml config --quiet`.

## OIIS Live daily selection, paper entry and dashboard (2026-08-09)

### Authoritative outcome

- Accepted source: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`, branch `DEV_PM_CODE`; deployed mirror: `/home/novius2/trading-stack`.
- Reviewed every supplied file under `/home/novius2/NIFTY50/OLLS-LIVE`: the implementation prompt, JSON policy, DOCX methodology and XLSX watchlist fixture.
- Policy ID: `OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0`. HIGH/MEDIUM/LOW is daily screening only. Automatic trade permission additionally requires canonical O>=74 and X>=76.
- Daily operational admission requires DQ>=85, `FULL` permission and no unresolved hard gate. An initially over-broad implementation omitted the hard-gate check and produced 489 recent candidates. That evidence is superseded, not deleted. The corrected regression exactly reproduces 18 rows for 3–6 August: 1 HIGH, 11 MEDIUM, 6 LOW; INTELLECT and OLAELEC are the two canonical rows.
- No minute source contains INTELLECT or OLAELEC for those signal dates. Both recent execution paths are explicit `ENTRY_DATE_AFTER_SOURCE_END` skips. Never convert them into assumed entries.
- Fresh 7 August evaluation covered 500 stocks and selected zero valid daily candidates after the correction. The generated 10 August watchlist is therefore empty. The UI may add a monitor-only row or an explicit paper-only operator override; it must not invent an automatic candidate.

### Entry and exit contract

- The worker runs at/after 08:40 Asia/Kolkata on weekdays and catches up after restart. It chooses the latest completed daily evidence and stores the list for that trade date.
- The collector merges every active OIIS list symbol into its priority subscription set. Current OIIS subscription count is zero because the corrected 10 August list is empty.
- A permitted row enters only on the first completed one-minute observation where RSI(14)<30 and Williams %R(14)<-80, filled at the next eligible minute open.
- `UNIQUE(policy_id,trade_date,symbol)` plus paper API idempotency guarantees one entry per stock per day across restarts/workers. The same stock may open a separate position on a later date.
- Actual exit remains I030 (+0.30%) on D0; if missed, S100 (+1%) begins on D+1. There is no stop, forced close, D+5 timeout or run-end liquidation.
- Paper migration `002_target_lifecycle` stores `INTRADAY` versus `SWING` on execution target rules. The monitor filters by lifecycle, so S100 cannot execute on D0.
- Diagnostic I030/I050/I070, S100/S200/S500, adverse, D+5 and H30 paths remain independent and continue after actual close.

### Data and schema

- Additive migration: `db/sql/032_oiis_live.sql`; runner `scripts/db_migrate_all.sh` now includes SQL 025–032.
- Durable schema: `oiis_live.policy_version`, `selection_run`, `daily_candidate`, `watchlist_item`, `intraday_evaluation`, `entry_claim`, `command_queue`, `service_heartbeat`, `error_outbox`, `historical_run`, `historical_trade`, plus `v_current_watchlist` and `v_service_diagnostics`.
- Source coverage verified: `nse.fact_eod_prices` 2021-03-08 through 2026-08-06; `strategy_eval.stock_daily_regime` through 2026-08-07 for 500 stocks; `public.bars_1m` through 2026-08-08.
- Do not expose a Docker socket to the UI. `/strategy/oiis-live` shows application heartbeats, source watermarks, durable queue counts, paper states and error delivery. Use `./scripts/oiis_stack_status.sh` for privileged container status.

### Three-year corrected review

- Final artifacts: `reports/oiis-live/20260809/full-history/` and `recent-week/`; primary narrative: `reports/oiis-live/20260809/EXECUTIVE_REVIEW.md`.
- Requested 2023-08-01 through 2026-08-07: 2,485 daily candidates, 130 canonical candidates, 115 triggered paths, 97 traded symbols, 106 I030 actual closes and 9 later S100 closes; no open path at the available end.
- Current-cost-profile scenario: gross ₹83,142.02; charges ₹33,611.03; net before provision ₹49,530.99; 35% management provision ₹17,335.85; net after provision ₹32,195.14. This is unconstrained path economics, not a finite-capital return.
- Independent hit rates: I030 92.17%, I050 87.83%, I070 79.13%, D+5 S100 93.91%, S200 84.35%, S500 57.39%.
- Median H30 MFE 11.13%; maximum 57.86%. Median H30 MAE -6.76%; worst -33.79%. Median actual holding is 10 minutes; maximum is 41 trading sessions. These drawdown/capital-lock findings are essential because the strategy has no stop or timeout.
- Nifty regimes are present for all 115 trades: 58 SIDEWAYS, 37 TRANSITION and 20 UPWARD. VIX: 88 LOW, 24 NORMAL and 3 HIGH; HIGH is insufficiently sampled. Historical stock-regime mapping is missing for 93 trades, so stock-regime attribution is not estimable and is never fabricated.
- Final Postgres evidence run: `49657e90-ba0e-4cfa-b295-da96a3d2949b`; 115 rows; result hash `80f588ab1763d2aa666ba75e0f0c8eea1bdcc56ce4a4e8394b2a4a08a8c4f267`.
- `run_oiis_live_backtest.py --persist-existing` provides restart-safe artifact-to-Postgres persistence after an export succeeds. It normalises missing regimes to JSON null and rejects non-standard NaN JSON.

### UI, collector, paper and alerts

- UI/API: `/strategy/oiis-live`, `/v1/oiis-live/dashboard`, CRUD `/watchlist`, and durable `/commands`. Authentication remains mandatory. A real authenticated create/patch/delete monitor-only smoke returned 201/200/204; the soft-deleted smoke row is hidden from the active list.
- OIIS container: `services/oiis_live`; Compose overlay `compose/compose.oiis-live.yml`; non-root, read-only filesystem, PAPER-only, separate health check and retrying error outbox.
- SmartAPI dynamic list: `internal/store/postgres.go` and `cmd/collector/subscriptions.go`. Generated rows and manual active rows are collected even when entry is disabled, so evidence exists before permission changes.
- Error hook contract is Mattermost-compatible: top-level `text`, structured evidence under `props.oiis_error`. The synthetic `SyntheticVerification` event was durably stored and reached `DELIVERED` in one attempt.
- The paper API is live/ready with migration `002_target_lifecycle`. Current queue: zero pending paper webhooks and zero pending OIIS errors. Historical paper dead letters from earlier endpoint testing are preserved for audit.

### Verification actually executed

- OIIS unit tests: 7 passed.
- OLLS supplied regression: exact 18 candidates, exact 1/11/6 level split, exact two canonical symbols.
- Paper unit regression: 12 passed; disposable PostgreSQL integration: 4 passed. These specifically include independent target ladders and D+1 swing lifecycle.
- Collector: `go test ./internal/store ./cmd/collector` passed; live collector healthy and its consolidated stock webhook continues returning HTTP 200.
- API and web TypeScript production build passed. Authenticated dashboard smoke returned 200 with trade date 2026-08-10, freshness and queue payloads. Unauthenticated access returned the expected 401.
- OIIS image and N50 image builds passed. Live OIIS, collector, PostgreSQL and paper API are healthy; paper monitor/webhook/scheduler are running; N50 `/health` reports `ok=true`, `ready=true`, DB connected.
- OIIS error delivery passed. Paper reconciliation has no duplicate OIIS entries and no accepted entry without a group.
- NPM reported 13 dependency advisories (8 moderate, 3 high, 2 critical). Do not run an unreviewed major-version `npm audit fix`; schedule a separate dependency-upgrade branch and full UI regression.

### Exact safe operations

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
./scripts/db_migrate_all.sh
docker build -t trading-stack-oiis-live:1.0.0 -f services/oiis_live/Dockerfile .
./scripts/oiis_stack_status.sh

docker compose -p trading-stack-novius2 --env-file /home/novius2/trading-stack/.env \
  -f /home/novius2/trading-stack/docker-compose.yml \
  -f /home/novius2/trading-stack/compose/compose.paper-trading.yml \
  -f /home/novius2/trading-stack/compose/compose.oiis-live.yml \
  up -d --no-build oiis-live

docker exec trading-stack-novius2-oiis-live-1 \
  oiis-live select --signal-date 2026-08-07 --trade-date 2026-08-10
docker exec trading-stack-novius2-oiis-live-1 oiis-live monitor-once --trade-date 2026-08-10 --no-submit
docker exec trading-stack-novius2-oiis-live-1 oiis-live reconcile
```

Always pass `-p trading-stack-novius2`. Omitting the project name creates a different Compose identity. One attempted deployment demonstrated this and failed safely on the occupied PostgreSQL port; only its newly created stopped containers were removed. The corrected deployment reused the existing named volume and the database reconciled normally.

## N50 dashboard base-path incident and durable fix (2026-08-09)

- Symptom: `/n50/strategy/oiis-live` returned HTML, but the browser could not
  start the application because the HTML referenced `/assets/index-*.js`.
- Root cause: `trading-stack-n50-dashboard:latest` had been rebuilt with a
  direct `docker build`.  That bypassed the Compose arguments
  `VITE_BASE_PATH=/n50/`, `VITE_API_BASE_URL=/n50` and `VITE_WS_URL=/n50`.
- Runtime recovery command:

```bash
docker compose -p trading-stack-novius2 \
  --env-file /home/novius2/trading-stack/.env \
  -f /home/novius2/trading-stack/docker-compose.yml build n50-dashboard
docker compose -p trading-stack-novius2 \
  --env-file /home/novius2/trading-stack/.env \
  -f /home/novius2/trading-stack/docker-compose.yml \
  up -d --no-deps --no-build n50-dashboard
```

- Durable command: run `./scripts/deploy_n50_dashboard.sh` from the accepted
  repository.  It performs the correct Compose build/deploy, waits for health,
  requires the main asset to use `/n50/assets/`, and fetches that asset through
  the nginx route before returning success.
- Post-recovery verification: container health was `healthy`; `/health`
  reported ready; `/n50/strategy/oiis-live`, the main `index-*.js` bundle, the
  lazy `OiisLivePage-*.js` chunk and its CSS all returned HTTP 200.
- The currently verified public route is
  `https://n50.nifty50today.co.in/n50/strategy/oiis-live`; its HTML and all
  three application assets above returned HTTP 200 through Cloudflare.
- Never use a direct production `docker build` for `n50-dashboard`.  An internal
  health check alone cannot detect this client-side base-path failure.

## OIIS dashboard anonymous-read 401 repair (2026-08-09)

- After the asset-path repair, an unauthenticated browser could render the
  application shell but `GET /n50/v1/oiis-live/dashboard` returned
  `401 AUTH_REQUIRED`.  The OIIS dashboard route had been registered after the
  global `/v1` authentication middleware.
- `registerOiisLivePublic` now registers only the read-only dashboard endpoint
  before the global guard and explicitly emits `Cache-Control: no-store`.
- POST/PATCH/DELETE watchlist operations and POST operational commands remain
  registered after the guard.  Anonymous mutation probes still return 401 and
  create no database row.
- Rebuilt and redeployed with `./scripts/deploy_n50_dashboard.sh`.  The
  following probes all passed through both local nginx and the public
  Cloudflare hostname:

```bash
curl -fsS http://127.0.0.1:19090/n50/v1/oiis-live/dashboard
curl -fsS https://n50.nifty50today.co.in/n50/v1/oiis-live/dashboard
curl -fsS https://n50.nifty50today.co.in/n50/strategy/oiis-live
```

- Verified response: HTTP 200 with policy
  `OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0`.  The dashboard container is
  `healthy` with zero restarts.
- API TypeScript type-check and production build passed.  The full API suite
  passed all 57 tests after replacing a stale hard-coded April 2026 “upcoming”
  event fixture with deterministic dates relative to test execution.

## Stock Selection decision workspace redesign (2026-08-09)

- The public route is
  `https://n50.nifty50today.co.in/n50/strategy/oiis-live`; the sidebar route is
  **Backtesting > Stock Selection**.
- The old page appeared empty because the endpoint returned only selected
  watchlist rows.  It now also returns the full selection funnel, the top 15
  near misses, rejection-reason counts and the latest completed historical run.
- Current verified decision evidence for trade date 2026-08-10: 500 evaluated,
  500 data-quality passes, 40 OFactor passes, 21 XFactor passes, zero hard-gate
  clears and zero selected.  This is a governed `NO TRADE DECISION`, not missing
  data.
- The page and its surrounding header/sidebar use a coherent light theme on
  this route.  It includes the funnel, near-miss table, rejection pressure,
  actionable watchlist, operator tools, three-year context and system health.
  Anonymous users see read-only data and a sign-in callout; mutations remain
  protected.
- A mobile overflow defect caused by the 900px evidence table was fixed by
  containing horizontal scrolling inside the table panel.  The final iPhone 12
  capture is 1170 physical pixels wide rather than the erroneous 2868 pixels.
- Matomo is disabled unless its base URL and site ID are explicitly configured.
  Runtime production/stage Matomo variables were cleared because no configured
  Matomo container is running.  Clarity and Cloudflare telemetry endpoints were
  added to CSP.  No secret or `.env` content was committed.
- Verification run:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run build --workspace apps/api
npm run build --workspace apps/web
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
./scripts/deploy_n50_dashboard.sh
cd tools/playwright
PLAYWRIGHT_BASE_URL='https://n50.nifty50today.co.in/n50' \
PLAYWRIGHT_OUTPUT_DIR='output/playwright/oiis-live-verified' \
PLAYWRIGHT_ROUTES_JSON='[{"slug":"oiis-live","path":"/strategy/oiis-live"}]' \
node smoke.mjs
```

- Final browser audit passed desktop, laptop, tablet and iPhone 12 with zero
  console warnings/errors.  Screenshots and metadata are under
  `tools/playwright/output/playwright/oiis-live-verified/` and are local review
  evidence, not source-control artefacts.  The deployed container is healthy.
- `npm test --workspace apps/api` passed 57/57.  One preceding invocation added
  the unsupported Node-test argument `--runInBand`; npm treated it as a file and
  exited before running tests.  No code or state changed, and the correct
  command above passed immediately afterwards.

## Interactive strategy-testing lab and preservation proof (2026-08-09)

### Outcome

- New light-theme route: `/n50/backtesting/lab` (stage:
  `/n50-stage/backtesting/lab`). It is directly below Backtesting Overview in
  the sidebar and allows an authenticated user to select a governed strategy,
  edit bounded levels, choose a stock/universe/date/capital scenario, submit a
  durable run, cancel it, inspect results and download one consolidated CSV.
- Read-only run evidence is guest-accessible. Create/cancel remains protected by
  the existing session and CSRF controls. Anonymous POST returns JSON 401 and
  the frontend does not force the login popup.
- The worker is research/paper-only. It accepts only three allow-listed existing
  strategy versions and has no SmartAPI or broker-order path.
- Execution results remain separate from diagnostic opportunity paths. It
  evaluates every I030/I050/I070, D+5 S100/S200/S500, adverse and H30 level;
  no ladder stops after the first target.

### Database safety

- Recovery tag: `pre-modernisation-20260809-143440`.
- External Git bundle:
  `/home/novius2/backups/trading-stack-modernisation/pre-modernisation-20260809-143440.bundle`.
- Verified external database backup:
  `/home/novius2/backups/postgresql/trading-stack/20260809T144133Z`.
- `tradingdb.dump` size: 13,039,461,367 bytes.
- Network-isolated PostgreSQL 16 restore PASS: 519/519 restore-catalogue
  relations, no ports, correct owner. Deeper comparison reconciled 424/424
  relations, 352/352 partitions, 43/43 sequences and all monitored objects.
- Additive migration: `services/nse_analytics_worker/sql/060_strategy_lab.sql`.
  It was applied twice on disposable PostgreSQL 16 before production.
- Pre/post live comparison PASS: 424→431 relations (exactly seven lab tables),
  352 partitions unchanged, no missing relations and no decreased critical
  exact counts. See `docs/modernisation/data-preservation-comparison.json`.

### Real smoke runs retained for audit

- `473807d7-7735-4f8a-be74-afc1246e461b`: RELIANCE unconstrained diagnostic,
  one signal/trade and 15 independent ladder rows. This is not a portfolio
  return.
- `65600ee3-d5e6-4d21-8fba-135931f506a4`: RELIANCE finite ₹16 lakh scenario,
  ending ₹16,05,543.4795, +0.3465%, max drawdown -0.5708%, 159 equity rows.
- Consolidated CSV is under
  `services/nse_analytics_worker/runtime/exports/strategy-lab/<run-id>/trades.csv`
  and is served by the API after path-containment and file checks.
- Actual feature source batch 258 covers 2025-11-10 through 2026-08-06 and 100
  stocks. The UI reports this actual coverage; it does not claim three years
  are available from this published feature batch.

### Verification commands

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026

bash -n scripts/db/*.sh
docker run --rm --network none \
  -v "$PWD/compose/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  nginx:alpine nginx -t

docker run --rm --network host \
  -e DATABASE_URL="postgresql://..." \
  -v "$PWD/services/nse_analytics_worker:/app" \
  trading-stack-nse-analytics-worker:modernisation-test \
  /opt/venv/bin/python -m pytest -q \
  tests/test_strategy_lab.py tests/test_backtesting_contracts.py

cd neon-stock-terminal
npm test --workspace apps/api
npm run typecheck --workspace apps/api
npm run typecheck --workspace apps/web
npm run build --workspace apps/api
npm run build --workspace apps/web

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml config --quiet
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml ps nse-analytics-worker nse-strategy-lab-worker \
  n50-dashboard n50-dashboard-stage nginx postgres redis
```

Always pass `-p trading-stack-novius2`. The first stage-only start omitted it,
failed closed because PostgreSQL/Redis were not resolvable on the isolated new
network, and was removed without touching any existing service or volume. The
corrected start reused the deployed project network and passed.

### Safe deploy and rollback

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml build nse-analytics-worker nse-strategy-lab-worker \
  n50-dashboard n50-dashboard-stage
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps nse-analytics-worker
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps nse-strategy-lab-worker \
  n50-dashboard n50-dashboard-stage
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps --force-recreate nginx
```

Normal rollback is application/image rollback only. Retain the additive lab
tables; do not downgrade by dropping them and never remove the PostgreSQL
volume. The runtime source files before this batch are preserved at
`/home/novius2/backups/trading-stack-runtime/20260809T163000Z/`.

### Known limitations

- Browser HTTP/assets/API smokes passed through Nginx, but Chromium was not
  installed for a screenshot-based responsive audit in this turn.
- The full Nifty100/three-year load benchmark was intentionally not run; only
  bounded one-stock validation was authorised for this implementation step.
- Nginx reports absent optional `watchlist`, `matomo` and `rsi-willr-monitor`
  upstreams. N50 production and staging routes are unaffected.
- The public production route and catalogue return HTTP 200. The local stage
  route returns HTTP 200 through Nginx, but the external
  `stage.nifty50today.co.in` hostname returns Cloudflare 502. The stage tunnel
  ingress is remotely managed and was not changed in this safe application
  batch.
- NPM reports 13 dependency advisories. Do not run an unreviewed major-version
  audit fix in this behavioural batch.
