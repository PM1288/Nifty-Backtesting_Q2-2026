# Agent Handoff — Phase 1 Data Foundation

## 2026-08-11 six-workspace UI and ui-2 integration

The deployed dashboard and versioned source now use six visible workspaces:
Today, Markets, Stocks, Strategy Lab, Trading, and Data & Operations. Legacy
routes remain deep-linkable. The ticker is limited to market-relevant
workspaces, administration has a separate shell, and misleading global
freshness/winner/date/heatmap states were corrected.

`ui-2` was integrated into OIIS as separate Opportunity Leaderboard, Execution
Queue, Diagnostics, and All F&O Evidence views. The production universe remains
all active F&O per the latest operational requirement; NIFTY 50 membership and
the intersection count remain visible. No symbol-specific override was added.

Deployment used the verified project name:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard
```

Verification: production API/web build passed; stable six-workspace/OIIS
Playwright regression passed 21/21; the broader responsive workflow regression
passed 26/26; Nginx validation and `/n50/health` passed. Evidence and mapping are
in `docs/ui-ux/SIX_WORKSPACE_INFORMATION_ARCHITECTURE_2026-08-11.md`. One
accidental dashboard container created under the default Compose project was
removed without touching volumes; the intended `trading-stack-novius2`
services and PostgreSQL data were not removed. The build still reports 13 npm
dependency findings (8 moderate, 3 high, 2 critical); handle these as a
separately tested dependency change.

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

## UI/UX V2 redesign handoff — 2026-08-09

### What changed

- Source authority: every document in the untracked user-supplied
  `UI-REDESIGN/` folder was reviewed. The folder was not edited or staged.
- Home (`/`) is protected: it uses the original groups/theme and has no
  `data-ui-generation="trading-v2"` attribute.
- All active non-home screens now use a scoped light workspace with the supplied
  V2 palette, a navy 216/72 px navigation rail, compact mobile drawer and a
  PAPER/page/data/feed/user context strip.
- Active navigation is grouped by product domain and contains only real routes:
  Market, OIIS, Stocks, Backtests, Options, Research/DOE and Operations.
- `/dashboard/*` aliases were added for implemented screens. Paper Trading,
  Futures and Administration were not faked; they remain documented blockers
  until governed API/UI vertical slices exist.
- Shared `StatusPill`, `EnvironmentBadge`, `FeedFreshnessBadge`,
  `ContextIdentityStrip`, `ValidationGateStrip` and `FailurePanel` primitives
  were added without adding a dependency.
- The browser remains a presentation layer. No P&L, strategy, regime, ladder,
  paper-trade or validation semantics changed.

### Commands executed

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/web
npm run typecheck
npm run lint
npm run build

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/tools/playwright
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4190/n50 \
  PLAYWRIGHT_OUTPUT_DIR=output/playwright/ui-v2-regression-local \
  node ui-v2-regression.mjs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:19090/n50-stage \
  PLAYWRIGHT_OUTPUT_DIR=output/playwright/ui-v2-regression-stage \
  node ui-v2-regression.mjs
PLAYWRIGHT_BASE_URL=https://n50.nifty50today.co.in/n50 \
  PLAYWRIGHT_OUTPUT_DIR=output/playwright/ui-v2-regression-production \
  node ui-v2-regression.mjs

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 -f docker-compose.yml build n50-dashboard-stage
docker compose -p trading-stack-novius2 -f docker-compose.yml up -d --no-deps n50-dashboard-stage
docker compose -p trading-stack-novius2 -f docker-compose.yml build n50-dashboard
docker compose -p trading-stack-novius2 -f docker-compose.yml up -d --no-deps n50-dashboard
curl http://127.0.0.1:19090/n50/health
```

### Verification and rollback

- TypeScript/build PASS; 2,448 modules built.
- Browser scope/overflow matrix PASS 20/20 locally, 20/20 on stage and 20/20
  on public production across 430/1024/1440/1920 px.
- Health PASS: HTTP 200, `ready=true`, PostgreSQL connected.
- Public `/n50/backtesting/lab` and
  `/n50/dashboard/strategy-lab/quick` return HTTP 200.
- Lint exposed the existing 36 errors/39 warnings in unrelated legacy files.
  Do not hide them; remediate in a separate compatibility-tested batch.
- Pre-deploy runtime UI backup:
  `/home/novius2/backups/ui-v2/20260809T181329Z`.
- Rollback by restoring those source files, rebuilding only the two dashboard
  images and recreating those services with the same Compose project. Do not
  remove volumes or restart PostgreSQL.

## Universal light UI and operational dashboards — 2026-08-09

- The user expanded V2 scope to every route, including Home. `AppShell` now always applies `trading-v2` and the light workspace theme.
- Removed the global audience/language/digit/feedback/disclaimer clutter. The product header contains navigation, identity, page title, authentication, ticker and feed context only.
- Added `/paper-trading`, `/futures`, `/market/nifty-500` and `/control-plane` pages. Their read-only APIs are in `apps/api/src/routes/workspace.ts` and use existing PostgreSQL schemas.
- The local administrator signs in with username `admin`; its password remains only in `/home/novius2/trading-stack/.env`. Normal users continue through Firebase. The control-plane endpoint enforces the trusted admin session server-side.
- External Cloudflare handling returns 502 for literal `/admin` paths, so the administrator screen deliberately uses `/control-plane`.
- Production dashboard was rebuilt/recreated under Compose project `trading-stack-novius2`. The staging dashboard container was stopped and removed. PostgreSQL and trading workers were not restarted or modified.
- Verification commands:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/api run typecheck
npm --prefix neon-stock-terminal/apps/api test
npm --prefix neon-stock-terminal/apps/web run build

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps --force-recreate n50-dashboard
```

- Never commit `.env` or the administrator password. Never use `--remove-orphans` because paper/OIIS services are currently managed as compatible project services outside the dashboard Compose file.

## Production authentication and light-theme repair — 2026-08-09

### Faults found and corrected

- Reproduced the administrator failure in a real browser. The API rejected the
  production browser origin with `ORIGIN_MISMATCH` because the Compose default
  allowed the older `m.nifty50today.co.in` host but not
  `n50.nifty50today.co.in`. The production and legacy hosts are now both in the
  default origin allowlist.
- Authentication is now a hard application boundary. Until a valid local-admin
  or verified Firebase session exists, `AppShell` renders only the sign-up/log-in
  modal: no main content, sidebar, dashboard request, or dismiss button exists.
- The local admin remains server-validated and the normal user path remains
  Firebase email/password with email verification. The Firebase Web API key is
  configured only in the runtime `.env`; it is intentionally absent from Git
  and from this handoff.
- The page canvas now uses the light colour scheme at `html` and `body` level.
  The three home index cards and their animated overlay are explicitly white or
  transparent, removing the residual grey blocks without changing market data.
- Nifty 500, Paper Trading, and Administration were tested through their real
  `/n50/...` browser routes after login. Their APIs rendered data without
  `AUTH_REQUIRED`, `ORIGIN_MISMATCH`, or generic API errors.

### Validation evidence

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/api run typecheck
npm --prefix neon-stock-terminal/apps/api test

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml build n50-dashboard
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps --force-recreate n50-dashboard
```

- Web and API type checks: PASS.
- API tests: 60/60 PASS.
- Production health: HTTP 200, `ready=true`, PostgreSQL connected.
- Anonymous browser checks on Home, Nifty 500, and Paper Trading: modal present;
  `main=0`, `aside=0`, dismiss button absent.
- Administrator browser login: PASS using the runtime secret and production
  origin.
- Authenticated browser checks: Nifty 500 rendered 30 rows, Paper Trading 3
  rows, Administration 6 rows; zero relevant failed API responses.
- Firebase disposable-user sign-up and email-verification gate: PASS. The test
  Firebase identity, Realtime Database nodes, and matching PostgreSQL signup
  profile were deleted after validation.
- Browser-computed home card backgrounds are `rgb(255,255,255)` and page canvas
  is `rgb(246,248,252)`.

### Runtime notes

- Authoritative URL prefix is `/n50`; direct routes such as
  `/n50/market/nifty-500` support SPA refresh. Paths without `/n50` are not app
  routes.
- Staging remains disabled. No database, paper-trading, OIIS, collector, or
  Nginx service was restarted. Do not use `--remove-orphans`.
- Never record the administrator password or Firebase Web API key in Git,
  screenshots, reports, or command examples.

## Compact light-dashboard consolidation — 2026-08-10

### What changed

- `AppShell` is now the only application header. It combines product identity,
  PAPER mode, current route, data age, feed freshness and authenticated-user
  state; the ticker follows immediately below it.
- Removed the repeated page header/subtitle/audience/sub-tab band from analytics
  pages and removed the separate context strip.
- The desktop navigation rail is 72 px by default and expands to 216 px on
  pointer hover or keyboard focus. The desktop hamburger is hidden; the mobile
  drawer remains available at narrow widths.
- Removed static indicator teaching, threshold glossary, assumptions, next-step
  panels and other generic instructional widgets from the visible dashboards.
  Current status, live/database-derived metrics, evidence charts, strategy
  results and stock tables remain.
- Normalised strategy evaluation, market state, data quality, run monitor,
  leaderboard, backtesting lab, RSI/WILLR/change heatmaps, candlesticks,
  oscilloscopes, ECharts tooltips and home stock tiles to a white/light palette.
  Market direction is represented with accessible red/green text and borders,
  not dark filled cards.

### Verification and deployment

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/web run build
git diff --check

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps --force-recreate n50-dashboard
```

- TypeScript type check: PASS.
- Vite production build: PASS, 2,448 modules transformed.
- Production dashboard: recreated and healthy under
  `trading-stack-novius2`; no database, collector, paper-trading or OIIS
  service was changed.
- Playwright checked Home, Market State, Strategy Evaluation, Data Quality, RSI
  heatmap, Strategy Leaderboard, Run Monitor, Indicator RSI, Backtesting Lab,
  Nifty 500, Paper Trading and Administration.
- On all 12 routes: zero dark rendered surfaces, zero duplicate page headers,
  zero duplicate context strips, zero horizontal overflow, zero visible static
  indicator sections, zero API-error text and zero failed `/n50/` responses.
- Guest application content remains blocked (`main=0`). Desktop sidebar measured
  72 px at rest and 216 px on hover; no desktop menu button was visible.
- Do not commit the runtime `.env`, administrator secret, or the untracked
  `UI-REDESIGN/` and extracted `OIIS-DOE/` source-reference directories.

## F&O five-year daily technical dataset — 2026-08-10

- Added the repeatable exporter
  `platform/nifty_stratlab/tools/export_fno_daily_technical_dataset.py` and its
  indicator/breadth regression tests.
- Final external dataset:
  `/home/novius2/data/fno_daily_technical_5y_20210810_20260810`.
- Exported 270,353 rows and 81 columns for 219 current stock F&O underlyings,
  NIFTY 50, India VIX and ten available sector indices from 2021-08-10 through
  the latest available trading date, 2026-08-07.
- The folder contains 219 equity CSVs, 12 market CSVs, one consolidated CSV,
  advances/declines, one consolidated Excel workbook, coverage/universe files,
  logs, manifest and checksums. Total size is approximately 703 MB.
- All current F&O symbols exported. Twenty renamed-symbol histories were filled
  using their current Yahoo ticker and explicitly tagged. TMPV remains
  post-demerger only. LTIM retains local history and has one non-blocking Yahoo
  availability warning.
- Validation passed: zero blocking failures, duplicates or unclassified
  sectors; breadth totals reconcile; Excel contains all 270,353 rows; the XLSX
  archive and every SHA-256 checksum validate.
- Full implementation, data policy, indicator catalogue, limitations and rerun
  commands are in `docs/worklogs/fno-daily-technical-five-year-export.md`.

## OIIS live rejection explanations — 2026-08-10

- Added a dynamic `Gate definitions` table to
  `neon-stock-terminal/apps/web/src/pages/OiisLivePage.tsx`.
- The table maps each live rejection reason to its meaning, exact threshold or
  formula, indicator fields and evidence tables. Counts are read from the
  selected date's `oiis_live.daily_candidate.reason_codes` aggregation.
- Documented that rejection counts overlap, and that RSI14/WILLR14 are
  intraday trigger context while daily OIIS setup/liquidity gates run first.
- Verification: `npm run build` in `neon-stock-terminal/apps/web` passed.

## OIIS Live V2 tiered screening and full evidence — 2026-08-10

### Delivered behaviour

- Universe is now only the refreshed union of unexpired SmartAPI stock F&O
  underlyings and official NSE NIFTY 50 members. NIFTY 500 membership alone is
  not sufficient. The verified universe is 208 symbols, including 50 NIFTY 50
  members.
- OFactor tiers are LOW 54, MEDIUM 64 and HIGH 74. A LOW result passes the
  OFactor gate and retains its tier throughout PostgreSQL, API and UI.
- Absolute directional-edge tiers are LOW 6, MEDIUM 7 and HIGH 8.
- Comparable 90-session volume-percentile tiers are LOW 20%, MEDIUM 30% and
  HIGH 50%. During live sessions, partial volume is compared with volume
  accumulated by the same IST time on prior sessions.
- Extension/ATR profiles are LOW 1.2, MEDIUM 1.4 and HIGH 1.5; values above
  1.5 block. Stop width remains recorded but is non-blocking. Trigger
  confirmation has been removed completely.
- Every symbol has a detail row. Missing inputs produce an explicit
  `DATA_INSUFFICIENT` row with null metrics rather than disappearing.
- The ten best evaluable rows are always recommendations, ordered by blocking
  gate count, total failed gates, OFactor, directional edge and data quality.
  Recommendations do not receive paper-entry permission unless all blocking
  gates pass.
- The dashboard includes Summary and All stock details views. The detail view
  expands each stock into raw OHLC, current/D-1/D-2/20-day/90-day volume,
  volume percentile, SMA20/SMA50/EMA61, ATR14, RSI14, Williams %R, MACD,
  reward/risk, extension, risk/ATR, complete long/short OFactor components and
  per-gate formula/actual/source evidence.
- Selection slots are 08:30, 09:30 and 15:00 Asia/Kolkata on governed trading
  sessions, with deterministic run-slot identity and restart catch-up.

### Database and API

- Additive migration: `db/sql/033_oiis_live_tiered_evidence.sql`.
- New table/view: `oiis_live.universe_member` and
  `oiis_live.v_latest_daily_candidate`.
- Extended candidate evidence fields include `ofactor_level`,
  `directional_edge_level`, `extension_level`, `volume_level`,
  `volume_percentile_90`, failure counts, recommendation fields,
  `feature_values`, `gate_evidence` and `universe_flags`.
- Read endpoints:
  - `GET /n50/v1/oiis-live/dashboard`
  - `GET /n50/v1/oiis-live/candidates?tradeDate=YYYY-MM-DD`

### Verified final run

```text
run_id: a6744eb7-af21-4ca0-8ffe-b892801722cf
run_slot: MANUAL_V2_FINAL
signal_date: 2026-08-07
trade_date: 2026-08-10
evaluated: 208
evaluable data: 190
explicit DATA_INSUFFICIENT: 18
OFactor LOW/MEDIUM/HIGH: 73 / 34 / 7
OFactor below/not estimable: 76 / 18
recommendations: 10
qualified for intraday revalidation: 2
fully selected/entry-enabled: 0
TRIGGER_CONFIRMATION_MISSING rows: 0
volume percentile range: 0.0000 to 0.7941, 21 distinct rounded values
result_hash: 677ac36993ce7dad485a6fd1c0474a5c4a0088b7b5a86b84bebb652c129027bc
```

Top recommendations were ASIANPAINT, IRFC, RECLTD, MPHASIS, NAUKRI,
DRREDDY, BAJFINANCE, MUTHOOTFIN, KALYANKJIL and IDFCFIRSTB. They are research
recommendations only; none cleared every blocking gate on this snapshot.

### Commands and evidence

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
python3 -m compileall -q services/oiis_live/src platform/nifty_stratlab/src
npm --prefix neon-stock-terminal/apps/api run build
npm --prefix neon-stock-terminal/apps/web run build
docker build -t trading-stack-oiis-live:1.0.0 \
  -f services/oiis_live/Dockerfile .
docker run --rm -u 0 --entrypoint sh \
  -v "$PWD/services/oiis_live/tests:/tests:ro" \
  trading-stack-oiis-live:1.0.0 \
  -c 'pip install -q pytest==8.4.1 && pytest /tests -q'

cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.paper-trading.yml \
  -f compose/compose.oiis-live.yml up -d --no-deps --force-recreate oiis-live
docker compose -p trading-stack-novius2 up -d --no-deps \
  --force-recreate n50-dashboard
```

Results: Python service tests 8 passed; API TypeScript build passed; web
TypeScript/Vite production build passed with 2,448 modules. Migration 033 was
applied successfully. OIIS and dashboard containers were healthy. The routed
dashboard API returned 208 candidates and ten recommendations. One accidental
duplicate dashboard container under the wrong Compose project was immediately
removed; the production `trading-stack-novius2` container and all database
volumes remained intact.

Full formulas and evidence-map documentation:
`docs/worklogs/oiis-live-rejection-gate-definitions-2026-08-10.md`.

## Complete 10 August per-stock OIIS calculation report — 2026-08-10

- Generated the exhaustive Markdown evidence report at
  `docs/reports/OIIS_LIVE_COMPLETE_CALCULATION_REPORT_2026-08-10.md`.
- The report is 40,559 lines / approximately 2.18 MB and contains exactly 208
  numbered per-stock sections.
- Each calculable stock contains the exact scoring-engine input vector,
  additional live/volume inputs, data-quality inputs, all nine LONG OFactor
  component scores/weights/contributions, all nine SHORT equivalents, applied
  penalties, raw/final scores, all nine XFactor scores/weights/contributions,
  setup/stop/risk/reward/extension values, every gate's actual JSON values,
  rule, fields, source table, blocking flag, condition matrix and final
  selection explanation.
- The 18 unavailable-data symbols remain present and are explicitly marked
  `NOT ESTIMABLE`; the report does not invent their O/X or indicator values.
- Global sections document the formulas, thresholds, data sources, time
  semantics, six-run ledger for 10 August, aggregate tier/direction/failure
  counts, ten-row ranked watchlist and compact all-stock comparison table.
- Reusable exporter:
  `services/oiis_live/tools/export_daily_evidence_report.py`.
- Verification: 208 stock headings, 190 calculable candidates, 18 data-
  insufficient candidates, and maximum LONG O, SHORT O and X score-
  reconciliation residuals all equal zero.
- Report SHA-256:
  `6c490300007b1703c0e3b1c90ae5b7512631c30bc632879370a3dece57d58ffa`.

Recreate it without exposing the database credential:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
docker run --rm -u 0 \
  --network trading-stack-novius2_default \
  --env-file /home/novius2/trading-stack/.env \
  -v "$PWD:/workspace" \
  --entrypoint python trading-stack-oiis-live:1.0.0 \
  /workspace/services/oiis_live/tools/export_daily_evidence_report.py \
  --trade-date 2026-08-10 --run-slot MANUAL_V2_FINAL \
  --output /workspace/docs/reports/OIIS_LIVE_COMPLETE_CALCULATION_REPORT_2026-08-10.md
```

## UXs3 research-workstation integration — 2026-08-10

Reviewed both files in `/home/novius2/NIFTY50/UXs3/` completely and implemented the supported product requirements in the accepted React/Vite, API, PostgreSQL, and Nginx stack. The detailed plan is `docs/ui-ux/UXS3_IMPLEMENTATION_PLAN_2026-08-10.md`; the evidence report is `docs/ui-ux/UXS3_IMPLEMENTATION_REPORT_2026-08-10.md`.

The homepage was a protected boundary. Neither `LandingPage.tsx` nor `LandingPage.module.css` changed. The navigation command palette is unavailable on `/`, including its keyboard shortcut.

Implemented:

- five-stage Explore/Research/Backtest/Compare/Paper journey in the strategy lab;
- input-versus-result currency (`CURRENT`, `STALE`, `NO RESULT`) and input restoration;
- Overview, Ladders, Trades, and Inputs & audit result views;
- immutable run provenance, parameters, hashes, validation, and event history;
- accessible non-home `Ctrl/Cmd+K` route/stock navigation with no order authority;
- PostgreSQL-backed paper execution, position, P&L, target-track, webhook, mark-freshness, and incident summaries;
- dynamic state/source strips for Paper, NIFTY 500, Futures, and Admin workspaces;
- Nginx CSP correction for the existing Google/Clarity browser telemetry endpoints.

No migration, data mutation, strategy change, exit change, or live-order action was performed.

Verification:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/web run build
npm --prefix neon-stock-terminal/apps/api run build
npm --prefix neon-stock-terminal/apps/api test
git diff --check
PLAYWRIGHT_BASE_URL=http://127.0.0.1:19090/n50 \
  '<set-in-shell>' \
  PLAYWRIGHT_OUTPUT_DIR=output/playwright/uxs3-final \
  node tools/playwright/uxs3-regression.mjs
```

Results: web typecheck/build PASS; API build PASS; API tests 60/60 PASS; prior route/viewport regression 44/44 PASS; UXs3 mobile/desktop regression 26/26 PASS; final browser console clean; no horizontal overflow on checked home, lab, or paper pages. Visual evidence is reproducible under `output/playwright/uxs3-final/`.

Deployment used the existing project only:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
docker compose -p trading-stack-novius2 build n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps n50-dashboard
docker compose -p trading-stack-novius2 up -d --no-deps --force-recreate nginx
curl -fsSI http://127.0.0.1:19090/n50/
```

The dashboard is healthy and the routed page returns HTTP 200. Never use `--remove-orphans`; the paper-trading and OIIS containers are valid services assembled through separate Compose files. Never use `down -v`.

Known pre-existing failures: the full web lint reports 49 errors/40 warnings in legacy files; API lint cannot start because its existing ESLint config is loaded with the wrong module mode; the image build reports 13 existing npm audit findings (8 moderate, 3 high, 2 critical). These were not hidden or represented as passing, and dependency upgrades require a separately tested compatibility change. Roll back by reverting the UXs3 commit and rebuilding/recreating only `n50-dashboard` and Nginx; no database rollback is involved.

## OIIS Live directional-integrity correction — 2026-08-10

Implemented and deployed policy version 3.3 after verifying the user's diagnosis against the deployed V2 package and PostgreSQL evidence. V2 and short-lived V3 validation runs remain immutable; policy 3.3 is authoritative.

Corrected:

- eligible universe is active NIFTY 50 membership intersected with active F&O eligibility;
- YFinance fallback is scoped by that same universe at pre-open;
- scheduled backfills use exact 08:30, 09:30 and 15:00 IST `decision_as_of` cutoffs, separately from physical execution time;
- minute bars use completed-bar point-in-time cutoffs and semantic completeness checks;
- zero/missing cumulative volume cannot receive FULL permission; coverage below 95%, freshness beyond two minutes, or non-positive volume fails closed;
- MoveATR uses session open and previous completed daily ATR, while VWAP-distance ATR is persisted separately;
- daily structural bias and current-session direction are stored separately and resolved explicitly;
- one immutable setup object feeds both XFactor and hard gates;
- SMA20 is no longer a fallback stop and reward/risk is never manufactured as 2.0;
- O=54/64 remain research cohorts, while canonical permission remains O>=74 and X>=76;
- opportunity ranking is independent of execution-readiness ranking and no longer sorts primarily by failure count;
- first 15 opportunities remain on the review surface, while entry permission stays fully governed;
- API/UI expose structural, session and resolved direction, setup identity, coverage, corrected formula and both ranks.

Additive migration:

`db/sql/034_oiis_live_directional_integrity.sql`

It adds run identity/timing, direction, setup, coverage and rank columns; indexes; and recreates the PostgreSQL latest-candidate/current-watchlist views so additive columns are visible. Pre/post live row counts for existing evidence were `selection_run=6`, `daily_candidate=1486`, `watchlist_item=23`; immediately after migration they were unchanged. Later counts increased only through explicit V3 validation runs and recommendation upserts.

Safety backup before live migration:

`/home/novius2/backups/oiis-live-directional-fix-20260810/`

Both the custom-format schema dump and schema SQL pass their stored SHA-256 verification. The backup is outside Git with mode 0600.

Authoritative V3.3 scheduled run evidence:

| Slot | Cutoff IST | Evaluated | Selected | Result hash |
|---|---:|---:|---:|---|
| PREOPEN_0830 | 08:30 | 50 | 0 | `c58628a28e33c4a462b3b13aecd2ce81502f87458e2bb3a5a3adcf940a27c807` |
| OPEN_0930 | 09:30 | 50 | 0 | `6ad0f98a6378921ca9b8540f70393d96987ee911fd604f42d18d9ffd0cbf130a` |
| AFTERNOON_1500 | 15:00 | 50 | 0 | `e70f2758c06c429eebd1dc4f2486a385280c979a7c2036fb62a983b24ff61a19` |

The manual 15:00 parity run produced the identical afternoon hash. The final API exposes 50 intersection stocks and 15 opportunity-review rows. Corrected named-symbol outcomes at the available 15:00 cutoff are TITAN LONG, SHRIRAMFIN LONG, GRASIM LONG and SBIN SHORT with `COUNTER_TREND_SHORT`. All four correctly have `DATA_INSUFFICIENT` because the captured minute source is only about 46% complete; none was authorised for entry.

Detailed implementation record:

`docs/worklogs/OIIS_LIVE_DIRECTIONAL_INTEGRITY_FIX_2026-08-10.md`

Corrected 50-stock evidence report:

`docs/reports/OIIS_LIVE_CORRECTED_CALCULATION_REPORT_2026-08-10.md`

Report SHA-256: `2ff8df40f77d38417f65329da6f0db890f38dd40051d86339b66fd84da271988`.

Verification executed:

- migration 032+033+034 on disposable PostgreSQL: PASS;
- Python compile/AST and `git diff --check`: PASS;
- OIIS regression/service tests: 24/24 PASS;
- dashboard API tests: 60/60 PASS;
- API and web TypeScript checks: PASS;
- API and Vite production builds: PASS;
- frontend production bundle: 2,450 modules built;
- direct dashboard/candidates API smoke: PASS;
- scheduled/manual result-hash parity: PASS;
- `oiis-live` and `n50-dashboard` containers: healthy;
- existing V1/V2 candidate counts remain 500/986.

The build continues to report the pre-existing npm dependency audit findings (8 moderate, 3 high, 2 critical). No live order was placed. No exit policy was changed. No Docker volume or historical evidence was removed.

### Generic opportunity UI follow-up

The summary originally rendered the execution-readiness near-miss table above the actual opportunity list. This could visually hide high-OFactor candidates when their live execution evidence was incomplete. The prominent summary table now renders `dashboard.recommendations` from the latest completed database run, ordered by `opportunity_rank`, and shows resolved/structural/session directions plus the separate execution rank and data status. The hero reports the dynamic opportunity count separately from authorised entries. No symbol is hard-coded.

Headless browser verification through the authenticated Nginx route confirmed 15 dynamic rows, including `#7 TITAN`, `#9 GRASIM` and `#11 SHRIRAMFIN`, with no browser-console errors. The UI remains generic: future runs replace the symbols, counts, directions and ranks from PostgreSQL automatically.

## F&O two-gate volatility signal service — 2026-08-10

Implemented and deployed the paper-only `FNO_VOLATILITY_TWO_GATE` version 1.0.0 service. It reuses the protected SmartAPI collector and PostgreSQL rather than opening another broker session.

- Stage A snapshots all active stock-option underlyings at 08:30 IST and scores completed-day movement features with no same-day EOD leakage.
- Stage B runs at 09:30, 09:45 and 10:00 IST before an 11:00 cut-off, calculates opening evidence, generates only actual listed CE/PE structures, derives IV from two-sided quotes, and performs deterministic scenario repricing.
- Every option-value gate uses CE/PE asks for entry, bids for valuation, exchange-source quote timestamps for freshness and fail-closed semantics.
- Additive schema `fno_volatility` contains immutable strategy configuration, run identity, complete universe snapshots, movement predictions, option candidates, signals and service heartbeats.
- UI route: `/n50/options/volatility-signals`; API route: `/v1/fno-volatility/dashboard` behind the existing authentication guard.

10 August evidence: 186 stock-option underlyings, 185 with sufficient daily history, 2,200 active contracts (1,100 CE and 1,100 PE), 15 pre-market candidates and five post-close diagnostic candidates. The result was correctly `NO_TRADE`: zero actionable signals because the exchange session was closed and source quotes were stale. No paper or live order was submitted.

Tests: seven Python financial/model tests pass; Ruff passes; web and API TypeScript checks pass; Vite production build passes; all 60 existing API tests pass; disposable PostgreSQL migration and repeat migration pass; authenticated API returns 200; Playwright route regression passes with 191 rendered rows and no console errors. `fno-volatility` and `n50-dashboard` are healthy under Compose project `trading-stack-novius2`.

Operations and limitations: `docs/fno-volatility/README.md`. Current run report: `docs/fno-volatility/2026-08-10-signal-report.md`. Automatic paper submission remains intentionally disabled pending actual-option walk-forward validation; current movement and IV-change layers are explicitly labelled transparent proxy models, not promoted ML models.
# SmartAPI rate-safe archival integration (2026-08-10)

- Added additive migration `025_smartapi_archive`: permanent daily instrument-master snapshots, partitioned sampled WebSocket ticks, derived best-five depth metrics, internally built SmartAPI option-chain snapshots, WebSocket health, CAS fields and API retry metadata.
- Preserved the existing raw `public.option_chain_snapshots` table by naming the new normalized archive `public.smartapi_option_chain_snapshots` after a production preflight exposed the collision. The first incompatible DDL attempt rolled back; the corrected migration applied successfully.
- Collector remains the sole SmartAPI session/call gateway. No order submission code was added; deployed `disable_live_orders` remains true.
- Added independent bounded Black-76 implied-volatility and Greek calculations. Broker and local Greeks are stored separately.
- Updated the live market close to 15:40 IST for NFO/BFO and added explicit CAS/session-phase storage.
- Production collector now uses host port 18080 because GLPI owns 127.0.0.1:18081. Runtime `.env` and `.env.collector.runtime` were updated consistently.
- Verification: `go test ./... -count=1` passed; Docker image built; disposable PostgreSQL migration reached 025 with nine partitions; production migration reached 025; collector healthy as non-root `appuser`; API audit observed 152 quote and 5 aggregate calls over ten minutes with zero throttles.
- Data preservation check before/after: `bars_1m=24,119,679`, `instruments=450,511`, `option_greeks=18,604`; pre-existing raw option-chain table retained 4,897 rows. Daily instrument snapshot captured 152,044 master rows.
- Operational contract: `docs/SMARTAPI_RATE_SAFE_DATA_ARCHIVE.md`.

## OIIS all-F&O universe evidence — 2026-08-11

OIIS policy version 3.4 now uses `ALL_FNO` rather than the prior NIFTY50/F&O intersection. The immutable manual point-in-time run `2db45c08-bc36-45c6-ba56-16fc4b7792c7` evaluated all 208 active stock F&O underlyings: 162 had FULL evidence, 46 were explicitly data-insufficient, 15 were recommended for research review, four qualified for intraday revalidation, and zero received final automatic-entry permission. Individual futures and option contracts remain separately collected and are not counted as additional stocks.

Complete 45,272-line per-stock evidence report:

`docs/reports/OIIS_LIVE_COMPLETE_ANALYSIS_ALL_FNO_2026-08-11.md`

The report includes the run ledger, formulas, thresholds, source tables, aggregate failure counts, active watchlist, all-stock decision table, and every persisted feature, LONG/SHORT OFactor contribution, XFactor contribution, data-quality input, setup, gate and final reason for all 208 stocks. Export validation confirmed exactly 208 per-stock sections, the expected run ID and `ALL_FNO` scope, with no detected DSN, bearer-token or Firebase-key pattern. No live broker order was placed.

## OIIS 30-minute trading-session schedule — 2026-08-11

Policy 3.5 schedules immutable all-F&O snapshots every 30 minutes from 09:30 through 15:00 IST on governed NSE trading sessions: `OPEN_0930`, `INTRADAY_1000`, `INTRADAY_1030`, `INTRADAY_1100`, `INTRADAY_1130`, `INTRADAY_1200`, `INTRADAY_1230`, `INTRADAY_1300`, `INTRADAY_1330`, `INTRADAY_1400`, `INTRADAY_1430`, and `AFTERNOON_1500`. Restarts catch up due slots idempotently; weekends and calendar holidays remain excluded by `paper_trading.trading_sessions`.

The dashboard and candidate APIs now resolve one explicit latest completed `ALL_FNO` run, prefer the newest policy version, and query all aggregates/details using that same run ID. The UI displays the actual policy version, run slot, IST cutoff, evaluated F&O count, and 30-minute engine cadence; the details heading and universe label no longer claim a NIFTY50 intersection.

Verification: 23 OIIS tests passed; API TypeScript and web TypeScript/Vite production builds passed in Docker; OIIS and N50 dashboard containers are healthy; through-Nginx dashboard and candidate endpoints returned HTTP 200, policy 3.5, `ALL_FNO`, identical run IDs, 208 evaluated/candidate rows, 15 recommendations, and 12 schedule slots. The first persisted production run was `ca3fe494-88d3-451f-a641-52c72fd0c9c3` (`OPEN_0930`, 208 evaluated). PostgreSQL and all volumes were left untouched; no live broker order was placed.

## OIIS evidence UI and sidebar behaviour — 2026-08-11

- Restored the dynamic sector heatmap on Home and renamed the primary research workspace to `OIIS Lab`.
- The desktop sidebar expands on deliberate hover and collapses immediately after a route selection; the mobile overlay behaviour is unchanged.
- OIIS opportunity and all-F&O evidence rows sequence by descending `OFactor + XFactor + Data Quality`. LONG is green, SHORT is red, and strict O/X row bands are green above 70, yellow above 50, orange above 40 and gray otherwise.
- Every symbol links to Stock 360. The page now exposes the latest OIIS rules and actual values, liquidity/VWAP/volume/ATR/range/pivots, a one-year candlestick/Bollinger/pivot/volume/RSI chart, and stored SmartAPI option bid/ask, depth, OI, IV and Greeks. Missing data remains explicit.
- Added authenticated `GET /v1/oiis-live/candidates/:symbol/context`; it reads the latest immutable candidate and `public.smartapi_option_chain_snapshots` without inventing broker data.
- PostgreSQL connection exhaustion was corrected without changing data location: verified volume `trading-stack-novius2_pgdata` remains mounted, `max_connections` is 80, PostgreSQL memory is 2 GiB and the dashboard Prisma pools are four connections each. After recreation of only PostgreSQL, dashboard/dispatcher and option-chain watcher, PostgreSQL reported 35 active connections and the affected services recovered.
- API/web production builds passed. The focused authenticated browser regression passed 30/30 with no console errors; evidence is `output/playwright/oiis-ranking-stock-detail-2026-08-11-stable/results.json` with screenshots beside it. The broader desktop/mobile regression passed 26/26 at `output/playwright/oiis-sidebar-broad-2026-08-11/results.json`. No live order was placed and no Docker volume was removed.

## Home live-index tick direction — 2026-08-11

The rotating NIFTY 50, BANK NIFTY and INDIA VIX prices now compare each newly received quote with that index's immediately previous quote. Rising digits are green, falling digits are red and a same-price update is dark text. Tracking uses each quote's own timestamp, so an update for one index does not reset another index's state. The production API/web image built successfully (2,452 Vite modules) and `n50-dashboard` was recreated without dependencies or volumes. A mocked authenticated WebSocket regression passed 12/12 assertions across all three indices and all three direction/colour states.

## Sidebar click-collapse repair — 2026-08-11

The desktop sidebar now blurs a selected link, closes immediately for internal and external destinations, suppresses hover expansion during the width transition and rearms hover only after a genuine pointer exit. This removes both stuck-open `focus-within` behaviour and stuck-collapsed icon-click behaviour. The production build passed with 2,452 Vite modules. An authenticated browser regression passed 8/8 for center clicks, icon clicks, pointer movement inside the collapsed rail, pointer exit and subsequent hover re-entry. The dashboard was recreated without dependencies or volumes and remained healthy.

## OIIS run history and automatic paper entry — 2026-08-11

- Added additive migration `035_oiis_live_run_history_auto_paper.sql`; no table was deleted or renamed. Before applying it, a schema-only OIIS backup and exact table counts were stored outside Git at `/home/novius2/backups/oiis-live-20260811-1438/` with mode 0600.
- Policy 3.6 retains the 09:30–15:00 half-hour schedule. Completed time slots are recognised across policy versions so deployment does not recalculate eleven already-completed slots and delay the current run.
- Every new run links to its preceding run. `oiis_live.candidate_run_change` durably stores current/previous OFactor, XFactor, data quality, their deltas, total score/delta, direction, rank movement, threshold crossing and paper selection.
- Automatic eligibility requires all three values and strict `OFactor + XFactor + Data Quality > 185`. Only the highest scoring eligible candidate is considered per run. Current bar, direction and 10-minute freshness guards apply; stale catch-up runs are persisted but cannot trade.
- `entry_claim` remains unique by policy/date/symbol. Failed transport claims can now retry the same idempotency key. Paper API correlation IDs were corrected to deterministic UUIDs.
- New public read endpoint: `GET /v1/oiis-live/run-history`. New UI: `/strategy/oiis-live/history`, linked as **Run History** within OIIS Lab. It shows data cutoff IST, actual execution IST, completion, top candidate, paper action and symbol-level deltas.
- Production verification: migration backfilled 5,748 candidate quality scores without row loss; a stale 09:30 v3.6 catch-up recorded 208 changes, 85 above-threshold candidates and zero submissions. The existing RSI/Williams PFC paper claim retried successfully after the correlation fix, opened paper group `c8308fa3-dbad-4602-bb9c-308ddb2bc56c`, and five related outbox events were delivered. No live broker order was placed.
- API and web TypeScript checks passed, production Vite/Docker builds passed, the run-history and dashboard APIs returned HTTP 200 through container Nginx, and the OIIS/Paper/Dashboard services remained healthy. Full behaviour is documented in `docs/oiis-live/RUN_HISTORY_AUTO_PAPER.md`.

The first current scheduled auto-paper proof completed at the 15:00 IST cutoff. It evaluated 208 stocks, found 166 complete sums above 185, selected LTM LONG at 268.0268 and submitted exactly one paper group, `aa904f70-0d9d-42b3-8b7c-3f7f36919c89`. The group filled 41 shares at ₹4,839.60 and became OPEN. Its accepted, pending-entry, leg-opened and group-opened events were all delivered through the webhook outbox. The 15:00 ledger contains 208 current-versus-14:30 comparisons and one selected row.

This fill also exposed and resolved a pre-existing paper-monitor constraint defect: `data_quality_incidents` previously permitted only one historical `RECOVERED` row per instrument. Additive paper migration `003_data_quality_incident_history` replaces that with a partial unique index allowing only one `OPEN` stale incident while retaining unlimited recovery history. A schema/count backup is at `/home/novius2/backups/paper-trading-20260811-1510/`; the normal `paper-migrate` job reapplied all idempotent SQL successfully, the disposable-schema migration integration test passed 1/1, the monitor resumed, and no business row was deleted. Focused OIIS tests passed 25/25.

## Paper Trading UI workspace — 2026-08-11

Paper Trading is now a separate primary sidebar workspace rather than a child of the general derivatives area. Its first data surface is a typed open-position table joined from paper groups, legs, instrument snapshots and positions. Authenticated operators can add a single-leg NSE equity or active NFO option PAPER intent through the UI; the server resolves the instrument from `public.instruments`, enforces session and CSRF checks, keeps the service token in a read-only Docker secret, and forwards the canonical intent to `paper-api`. The browser never receives the internal token and no broker path exists. OIIS gate definitions were also moved behind tier/failure evidence at the end of its Overview.

Verification: API/web TypeScript checks passed, API tests passed 60/60, the Docker production build passed, `n50-dashboard` is healthy, the Paper page returned HTTP 200, unauthenticated mutation returned 401, authenticated malformed mutation returned the expected 400 without creating a trade, and the authenticated portfolio query returned two open-position rows. No live or test trade was created during verification.

## Twelve-hour login session — 2026-08-11

Dashboard login sessions now use a 43,200-second idle timeout, 43,200-second absolute timeout and 43,200-second secure cookie lifetime. Redis remains authoritative, CSRF protection and explicit logout are unchanged, and sessions cannot extend past 12 hours. API typecheck and all 60 API tests passed; the rebuilt dashboard is healthy and a real local-admin login emitted `Max-Age=43200`.

## Paper stock lifecycle, valuation and concise webhooks — 2026-08-11

- Paper positions are now marked from every eligible post-entry one-minute bar. `positions.last_mark`, `last_mark_at`, `unrealised_pnl`, valuation snapshots, MFE and MAE update durably in PostgreSQL.
- Monitoring starts at the actual fill timestamp. Migration `004_position_valuation_and_standard_ladders` retained corrupt pre-entry horizon rows as `INVALIDATED_PRE_ENTRY`, reset only affected open observations and replayed eligible bars without deleting the immutable processed-bar ledger.
- Equity analytical ladders are standardised to intraday `0.3% / 0.5% / 1%` and swing `1% / 3% / 5%`. Actual execution exits remain separate. Five- and 30-session outcomes now store closing return, hypothetical after-cost P&L and one-time 35% profit-tax provision.
- `/paper-trading` now leads with open stock cards: buy/short time, entry, mark, quantity, live P&L/return, MFE/MAE, both target ladders and 5-/30-session progress. The manual PAPER-only form remains below the position book.
- Default webhook delivery excludes internal pending/group-opened noise. Accepted and filled events remain distinct; lifecycle, target, horizon, summary, data-quality and critical events expose concise top-level `title` and `message` fields plus the complete structured CloudEvent payload.
- Production proof: LTM was marked at ₹4,850 with ₹426.40 unrealised P&L and one-session observation state. PFC correctly closed via its configured paper execution target while its 5-/30-session observation continues; its pre-entry outcomes were retained but invalidated.
- Verification: 20/20 paper tests passed against disposable PostgreSQL with 85% overall coverage; Ruff and mypy passed; API/web TypeScript and production builds passed; authenticated browser regression passed 11/11 with no overflow or console errors. Screenshot: `output/playwright/paper-trading/paper-trading-stock-lifecycle.png`. Pre-change backup and count manifests: `/home/novius2/backups/paper-trading-20260811-logic-fix/`; no table lost rows.
# SmartAPI collector hardening and operations dashboard (2026-08-11)

- Critically reviewed `/home/novius2/NIFTY50/smarapi`, the Go collector, PostgreSQL archive evidence and the deployed `trading-stack-novius2` runtime. Full evidence and limitations are in `docs/smartapi/SMARTAPI_COLLECTOR_CRITICAL_REVIEW_2026-08-11.md`.
- Hardened candle throttling to 2/sec and 120/minute, made WebSocket TLS verification mandatory, blocked order/GTT endpoints unconditionally, stabilised five-minute option subscription replanning, corrected per-socket allocation health, corrected false exchange-sequence gap accounting, and added liveness/readiness/metrics endpoints.
- Raw tick persistence now uses PostgreSQL COPY with an idempotent conflict fallback. Post-restart WebSocket health shows three real 1,000-token socket allocations, zero sequence anomalies and zero archive drops.
- Added SmartAPI collector coverage, REST rate usage, freshness and socket health to the authenticated Admin Control Plane. Replaced partition-wide freshness scans; authenticated response improved from about 19.7 seconds to 312 ms.
- Verification: `go test ./... -count=1` passed; TypeScript checks passed; dashboard API tests passed 60/60; production dashboard and collector images built and deployed; both services are healthy. No live order was placed.
- Explicit limitation: all three SmartAPI sockets are full and 363-365 lowest-priority requested option-wing subscriptions are capacity-dropped. Deployment was after market close, so a full 09:15-15:40 live-session soak remains required.

## Homepage all-F&O real-data uplift (2026-08-11)

- Implemented `homepage-upflit/REAL_DATA_WIRING.md` as a real-data acceptance contract while retaining the established homepage sector canvas.
- The overview now renders all 208 mapped F&O stock underlyings, exposes 1D/5D/relative-volume/RSI/Williams/OIIS/30-day lenses, keeps live ordering stable by default and marks the latest OIIS-selected stocks with a persistent purple border.
- The API evaluates all 36,343 genuine active NSE F&O contracts from the contract master and separately reports current-session observation coverage. At verification: 3,898 observed today, 2,158 anomalies, 246 big asks, 158 big bids, 1,412 excess moves and 895 wide spreads.
- Added an above-fold anomaly flash that guarantees promotion of an available big-ask and excess-move contract, plus a full 36-row radar diversified to no more than two promoted contracts per underlying. Missing quotes remain unavailable rather than becoming zero.
- Re-enabled the existing Dow Jones, Brent crude and other supporting global/commodity metrics on Home.
- API/web TypeScript checks passed, API tests passed 60/60, and the deployed authenticated Playwright regression passed 20/20 with no application request failure, console error or horizontal overflow. Dashboard is healthy with zero final-deployment restarts.
- Evidence and formulas: `docs/ui-ux/HOMEPAGE_REAL_DATA_UPLIFT_2026-08-11.md`. Screenshot: `output/playwright/homepage-real-data/homepage-all-fno-1920x1080.png`.

## Paper Trading Command Center uplift (2026-08-11)

- Replaced the open-position-only screen with a decision-led paper signal-quality command center. It explicitly separates actual execution P&L from analytical target potential and keeps closed executions visible while their D+5/D+30 observation continues.
- Added four clocks: D0 intraday `+0.3/+0.4/+0.5/+1%`, D+1…D+5 swing `+1/+3/+5%`, five-session MFE/MAE and thirty-session MFE/MAE. Developing evidence is not counted as a failed mature outcome.
- Added an explainable quality projection, actual-versus-opportunity summary, reward/pain atlas, target/adverse conversion, complete trade matrix, keyboard search/filters/sorts and a Journey/Targets/Evidence/Audit drawer backed by bounded one-minute bars and immutable events.
- Additive migration `005_evaluation_rules_and_intraday_040.sql` created the versioned evaluation rule set and added only two expected +0.4% definitions/tracks. All trade, fill, position, observation, event and outbox counts were preserved. External backup and count manifests are at `/home/novius2/backups/paper-trading-command-center-20260811T1330Z`.
- Added a deterministic standalone prototype at `/home/novius2/NIFTY50/Paper-Trade-UI/NIFTY50_Paper_Trading_Command_Center_Uplift.html` and detailed implementation/report docs under `docs/paper-trading/`.
- Verification: API tests 63/63; paper tests 22/22 with Ruff, mypy and 85% coverage; TypeScript and production builds passed; migration repeatability passed; deployed Playwright passed 30/30 on desktop, responsive layout, all drawer tabs and the standalone prototype. Screenshots/results are under `output/playwright/paper-trading-command-center`. No live order was placed.
# Options Intelligence workspace (2026-08-11)

- Reviewed the complete `/home/novius2/NIFTY50/Option-Chain-Prediction-UI` guide and rendered HTML reference before implementation.
- Added the authenticated `/options/intelligence` route and a new Options sidebar item. The workspace uses live PostgreSQL evidence rather than mock rows.
- Added `/v1/options-intelligence/summary` and `/v1/options-intelligence/candidates/:symbol`; sources are `fno_volatility.*` decision tables plus coherent snapshots from `public.smartapi_option_chain_snapshots`.
- Decision-time chain quality is frozen at/before `decision_as_of`; current chain monitoring has a separate timestamp and cannot rewrite the stored decision.
- UI exposes the full funnel, ranking, DQS/MRS/LCS/VES/CQS/FRS anatomy, hard reasons, current spot/future path, OI/volume chain, selected structure economics, detailed bid/ask/OI/IV/Greeks/depth rows and provenance.
- Verified real archive at implementation time: 79,508 normalized chain rows, 186 stock-F&O underlyings, latest 15-name movement shortlist, five live structure tests and zero valid trades. `NO_TRADE` was preserved.
- Added three score/gate regression tests. API suite 66/66 passed; API/web typechecks and production image build passed.
- Deployed only `n50-dashboard`; container healthy. Playwright `tools/playwright/options-intelligence-regression.mjs` passed 13/13 at desktop and tablet sizes. Evidence is under `output/playwright/options-intelligence/`.
- Full implementation/audit record: `docs/options-intelligence/OPTIONS_INTELLIGENCE_IMPLEMENTATION_2026-08-11.md`.

## n8n paper-trading low-noise notifications (2026-08-11)

- Audited every `/home/novius2/NIFTY50/n8n` document, the active workflow, recent executions, the PostgreSQL event/outbox history and paper event/monitor/webhook code.
- Replaced the active recursive formatter with `Paper-Trade-Outgoing-Low-Noise-v3` while retaining the authenticated `/webhook/codex-paper-trade` endpoint.
- Today's 83-event replay would send 9 decision-relevant messages and suppress 74 chat notifications, including 68 transient stale/recovered flips; all events remain stored in PostgreSQL.
- Added concise stock/OIIS, actionable F&O, accepted, filled, analytical-target, partial/full-close, horizon and summary messages. Unknown/heartbeat/poll/mark, non-actionable F&O and duplicate single-leg lifecycle events are silent.
- Added an explicit actionable/suppressed branch and `lastNode` response mode. Immediate duplicate and transient-stale tests return 200 without calling the gateway; actionable gateway failures can now be retried by the backend outbox.
- Moved the outbound `X-API-Token` from inline node parameters into n8n Header Auth credential storage. The historically exposed gateway token and the API key supplied in chat still require operator rotation.
- Verification: 15/15 local policy tests passed; production smoke executions for equity, F&O, analytical target, actual close, dedupe, stale suppression, credential-backed summary and an explicit non-trade delivery test succeeded; outbox had zero pending and zero dead.
- Code and tests: `services/paper_trading/n8n/`; implementation record: `services/paper_trading/docs/n8n-low-noise-alert-plan.md`; protected rollback export: `/home/novius2/backups/n8n/2026-08-11-paper-low-noise-v3/workflow-before.json`.
- A later exact production-shape audit found that n8n treats `application/cloudevents+json` as binary. Embedded strict mode removed the Code node's binary-helper context, producing controlled failed execution 143. The workflow builder/live patcher now omit strict mode only from embedded n8n source; standalone code remains strict. Execution 144 then returned HTTP 200 and WhatsApp gateway status `sent` (result 4871). The message explicitly said delivery test and no paper trade was created or changed. Historical red executions 114/115 were separate gateway 429 burst failures and remain immutable audit records.

## FII/DII trend and source-freshness upgrade (2026-08-12)

- Upgraded `/institutional/flow` into a visible `FII / DII & Participant Flow` view while preserving all existing participant-positioning evidence.
- Added an official NSE-only cash-flow chart with daily FII/FPI and DII net activity in ₹ crore plus cumulative FII/FPI and DII trend lines. The chart reads `institutional_flow.normalized_nse_fii_dii`, retains nulls as missing, supports zoom, and is explicitly labelled as daily/post-close rather than live intraday flow.
- Added source-level status for NSE cash FII/DII, normalized participant derivatives OI, NSDL daily FPI trends, NSDL fortnightly sector exposure, and the legacy detailed participant report. Each source shows cadence, data-through date, lag, row count, last refresh when recorded, and CURRENT/DELAYED/STALE/MISSING state.
- Added recent-session cash coverage against the Nifty trading-date series and lists missing dates instead of silently filling them. At deployment the cash source was current through `2026-08-11` with 16/20 recent sessions; `2026-07-20` through `2026-07-23` were honestly identified as missing. The detailed participant charts remained stale through `2026-03-30`, so the page-level state remains degraded rather than falsely current.
- Added a user-triggered `Refresh data` action that re-queries the canonical API/PostgreSQL sources. It does not invent reports or start an unscheduled external ingestion job.
- Corrected all seven ECharts on this page from zero-height canvases to responsive 420px/340px desktop and 320px mobile surfaces, and aligned the page with the canonical light workstation tokens.
- Validation: API route tests 2/2, API/web TypeScript checks passed, live API returned 46 cash trend points, dashboard container healthy, and targeted Playwright passed 2/2 at 1920x1080 and 390x844 with chart height assertions, no horizontal overflow, no failed application requests, and no console errors. Evidence: `output/playwright/fii-dii-flow/`.
- Follow-up decimal audit covered all seven FII/DII charts. Every plotted numeric series is display-rounded to at most two decimal places, and every numeric value axis, tooltip, heatmap label, percentage, percentage-point and ₹-crore formatter now uses the same two-decimal maximum. Near-zero negative values normalize to zero, eliminating floating-point axis strings such as long `-25,526.000000000...` labels. Type checking, API tests and the deployed desktop/mobile Playwright suite remained green after the change.

## Global UI decimal precision enforcement (2026-08-12)

- Extended the two-decimal display rule from FII/DII to the entire authenticated application. The shared number/currency/percentage formatters now clamp requested fraction precision to two places while leaving underlying calculations and stored values unchanged.
- The common ECharts surface now rounds rendered series data, value-axis labels, visual-map labels, default/custom tooltip values and custom tooltip text to at most two decimals. Negative zero is normalised to zero.
- A live route audit found and fixed direct-render bypasses in the Market Story stock snapshot, Backtesting Run Monitor validation JSON, Simulator charge rates and fractional quantities, plus the explicit four-decimal MACD cell.
- Added deterministic formatter/chart tests and `tools/playwright/ui-decimal-precision-regression.mjs`. The final deployed audit passed 42/42 legacy routes with no visible numeric value above two decimal places; canonical desktop/tablet/mobile validation passed 24/24; FII/DII desktop/mobile validation passed 2/2. Evidence is under `output/playwright/ui-decimal-precision-final/`, `output/playwright/ui-decimal-canonical-final/` and `output/playwright/ui-decimal-fii-dii/`.
- Web tests pass 13/13, focused ESLint passes, TypeScript/build passes, and `trading-stack-novius2-n50-dashboard-1` is healthy. The repository-wide lint remains blocked by inherited unrelated errors and was not misreported as passing.

## Paper SHORT accounting and one-F&O-lot sizing (2026-08-11)

- Confirmed and regression-locked the paper domain invariant: a SHORT opens with `SELL`, closes with `BUY`, and P&L is `(entry sell price - buy-to-close price) × quantity`. A ₹100 → ₹90 SHORT profits; ₹100 → ₹110 loses.
- Every new OIIS equity paper entry and authenticated manual equity paper entry now resolves the nearest active `FUTSTK` contract from `public.instruments` and uses exactly one current F&O lot in shares. Missing lot metadata fails closed instead of reverting to one share or a rupee ticket cap.
- The paper matrix now has a Qty column, labels LONG as `BUY → SELL` and SHORT as `SELL → BUY`, keeps per-share P&L as the primary row value, and shows total position P&L only below it in brackets. The detail drawer carries the same semantics.
- Historical fills were not rescaled or rewritten. Rows whose recorded quantity differs from the current F&O lot are explicitly labelled `Legacy size`, preserving their immutable order/fill/ledger history.
- Verification: financial-domain tests 10/10, API paper projection tests 5/5, OIIS trade-contract tests 4/4, API/web typechecks and production build passed. The public authenticated Playwright regression passed with two PostgreSQL-backed trades including the PFC SHORT; screenshot: `tools/playwright/output/playwright/paper-trading-lot/paper-trading-quantity-and-short-pnl.png`. `trading-stack-novius2-n50-dashboard-1` and `trading-stack-novius2-oiis-live-1` are healthy. No live broker order was placed.

## Responsive workspace navigation — 2026-08-11

- Reviewed the complete `/home/novius2/NIFTY50/responsive-sidebar` implementation prompt and HTML references. The legacy left sidebar and hamburger drawer were retired from the rendered DOM and from the shared-shell CSS.
- Desktop/tablet widths above 720px now use one sticky, seven-workspace horizontal dock: Today, Markets, Stocks, OIIS Lab, Paper Trading, Derivatives and Data & Operations. Narrow desktop/tablet widths scroll the dock horizontally without reducing touch targets.
- Widths at or below 720px now use a fixed five-item bottom dock: Today, Markets, Stocks, Paper and More. More opens a non-persistent, focus-trapped bottom sheet with secondary workspaces, Commands, Presentation, Settings & feedback and admin-only controls.
- The sheet closes on X, backdrop, Escape, destination choice, route change, a downward swipe over 72px, blocking surfaces and resize above 720px. Body scroll is locked only while it is open; ordinary close restores focus to More. Mobile content reserves safe-area-aware space for the dock.
- Added canonical route metadata in `workspaceRoutes.ts`, kept workspace secondary tabs and all dashboard data/content intact, connected More to the existing command palette, and corrected an OIIS grid min-content issue that caused table overflow on phones.
- Verification: web production build and targeted ESLint passed. The deployed authenticated Playwright suite passed 118/118 across 360x800, 390x844, 430x932, 720x900, 768x1024, 1024x768, 1280x720, 1440x900 and 1920x1080, including all seven route states and 25 repeated sheet cycles. `trading-stack-novius2-n50-dashboard-1` is healthy. Evidence: `tools/playwright/output/playwright/responsive-navigation/results.json`, `wide-1920x1080-today.png`, `mobile-390x844-today.png` and `mobile-390x844-more-sheet-actual.png`.

## Isolated market status and OIIS WhatsApp V1 — 2026-08-11

- The earlier prototype `market-notifier` is retired and its n8n workflow was replaced in place
  with the strict, inactive `Market-Status-Outgoing-WhatsApp-v1` export. The route is
  `/webhook/codex-market-status-v1`; it requires dedicated credentials before activation.
- Migration `037_market_status_notifications_v1.sql` adds the isolated `market_status` schema:
  exchange-session calendar, effective NIFTY50 universe, job ledger, transactional outbox,
  delivery-attempt ledger, membership state, watermark and service heartbeats. Migration 036 is
  retained as inert historical audit; no destructive rollback was attempted.
- Three independent services are deployed: scheduler, evaluation worker and delivery worker. All
  are healthy but `DISABLED`; safe defaults are notifications false and dry-run true.
- Open is due 09:16:05 with an 09:18 cutoff; movers are due 09:20:05 with a 09:22 cutoff and
  require 50/50 unique mapped/fresh NIFTY50 constituents; final close is gated at 15:42 and can
  catch up only until 18:00. Special sessions require explicit calendar times.
- OIIS reads only committed canonical runs, uses strict full-precision X > 70 and O > 70, chooses
  at most three per direction, and suppresses empty, rank-only, score-only, unchanged and
  in-flight-equivalent memberships. Successful state advances only after a real 2xx delivery.
- Live database proof captured exactly 50 symbols and 50 unique cash tokens. Concurrent scheduler
  runs left one row per slot. A shadow run consumed OIIS run
  `bf4308d7-91d3-4092-b21c-77b8c0f41c07`, generated one schema-valid combined LONG event and
  dry-delivered it as `DRY_RUN_NO_NETWORK`; no successful membership state was advanced.
- Market-status tests pass 28/28, Ruff passes, n8n formatter/contract tests pass, Compose validates,
  all three services are healthy, and the outbox has no pending/retry/dead rows. Paper tests remain
  17 passed/6 integration skips; 93 paper-owned files match their pre-assignment SHA-256 hashes.
- The active paper workflow remains `LRFbVccpU3w0B03S`, route `/webhook/codex-paper-trade`. Its formatter-only production-shape repair was applied at `2026-08-11T19:20:03.929Z`; webhook and credentials were preserved.
- Operations, rollout and rollback: `docs/notifications/MARKET_STATUS_WHATSAPP_V1.md`.

### Market-status production activation — 2026-08-12

- Root cause for missing daily webhook messages: the isolated services were healthy but deliberately
  configured `MARKET_STATUS_NOTIFICATIONS_ENABLED=false`, `MARKET_STATUS_DRY_RUN=true`; n8n workflow
  `xPrJ9eh7RXtBopUh` was inactive and still referenced placeholder credentials.
- Created dedicated n8n inbound Basic Auth and outbound Header Auth credential records, activated
  `Market-Status-Outgoing-WhatsApp-v1`, and moved gateway/destination lookup away from unsupported
  `$vars` into runtime static data. No reusable token or destination was added to the checked-in export.
- Verified inbound auth/schema/formatter with HTTP 200 `TEST_ONLY`, then sent one clearly labelled
  end-to-end WhatsApp delivery test. n8n execution `175` completed successfully through the gateway
  and delivery-record node for event `8759b4fb-c8c6-4a20-adea-f6d5e19871ef`. The temporary send-test
  branch was restored to ordinary suppression immediately afterwards.
- Enabled the backend and disabled dry-run. Scheduler, evaluation worker and delivery worker are
  healthy/OK with zero pending, retry or dead outbox rows. Today's late-start open/movers jobs were
  correctly suppressed as `MISSED_NOTIFICATION_DEADLINE`; no backlog burst was sent.
- Replaced the example inbound values with a dedicated generated Basic Auth credential. The final
  production-client probe from the delivery container returned HTTP 200 with `TEST_ONLY`, and the
  active workflow retains its runtime gateway/destination configuration with no temporary
  configuration or send-test branch.
- Market-status tests pass 28/28 with Ruff; focused paper non-regression tests pass 12/12; n8n
  formatter contract passes. The active paper workflow and route were not modified.

## NSE daily 07:55 ingestion and missing-file WhatsApp alerts — 2026-08-12

- Reviewed the complete `/home/novius2/NIFTY50/nse-csv-ingest` package and mapped it against the
  deployed `services/nse_ingestor`, institutional-flow/FII services, SmartAPI collector, PostgreSQL
  tables and n8n estate. The existing ingestor remains canonical; no duplicate collector was added.
- Replaced weekday/07:30 orchestration with an exchange-calendar-aware 07:55 IST scheduler. It
  resolves the previous official session, uses a PostgreSQL advisory lock and enforces one
  `nse.daily_job_run` per job date.
- Every enabled report now produces an attempt record. Missing files are `unavailable`, make the
  run `PARTIAL`, and create one deduplicated `nse.daily.files.missing.v1` event rather than one alert
  per file. Delivery uses an isolated durable outbox and retry worker; paper trading is untouched.
- Added and activated n8n workflow `NSE-Daily-Ingest-WhatsApp-v1` at
  `/webhook/codex-nse-daily-ingest-v1`, with Basic Auth, an explicit event whitelist and concise
  WhatsApp formatter.
- Production proof for source session 11 August: 17 expected, 5 available/already loaded and 12
  unavailable; one outbox event was sent with HTTP 200. n8n execution `227` ran the gateway and
  delivery-record nodes. Repeated scheduler ticks were `ALREADY_CLAIMED`.
- Corrected migration startup behavior by adding `nse.schema_migrations`; pre-existing SQL is
  baselined rather than rerun, and the analysis query pack is no longer executed during restarts.
- Both containers are healthy. Container tests pass 5/5, the n8n workflow contract passes, Compose
  validates and `git diff --check` passes. Runbook:
  `docs/nse-reports/DAILY_0755_INGEST_RUNBOOK.md`.

## Master UI/UX transformation integration and release evidence — 2026-08-11

- Added the mandatory evidence ledger under `docs/ui-ux-transformation/` and mapped all 42 legacy routes to seven canonical workspaces plus a separate Admin shell.
- Retained the full all-F&O Home sector canvas (208 stocks, 19 sectors), while delivering the horizontal desktop/tablet workspace dock, five-item mobile bottom dock and explicit More sheet. No persistent left sidebar remains in the rendered DOM.
- Added canonical light tokens and typed workspace primitives; separated transport, freshness and analytical readiness; added WebSocket sequence-gap recovery and serial/de-duplicated startup snapshots to avoid Prisma pool exhaustion.
- Centralised backtesting presentation acceptance so negative-return or low-sample strategies cannot be presented as successful winners. Stored calculation outputs and strategy logic were not changed.
- Completed the final accessibility remediation: named/focusable scroll regions, valid landmarks/tab semantics, accessible form/dialog names and AA text contrast. Deployed axe result is 16/16 scans with zero violations and zero affected nodes.
- Final deployed evidence: Web 11/11; API 68/68; Paper disposable-PostgreSQL suite 23/23; Home 21/21; OIIS/Stock/Admin 33/33; Paper UI 31/31 plus SHORT/lot/P&L proof; Derivatives 14/14; canonical workspaces 24/24; responsive navigation 118/118.
- Canonical screenshots are in `/home/novius2/NIFTY50/ui-ux-transformation-evidence/phase-15-canonical-workspaces/`; responsive evidence is in `phase-12-responsive/`; accessibility JSON is in `phase-14a-accessibility/`.
- The production `trading-stack-novius2-n50-dashboard-1` image was rebuilt and is healthy. No live broker order was placed, SmartAPI collector logic was not replaced by the UI work, and no production record was deleted.
- Open gates are recorded rather than hidden: Home replay/wallboard automation, one physical selected-run Backtesting consolidation, multi-hour heap/soak and cross-engine p95 measurements, manual screen-reader/forced-colour/400% review, and inherited npm dependency findings.

## Paper WhatsApp trade-context repair — 2026-08-12 07:05 UTC

- Confirmed against production event rows that the active formatter received fill/P&L fields but
  not first-class symbol, strategy, original quantity, entry/exit or target-level context. Closed
  events also reconstructed quantity from `remaining_quantity`, producing the hidden `0 units`
  defect.
- Enriched new immutable CloudEvents with symbol, BUY/SELL side, original units, F&O lot size,
  entry/exit prices and strategy identity. Target events now retain target price, observed price,
  hit time and current mark; close events retain entry, exit, quantity and close time. No fill,
  target, cost, tax or P&L calculation changed.
- Reworked the event-specific WhatsApp copy to show stock, LONG `(BUY -> SELL)` or SHORT
  `(SELL -> BUY)`, strategy, entry/target/observed/exit levels, one-lot context, execution state,
  MFE/MAE and actual P&L. Execution closure remains explicitly separate from 5D/30D analytics.
- Updated active n8n workflow `LRFbVccpU3w0B03S` in place; it remained active and retained its
  existing webhook path and credential bindings. Pre-change backup is mode 0600 under
  `/home/novius2/backups/n8n/2026-08-12-paper-context-v4/`.
- Rebuilt/restarted only the four paper services with image
  `sha256:908152741e33f5f712ccaf327c2fbbbdc4b2238dc6b0a02154bfa40c9ff3aa26`;
  API is healthy and all workers have restart count zero. Outbox verification: 237 delivered,
  zero pending/retry/dead-letter rows.
- Verification: notification policy 16/16; focused Python tests 12/12; runtime integration tests
  correctly skipped 2/2 without `TEST_DATABASE_URL`; controlled n8n/WhatsApp delivery test
  returned HTTP 200 and gateway status `sent` with result ID 4910. The test created no trade.

## Paper Trading typography uplift — 2026-08-12 08:36 UTC

- Raised every explicit Paper Trading Command Center text declaration below 10px to a 10px
  minimum, including the previously 6px target timestamps, 7px matrix metadata, 8px target chips
  and conversion labels, and 9px chart/table support text. Headings and financial values retain
  their larger hierarchy.
- Rebuilt and deployed `trading-stack-n50-dashboard:latest` as image
  `sha256:99a4c6622551`; the authenticated dashboard is healthy with restart count zero.
- Extended the Paper Playwright regression with computed-style typography-floor checks and a
  390x844 mobile run. Result: 34/34 checks passed; 538 visible desktop text nodes and 537 mobile
  nodes have a computed minimum of 10px, with no body overflow at 1920, 768 or 390 widths.
- Evidence: `/home/novius2/NIFTY50/ui-ux-transformation-evidence/paper-font-uplift-2026-08-12/`
  contains desktop, tablet, mobile and full-page screenshots plus `results.json`.

## Complete live PostgreSQL catalog and freshness report — 2026-08-12 08:42 UTC

- Generated `docs/database/POSTGRES_COMPLETE_SCHEMA_AND_FRESHNESS_2026-08-12.md` directly from the
  live PostgreSQL 16 `tradingdb` catalogs. It covers 24 application schemas, 455 ordinary tables,
  16 partitioned-table parents and 56 views (527 relations total; 29,736 Markdown lines).
- Every relation includes columns/types/nullability/defaults, constraints, indexes, ownership,
  partition relationship, estimated live/dead rows, heap/index/total size, scan/write counters,
  maintenance evidence, observed update cadence and latest timestamp evidence when estimable.
- Added executive schema totals, 50 freshest-table ranking, 50 largest-relation ranking and an
  exact direct-`MAX()` spot-check of ten leading live candidates. Report distinguishes heartbeat
  freshness, data freshness, ANALYZE estimates and contractual scheduling rather than treating
  PostgreSQL connection health as proof that all data is current.
- Added reproducible generator `scripts/generate_postgres_schema_inventory.py`; Python compile and
  `git diff --check` pass. No schema or production data was changed.
# Email authentication and Clarity delivery repair (2026-08-12 UTC)

- Reproduced Firebase verification failure: the automatically generated N50 `continueUrl` was rejected with `UNAUTHORIZED_DOMAIN`.
- Changed the client to send a continue URL only when explicitly configured; blank now uses Firebase's hosted verification completion page.
- Added optional `N50_FIREBASE_AUTH_CONTINUE_URL` and stage equivalent to the dashboard build contract.
- Confirmed Mailpit is not applicable to the current hosted Firebase email path and did not add a misleading unused SMTP dependency.
- Added `https://t.clarity.ms` to API and ingress `connect-src`; live Clarity collection now returns HTTP 204.
- Deployed the dashboard and reloaded Nginx. API tests 70/70, web tests 13/13, both typechecks passed, auth/Clarity Playwright regression 8/8.
- Evidence: `docs/ui-ux/AUTH_EMAIL_AND_CLARITY_FIX_2026-08-12.md` and `output/playwright/auth-email-clarity/`.

## Paper Trading admin-only durable comments — 2026-08-12 UTC

- Added idempotent migration `008_admin_trade_comments` and deployed `paper_trading.trade_comments` with trade FK, administrator identity, 2,000-character validation and trade/time index.
- Added an administrator-only comments column to All Paper Trades and a Comments tab with durable history and CSRF-protected creation. Ordinary users receive no comment metadata/content and cannot call the endpoints.
- Successful creation is audited as `PAPER_TRADE_COMMENT_CREATE`; no execution, P&L, target, observation, webhook or broker-order path changed.
- Validation: canonical API 71/71 and web 13/13 tests, both typechecks, disposable migration 1/1, authenticated Playwright 65/65, unauthenticated GET/POST both HTTP 401. Dashboard and paper services remained healthy.
- Evidence and contract notes: `docs/paper-trading/ADMIN_TRADE_COMMENTS_2026-08-12.md` and `tools/playwright/output/playwright/paper-trading-command-center/`.

## Rolling Monthly independent research strategy — 2026-08-12 23:30 UTC

- Reviewed every artefact in `/home/novius2/NIFTY50/Monthly-Strat`, including the complete V2
  methodology, JSON factor contract, ten-sheet workbook, DOCX report and 23,069 scored-trade rows.
- Implemented an isolated `rolling_monthly` PostgreSQL schema, V2 factor engine, canonical-data
  runner/daemon, authenticated API and separate `Rolling Monthly` workspace at
  `/n50/strategy/rolling-monthly`. It does not import OIIS and has no Paper Trading/broker path.
- The first real run evaluated 219 active F&O underlyings for the 11 Aug signal / 12 Aug entry:
  13 LONG and 29 SHORT scanner matches, 0 High, 0 Medium, 42 Low, with complete 50/50 NIFTY breadth.
  The UI correctly reports NO TRADE and presents only the closest rejected matches for diagnosis.
- Validation: Python 6/6; API 71/71; web 13/13; API/web type checks; production build; deployed
  Playwright 28/28 at 1920x1080 and 390x844; repeat-run candidate identity stable; runner and
  dashboard containers healthy.
- Full implementation and evidence paths are in
  `docs/rolling-monthly/IMPLEMENTATION_REPORT_2026-08-12.md`.

## Navigation, interaction and strategic-journey upgrade — 2026-08-12 23:58 UTC

- Deployed a compact seven-workspace shell, universal `Ctrl/Cmd+K` command palette, central
  shortcut/focus registry, permission-aware live entity search, strategic URL context and browser
  Back scroll restoration. Removed workspace subtitles and moved Sign out into the user menu.
- Added shared Page Header, Return to Source, Related Journey, Source Freshness and collapsed
  Learn-about-analysis components to the priority Home -> Stock -> OIIS -> Paper -> Backtest ->
  Data Quality journey. OIIS formulas are now below current evidence.
- Preserved all legacy routes and the independent Rolling Monthly dashboard; it is discoverable
  through Commands/mobile More without becoming an eighth primary workspace.
- Validation: web tests 17/17, interaction Playwright 25/25, responsive navigation 118/118,
  Paper Trading 65/65 and final Axe 16/16 with zero violations. Production dashboard is
  healthy. No broker order, collector, strategy formula, Paper calculation, schema or data changed.
- Evidence: `docs/ui-ux-transformation/NAVIGATION_INTERACTION_UPGRADE_2026-08-12.md`.

## Complete backend OpenAPI documentation package — 2026-08-13 UTC

- Audited the complete repository for Express/Fastify, FastAPI, Go ServeMux and WebSocket HTTP
  surfaces. Generated a separate documentation package at
  `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`.
- Documented 276 unique operations across 17 services. The package includes an aggregate catalogue,
  YAML and JSON per-service specifications, source-linked endpoint reference, route inventory,
  authentication/safety guides, request examples, multi-service Swagger UI and reproducible tools.
- Captured the authoritative OpenAPI emitted by seven running FastAPI services, including the full
  Paper Trading schema, and used source-derived contracts for Express, Fastify, Go and WebSocket
  endpoints. No credential values were read into or written to the deliverable.
- Validation: 18 specifications parsed as OpenAPI 3.1; 552 aggregate plus per-service operations
  checked; unique operation IDs, path parameters, internal schema references and source paths all
  pass. No runtime service, database record, API contract or deployment was changed.

## OIIS selected-list daily rollover — 2026-08-13 04:27 UTC

- Made the OIIS watchlist strictly trade-date scoped. At the first OIIS loop after IST midnight,
  earlier rows are deactivated and entry-disabled with `updated_by=oiis-live-day-rollover`; no
  candidate, run, claim, paper-trade or audit evidence is deleted.
- Dashboard and candidate APIs now default to the current IST date instead of falling back to the
  latest prior run. Manual creation is rejected for a non-current date, and prior-date rows cannot
  be edited or reactivated through the watchlist mutation endpoints.
- Deployed the OIIS worker and N50 dashboard. Startup expired 48 stale active rows from 10–12 Aug;
  the 15 current 13 Aug rows remained active. Live API returned trade date `2026-08-13` with all
  15 watchlist rows belonging to that date.
- Tightened the SmartAPI collector's dynamic OIIS subscription query from a yesterday-to-tomorrow
  window to the exact current Asia/Kolkata date. The deployed refresh selected 15 current OIIS
  tokens and no prior-date rows, preventing stale daily lists from consuming token capacity.
- Validation: OIIS Python tests 26/26, API tests 74/74, API typecheck and production dashboard
  build, and Go store/collector tests passed; OIIS, dashboard and collector containers are healthy.
  A non-canonical duplicate OIIS container that could not resolve its database was stopped; the
  canonical `trading-stack-novius2` worker remains running.

## SmartAPI derivatives archive recovery watch — 2026-08-13 06:17 UTC

- Diagnosed the all-stock F&O option-chain archive as a database materialisation backlog rather
  than an absent UI feed. The old snapshot used partition-spanning per-contract LATERAL history
  lookups for roughly 2,584 contracts; REST logs also contained SmartAPI 403/rate-limit responses.
- Reworked the archive to use the collector's existing canonical `instrument_state` cache for
  quotes, volume and OI, preserving the existing WebSocket connection and adding no broker calls.
  A stale watch, 45-second attempt timeout, three bounded attempts and exponential 5/10-second
  database-only retries are active. Stale/terminal failure notifications use the existing
  rate-limited collector alert path.
- Added explicit archive watch status, snapshot age and fresh/stale/missing contract counts to the
  Options Intelligence API and UI. `Rolling 60 Day` is now a command-search alias for the governed,
  independent `Rolling Monthly` route `/strategy/rolling-monthly`; no second strategy was invented.
- Deployed collector and dashboard. Two consecutive snapshots completed on the first attempt in
  8.5s and 9.7s. The 06:17:06 UTC snapshot contains 2,584 contracts across 187 underlyings, 2,570
  fresh contracts, 13 stale contracts and 2,583 two-sided quotes. Collector, dashboard and Rolling
  Monthly containers are healthy; both public routes return HTTP 200.
- Validation: Go collector/store/config tests pass, TypeScript API/web typechecks pass, web tests
  17/17 pass, and both production images build successfully. No orders, paper-trade behavior,
  strategy formula, database schema or production records were changed.

## Strategy navigation and Rolling Monthly backtest history — 2026-08-13 07:12 UTC

- Replaced the desktop `OIIS Lab` workspace label with an extensible `Strategy` navigation menu.
  Hover/focus exposes separate `OIIS Lab` and `Rolling Monthly` destinations; mobile More retains
  both destinations. Their routes, calculations and runtime services remain independent.
- Added a `Backtest history` tab to Rolling Monthly backed by additive PostgreSQL evidence tables:
  16 High/Medium/Low band summaries, 40 condition pass/fail comparisons, 50 descriptive indicator
  correlations and 23 annual High/Medium summaries covering 1 Oct 2021 through 31 Jul 2026.
- The UI reports actual successful/failed counts, clean +1/+3/+5 outcomes, adverse 2% events,
  MFE/MAE, profit factor, yearly stability, condition uplift and correlation evidence. The governed
  success definition is clean +3% by D+5 before a 2% adverse event under the daily-OHLC stop-first
  model; correlation is explicitly descriptive rather than causal.
- Applied migration `db/sql/039_rolling_monthly_backtest_evidence.sql`, rebuilt and deployed the
  N50 dashboard, and confirmed the container healthy. Validation: web tests 18/18; production
  Playwright 41/41 at 1920x1080 and 390x844, including hover menu destinations, API record counts,
  both directions/all bands, outcome counts, evidence sections, zero console errors and no body
  overflow. Screenshots are under `tools/playwright/output/rolling-monthly/`.

## Rolling Monthly last-Tuesday expiry journey — 2026-08-13 08:42 UTC

- Added a separate `Expiry journey` view anchored to the last Tuesday of each month, not the first
  trading day. If that Tuesday is not a valid exchange session, the signal resolves to the latest
  available session on or before it; the entry remains the next valid session open.
- Added additive `rolling_monthly.expiry_run` persistence and an idempotent `backfill-expiry`
  runner command. Six completed expiries from February through July 2026 were reconstructed from
  canonical daily bars. The daemon refreshes only the latest completed expiry, avoiding repeated
  historical work and opening no new SmartAPI connection.
- The dashboard exposes original expiry-close quality, score, mandatory-gate state and full captured
  conditions; entry/current cash-equity price; current direction-normalised return; MFE/MAE; and a
  D+5 SUCCESS/FAILED/PENDING outcome. SUCCESS is clean +3% before a 2% adverse event; same daily-bar
  target/adverse is conservatively adverse-first.
- Added six-expiry performance cards with successful/failed counts, High/Medium/Low mix, pending
  count, success rate and current mean return. Production API returns six months and 289 candidate
  observations. Rolling Monthly remains independent of OIIS and disconnected from Paper Trading.
- Validation: Rolling Monthly Python tests 7/7, web tests 18/18, API/web typechecks, production
  builds, migration and both containers healthy. Authenticated production Playwright passed 51/51
  at 1920x1080 and 390x844 with no console errors/body overflow. Evidence is under
  `tools/playwright/output/rolling-monthly-expiry/`.

## Rolling Monthly Month–Year stability — 2026-08-13 09:00 UTC

- Replaced the annual stability presentation with a true Month–Year history. The backtest view now
  groups the supplied five-year research observations by signal month, direction and High/Medium
  quality band, ordered newest first; the independent last-Tuesday expiry journey is unchanged.
- Added additive table `rolling_monthly.backtest_monthly_summary` through migration
  `db/sql/041_rolling_monthly_backtest_monthly_summary.sql` and a reproducible standard-library
  generator. It contains 118 side/band cohorts across 49 distinct months from October 2021 through
  July 2026.
- Each Month–Year row exposes episodes, successful/failed counts, clean +3%/+5%, 2% adverse rate,
  T5/S2 mean, profit factor and median MAE. The previous annual evidence table remains available
  for audit compatibility but is no longer used by this dashboard section.
- Rebuilt and deployed the `/n50` dashboard. API/web typechecks, 18/18 web tests and 2/2 Rolling
  Monthly API tests pass. Authenticated production Playwright passed 53/53 at 1920x1080 and
  390x844; screenshots are in `tools/playwright/output/rolling-monthly-expiry/`.

## Rolling Monthly data-integrity and entry-timing correction — 2026-08-13 09:55 UTC

- Reconciled the supplied August review against current canonical PostgreSQL bars instead of
  hard-coding its stock list or conclusions. The old research CSV genuinely loses most equities
  from 12 June through 17 July and ends on 7 August, but the current `bars_1d` estate has repaired
  those sessions. The current confirmed scanner finds 15 reviewed names on 3 August, HYUNDAI on
  4 August and BOSCHLTD on 5 August; MANAPPURAM remains correctly rejected.
- Upgraded Rolling Monthly to factor version `2.1.0-research` with exchange-session completeness
  gates for monthly, weekly, previous-session and next-session inputs. Missing signal-time data
  blocks qualification. Missing next-session entry data leaves the valid signal visible with a
  non-executable missing-entry state instead of deleting it.
- Persisted explicit model provenance: `CONFIRMED_CLOSE_NEXT_SESSION_OPEN`, information cutoff at
  signal-session close, and next-valid-session-open entry. A separate month-end-only strategy was
  deliberately not invented or combined with these results.
- Added additive evidence governance and data-driven exchange-calendar recovery through migration
  `042_rolling_monthly_evidence_governance.sql`. The old five-year quality evidence is now
  `BLOCKED_DATA_QUALITY_REBUILD` and the Backtest History UI labels it quarantined.
- Replayed the research engine to
  `/home/novius2/NIFTY50/monthlystrat/reviewed-output/rolling_monthly_5y_20260807_20260813T094228Z`.
  It produced 21,858 trade rows and 40,688 occurrences, detected 22,682 incomplete symbol-session
  records and generically identified probable LTIM/LTM duplicate lineage across 799 sessions. The
  output remains an audit artefact, not approved performance evidence.
- Detailed findings and remaining release blockers are in
  `docs/rolling-monthly/DATA_INTEGRITY_STRATEGY_REVIEW_2026-08-13.md`. Validation: service tests
  10/10, research tests 13/13, API route tests 2/2, web tests 18/18 and authenticated production
  Playwright 57/57 at desktop/mobile. No Paper Trading connection or broker order was added.

## OpenAPI documentation refresh for Rolling Monthly — 2026-08-13 10:05 UTC

- Regenerated the complete backend OpenAPI package after the Rolling Monthly integrity changes.
  Both existing endpoints remain unchanged, but their response contracts are now typed rather than
  represented as generic objects.
- The dashboard schema documents factor version 2.1, confirmed-close/next-session-open provenance,
  live-candidate versus matured-evidence separation, evidence-governance status and the
  non-executable `MISSING_ENTRY` state. Candidate history, `signalDate` date validation and symbol
  validation are also explicit.
- Added safe request examples and `CHANGELOG.md`, regenerated YAML/JSON/catalogue/inventory files,
  and validated all 18 specifications: 552 catalogue-plus-service operations, zero validation
  errors. Refreshed package:
  `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-13.zip`.

## NSE Intelligence production integration — 2026-08-13 11:20 UTC

- Corrected the prior planning-only handoff by implementing the real-data NSE Intelligence
  dashboard at `/institutional/nse-intelligence`, with `/nse-intelligence` compatibility redirect.
  It appears in the Data & Operations header and Search & Commands.
- Added authenticated overview/reports/health APIs backed by `nse.daily_job_run`,
  `nse.ingest_run_reports`, `nse.file_registry`, `nse.fact_bhavcopy_udiff` and
  `nse.fact_text_events`. No prototype market arrays or synthetic values were copied.
- The UI separates scheduler outcome from analytical readiness. Production currently reports a
  `PARTIAL` job but `DEGRADED` usable cash intelligence: 5/5 core inputs, 5/17 total reports,
  46,057 rows loaded, and exact missing-file reasons. Official 12 August EQ breadth reconciles to
  976 advancers, 1,451 decliners and 32 unchanged across 2,459 securities.
- Command Centre, normalized Events and all 17 Reports & Health rows are live. Sector and
  stock-level F&O views fail closed with explicit prerequisite reasons instead of static/zero
  widgets. No new broker connection, database mutation, Paper Trading action or order path exists.
- API/web typechecks pass; API tests 74/74 and web tests 18/18 pass. Production build and container
  health pass. Authenticated Playwright passed 21/21 at 1920x1080 and 390x844; evidence is under
  `output/playwright/nse-intelligence/`. Implementation detail:
  `docs/nse-reports/NSE_INTELLIGENCE_IMPLEMENTATION_2026-08-13.md`.

## Rolling Monthly next-expiry cohort reports — 2026-08-13 12:00 UTC

- Added separate July 2026, June 2026 and May 2026 tabs to the independent Rolling Monthly
  `Expiry journey`. Each report includes every six-condition base-scanner match and separately
  states whether the V2 quality model considered it entry-eligible.
- Added direction-normalized cash-equity performance from next-session entry through the following
  monthly expiry: final return, maximum favourable move, maximum drawdown, dates of both extremes,
  observed sessions and `MATURED`/`DEVELOPING`/`INCOMPLETE`/`NO_DATA` state.
- June and May are matured. July is intentionally developing through the latest 12 August bar toward
  the projected 25 August last-Tuesday expiry; it is not presented as a final outcome.
- Production averages are documented in
  `docs/rolling-monthly/EXPIRY_COHORT_REPORTS_2026-08-13.md`. The two matured cohorts have a combined
  trade-weighted average expiry return of approximately -1.09%; all three including developing July
  are provisionally -1.12%.
- API tests pass 74/74, web tests pass 20/20, API/web typechecks pass, production build/container
  health pass and authenticated desktop/mobile Playwright passes 24/24. The OpenAPI Rolling Monthly
  expiry contract and ZIP were regenerated. No Paper Trading or broker-order integration was added.

- Follow-up: stock symbols in the cohort table now open an actual weekly OHLCV candlestick dialog.
  Candles are aggregated server-side from canonical `bars_1d`; purple vertical lines mark calendar
  months, and signal/next-expiry dates remain visible. The additive authenticated chart endpoint is
  `/v1/rolling-monthly/expiry-candidates/{candidateId}/chart`. Production Playwright now passes
  28/28 including desktop/mobile open-render-close coverage.

## Paper Reward vs Pain closed-execution border — 2026-08-13 13:45 UTC

- Reward vs Pain bubble fill continues to encode the analytical grade. A distinct 5px green border
  now identifies execution positions whose `remaining_quantity <= 0`; this does not imply the 5D or
  30D analytical observation has finished.
- Added explicit explanatory copy and accessible open/closed state to each bubble. Production
  verification found 9 closed and 3 open bubbles, confirmed the closed stroke as `rgb(11, 122, 83)`,
  and found no product console errors. Web typecheck and all 21 web tests pass.

## Independent Long-Only Options Router v2.0 — 2026-08-13 17:30 UTC

- Extracted and reviewed the complete package at
  `/home/novius2/NIFTY50/Long-derivatives/Long_Only_Options_Implementation_Package_v2.0`.
- Added the independent Strategy-menu route `/strategy/long-options`. It reads canonical
  `fno_volatility` movement and exact option-structure evidence, not OIIS or Rolling Monthly.
- Enforced PAPER-only, BUY-to-open/SELL-to-close safety. ATM straddles and delta strangles are the
  only PAPER routes; calls and puts remain shadow-disabled. No paper-trade write or live broker
  order endpoint was connected.
- Hard gates fail closed for stale/crossed quotes and unavailable sequence, event, depth, delta or
  tail evidence. The production response contains 14 real structures across five underlyings and
  correctly reports zero READY after the quote window expired.
- Added three authenticated APIs and regenerated the backend OpenAPI YAML/JSON/catalogue. API and
  web typechecks/builds pass, policy tests pass 5/5, production container is healthy and
  authenticated Playwright passes 25/25 at desktop/mobile.
- Implementation and remaining promotion blockers are documented in
  `docs/long-options/LONG_OPTIONS_IMPLEMENTATION_2026-08-13.md`.

## Rolling Monthly current and historical entry annotations — 2026-08-13 17:42 UTC

- Current candidate stock buttons and historical expiry-cohort stock buttons now open the same
  weekly evidence chart.
- The API returns canonical current/past qualification events for the selected symbol. Purple dots
  mark condition-met sessions; blue diamonds and solid blue vertical lines mark actual entry price
  and week. The selected entry is labelled, while past entries remain visible without label clutter.
- An evidence list states each signal date, entry date, entry price, direction and eligibility.
  Events are sourced from `rolling_monthly.candidate`, not inferred from candles.
- API/web typechecks pass, Rolling Monthly route tests pass 3/3, production container is healthy,
  and authenticated desktop/mobile Playwright passes 34/34. Detail:
  `docs/rolling-monthly/ENTRY_MARKERS_2026-08-13.md`.
# Stock Long Options funnel and NIFTY Weekly Options (2026-08-13)

- Corrected the stock Long Options presentation to expose the complete governed funnel rather than making the five-name live shortlist look like the available universe.
- Added independent dashboard `/strategy/nifty-weekly-options` and API `/v1/nifty-weekly-options/summary` for the nearest persisted NIFTY weekly expiry.
- The new strategy evaluates a BUY ATM straddle and BUY approximately 30-delta strangle using actual bid/ask, IV, delta, volume, OI and the effective NIFTY lot size.
- It is intentionally `SHADOW_NO_TRADE`: `TARGET_PROBABILITY_NOT_CALIBRATED` prevents Paper Trading or live execution.
- Implementation rationale: `docs/long-options/FNO_FUNNEL_AND_NIFTY_WEEKLY_2026-08-13.md`.

## NIFTY option-chain session retention and weekly-strategy OI context — 2026-08-14

- `option-chain-watcher` now reads `public.trading_calendar` and suppresses NSE polling and
  persistence outside the effective Asia/Kolkata exchange session. Holidays and unavailable
  session times fail closed.
- During the session, unchanged exchange-native snapshots are suppressed. Capture time and locally
  decaying Greeks are excluded from the fingerprint; an OI, OI-change, price, volume or bid/ask
  change still persists a new snapshot.
- Before cleanup, 1,793 out-of-session snapshots and 46,618 child legs were exported as gzipped CSV
  and checksum-validated. The exact 1,793 snapshots were then deleted in one transaction; cascading
  deletion removed their legs. The database retains 582 in-session snapshots and 15,132 legs, with
  zero calendar-invalid snapshots.
- Recoverable exports and manifest:
  `/home/novius2/NIFTY50/backups/option-chain-watcher/2026-08-14-out-of-session-cleanup/`.
- The independent NIFTY Weekly Options API/UI now shows OI coverage, CE/PE totals, PCR, day OI
  change, call/put walls, same-session change and per-strike OI change. This remains descriptive
  `SHADOW_NO_TRADE` evidence and does not create a Paper Trading or broker-order path.
- Watcher tests pass 4/4; NIFTY weekly API tests pass 5/5; API/web typechecks pass; production builds
  are healthy; authenticated desktop/mobile Playwright passes 41/41.
- OpenAPI was regenerated and validated: 18 specifications, 572 aggregate operations, zero errors.
  Updated ZIP: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-13.zip`.

## NIFTY Weekly & Monthly Options V2 — 2026-08-14 04:05 UTC

- Reviewed the complete `/home/novius2/NIFTY50/Niftyoptiknv2` prompt, HTML, architecture,
  API, policy, migration template, cost model, events and n8n reference.
- Canonical route is now `/strategy/nifty-options`; `/strategy/nifty-weekly-options` remains a
  compatible deep link. The Strategy menu label is `NIFTY Options`.
- The existing NSE watcher now collects distinct W0 and M0 surfaces during exchange sessions using
  one expiry-registry lookup and one request per distinct expiry. If W0=M0 it stores once. Dedupe is
  expiry-specific and the existing out-of-session suppression remains active.
- Production captured W0 2026-08-18 and M0 2026-08-25, each with 13 strikes / 26 two-sided legs.
- Added authenticated `/v1/nifty-options/summary` and `/v1/nifty-options/expiries` APIs and six UI
  views: Command Centre, Weekly, Monthly, Chain & Surface, Paper Book, Validation & Health.
- Remains `SHADOW_NO_TRADE`: uncalibrated scores render `—`; Paper Book is isolated and empty;
  no Paper Trading or live broker write path was added. Every opening leg remains BUY.
- Watcher 6/6, API 84/84, web 21/21, production build and service health pass. Authenticated
  desktop/mobile Playwright passes 53/53. OpenAPI validates 18 specs / 576 aggregate operations.
- Full implementation record:
  `docs/derivatives/NIFTY_OPTIONS_V2_IMPLEMENTATION_2026-08-14.md`.
# 2026-08-14 — Versioned Paper/Backtest trade-quality scoring

- Added leakage-safe `n50-trade-quality@1.0.0` scorer in `neon-stock-terminal/apps/api/src/lib/tradeQuality.ts`.
- Cash weights are 55 process / 45 outcome; Options are 60 / 40. Confirmed hard fails override profit.
- Missing historical entry evidence remains `NOT_ESTIMABLE` with coverage; it is not silently rated zero.
- Paper Trading includes `/paper-trading?tab=quality`, row/detail scores, and required forward plan/risk fields.
- Backtest trade projections now expose `tradeQuality`; old snapshots without the required entry-time evidence remain honest partials.
- Additive migration: `services/paper_trading/migrations/009_trade_quality_assessments.sql`.
- Historical durable checkpoint: `cd neon-stock-terminal/apps/api && npm run trade-quality:backfill` after migration.
- Full report: `docs/paper-trading/TRADE_QUALITY_SCORING_IMPLEMENTATION_2026-08-14.md`.
- Validation and deployment: API 89/89, API/web typecheck, web build, disposable PostgreSQL migration and authenticated desktop/mobile Paper plus Backtesting Playwright passed.
- Live migration `009_trade_quality_assessments` is applied. Twenty-one trade groups have durable snapshots; current visible legacy trades remain honestly `NOT_ESTIMABLE` because the original entry evidence does not exist.
- Runtime evidence and rollback are in the full report. Updated OpenAPI archive: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip`.

## Paper Trading loading incident — 2026-08-14 08:40 UTC

- The Paper workspace was delayed by an unused Weekly Performance query that remained after its UI widget was removed. It generated weekly correlated valuation/P&L/NIFTY lookups and took 8.410 seconds during reproduction under database load.
- Removed that dead read query from `GET /v1/workspace/paper-trading`; no paper write, execution, calculation, notification or stored observation changed.
- Added a three-second slow-load explanation plus a safe 20-second timeout and retry action so the page cannot remain on an indefinite spinner.
- Post-deployment authenticated API response time is 0.079–0.151 seconds across three requests, down from 8.670 seconds. API 89/89, typechecks, build and authenticated desktop/mobile Playwright pass.
- Full incident record: `docs/paper-trading/PAPER_LOADING_INCIDENT_2026-08-14.md`.

## Paper Trade Quality Matrix and durable reviews — 2026-08-14 12:58 UTC

- Reviewed and safely adapted `/home/novius2/NIFTY50/trade--quality/trade_quality_matrix_ui_bundle` into Paper Trading → `What good looks like`.
- Added server-authoritative process/outcome matrix, per-trade criterion evidence, 12 cash and 16 options hard-risk overrides, and admin-only versioned reviews.
- Migration `010_trade_quality_reviews` is live. Reviews are append-only, CSRF-protected and audited; process ratings require explicit confirmation that evidence existed at or before entry.
- Backfill evaluated all 24 paper trade groups. Latest results remain 24 `NOT_ESTIMABLE` because legacy process evidence was not captured; no false zero or demo score was created.
- API 90/90, focused 11/11, API/web typechecks, production build, disposable/live migration, Chromium desktop/mobile and CSRF-negative regression pass.
- Full report: `docs/paper-trading/TRADE_QUALITY_MATRIX_IMPLEMENTATION_2026-08-14.md`.
- Updated validated OpenAPI ZIP: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip`.
## 2026-08-25 — One-repository consolidation

- Canonical source and sole deployment checkout: `/home/novius2/trading-stack`.
- Release branch: `master`; remote: `https://github.com/PM1288/Nifty-Backtesting_Q2-2026.git`.
- Full consolidation evidence and rollback instructions: `docs/REPOSITORY_CONSOLIDATION_2026-08-25.md`.
- The 82 GB strategy artifact tree was moved under the canonical ignored `platform/nifty_stratlab/outputs/` path; `n50-dashboard` now mounts that path and has no dependency on the retired checkout.
- Restored NSE scheduler/outbox/delivery implementation and tests from the former delivery tree. Kept the newer canonical mobile dispatcher rather than restoring the superseded Firebase implementation.
- A final whole-tree scan also restored migrations `044` and `049`, audit generators, UI/UX and Paper workflow regressions, and the non-binary technical documentation corpus. Large generated evidence is retained in the canonical ignored archive rather than Git.
- Validation: web 29/29, API 122/122, NSE ingestor 5/5 and Go tests passed; Compose/source gates passed; rebuilt dashboard and NSE ingestor images; dashboard, scheduler and delivery containers healthy; public home and auth-session endpoints returned HTTP 200.
- Current performance caveat: concurrent browser suites can drive a market-universe SQL query above 70 seconds. Run critical Playwright suites sequentially pending query optimisation.

## 2026-08-25 — Strategy and Paper Trading performance repair

- Removed the full `/v1/overview` analytical workload from the shared application shell. The permanent header ticker now uses authenticated `GET /v1/overview/header`, a three-index query measured at approximately 0.10 seconds.
- Made `/health` and `/ready` constant-time probes and moved expensive database/snapshot/statement diagnostics to the explicit admin-only `/health/details` endpoint.
- Disabled the in-process analytical snapshot scheduler in production; snapshot-backed routes retain on-demand stale-while-revalidate behavior.
- Monthly Strategy now renders its four sources progressively, requests the compact selected-entry Absolute Monthly payload first, and loads the all-stock rejection ledger only when requested.
- Strategy ledgers render 250 rows at a time while filtering, counts and CSV export continue to operate on the complete loaded population.
- Rolling Strategy progressively paints the newest 250 opportunities before hydrating the complete 5,078-row historical ledger; the complete API remains available by omitting `historyLimit`, and export waits for full hydration.
- Replaced the full-overview per-underlying lateral instrument scan with a normalized instrument-universe pass and profile join.
- Restored PostgreSQL to the canonical 2 CPU / 2 GiB / 80-connection runtime profile without replacing the persistent volume. Verified 57 durable paper trade groups after recreation.
- Measured authenticated production improvements: Paper Trading 29.9 s under contention to 3.25 s; Absolute Monthly 18.6 s / 20.2 MB to 2.05 s / 3.1 MB; health up to 3.95 s to 0.05–0.10 s.
- API tests 122/122, web tests 45/45, both typechecks/builds and the canonical preservation gate pass. Full evidence and rollback: `docs/worklogs/strategy-paper-performance-repair-2026-08-25.md`.
- A subsequent three-day feature-preservation audit passed the notifier/voice controls, monthly and rolling rejection ledgers, Paper Workbench and market book, fixed-capital/swing simulations, parallel evidence export, logos, native/target cursor, Trendlyne, Long Options, NIFTY Options, command palette and responsive navigation. Stale Playwright timing/calendar assumptions were updated; no production feature was removed to satisfy a test.

## 2026-08-25 — Paper Trading progressive loading

- Removed the browser's terminal 60-second abort for the canonical Paper evidence request.
- Added fast authenticated `/v1/workspace/paper-trading/bootstrap`; portfolio counts and accounting totals render first while complete paths, targets, quality evidence and simulations continue in the background.
- Slow/full hydration cannot erase the valid summary. Failures retain usable information and expose a detailed-evidence retry.
- Applied additive read indexes in `db/sql/054_paper_workspace_read_indexes.sql`; the per-trade OIIS entry-evidence lookup improved from about 1.35 seconds to 0.19 seconds for the current ledger.
- No trading data, formulas, execution semantics or paper/live permissions changed. Full evidence: `docs/worklogs/paper-progressive-loading-2026-08-25.md`.

## 2026-08-25 — Configurable low-noise WhatsApp adapter and entry evidence media

- Replaced the default Paper outbox's external n8n hop with a direct adapter in the independent
  `paper-webhook-worker`; trading calculations and database writes never wait for notification delivery.
- Standardised the configurable destination variables as `WA_GATEWAY_URL`,
  `WA_GATEWAY_API_TOKEN_FILE` and `WA_MYSELF_CHAT_ID`. The secret is Docker-mounted and never stored
  in Git; changing a group requires deployment configuration only.
- Routine acknowledgements, pending/tick/horizon chatter and transient stale/recovered flaps remain
  durable but are suppressed from WhatsApp. Entry, target, partial/full exit, reject, summaries,
  critical failures and sustained/broad data outages remain enabled.
- Paper entries render a 1080 x 1080 PNG from time-valid NSE one-minute candles with an entry line,
  RSI panel and O/X factor evidence. Media lookup/rendering is fail-soft, so text delivery remains.
- Gateway and rollback contract: `services/paper_trading/docs/whatsapp-gateway-v4.md`.

## 2026-08-25 — WhatsApp Paper evidence V5

- Paper entry copy now bolds company name and symbol, rounds O/X/RSI to two decimals, adds
  time-valid 52-week high/low/range position and summarises up to three Trendlyne BUY reports from
  the prior 30 days. An explicit no-suggestion state is shown when no BUY exists.
- Removed the repetitive simulation/no-live-order footer and MFE/MAE from WhatsApp messages; the
  `PAPER ENTRY`, `PAPER TARGET` and `PAPER EXIT` headings remain explicit.
- Entry PNG is now 1080 x 1350 with candlesticks, Bollinger 20/2, entry and clipped 52-week
  reference lines, volume, RSI 14 and MACD 12/26/9.
- The existing 16:00 Paper summary now includes open, opened/closed, intraday hit/missed, swing
  hit/open, total target hits and net realised P&L. Existing 09:16 NIFTY and 09:20 movers jobs were
  verified delivered and retained; O/X market-status formatting now uses two decimals.
- Trendlyne continues its durable new-report-only delivery and now bolds company plus symbol.
- Release `9a1f1a4` was pushed to canonical `master` and deployed to `paper-webhook-worker`,
  `paper-scheduler`, and `trendlyne-scraper`. The Paper outbox reconciled at 1,622 delivered and
  zero pending/retry/processing/dead rows immediately after deployment.
- A single labelled format test used the latest durable IDEA paper entry without creating or
  replaying a trade. The gateway accepted media message 6075 (HTTP 200), built from 120 one-minute
  bars with a 55,037-byte PNG. The live evidence resolved Vodafone Idea Ltd., O/X/RSI to two
  decimals, 52-week ₹15.34/₹6.46 and 98.99% range position, with no Trendlyne BUY in the prior
  30 days.
- The Trendlyne startup incremental run inserted exactly one new report, delivered its new-report
  WhatsApp alert, refreshed 2,611 recommendation evaluations, and completed successfully.
- Validation: Paper 23 passed / 6 database-only skipped, Trendlyne 3 passed, market-status 28
  passed, low-noise policy 16 passed, market workflow tests passed, Ruff and mypy passed, Compose
  parsed, and the canonical source gate passed. Today's 09:16 market-open and 09:20 movers events
  were independently confirmed `SENT`; the 16:00 IST Paper scheduler is enabled in the deployed
  container.

## 2026-08-25 — WhatsApp target-hit timing and profit V6

- Target-hit alerts now show target lifecycle, elapsed time, direction-normalised profit per share,
  and gross target profit. Intraday elapsed time uses `HH:MM`; swing elapsed time uses rounded whole
  calendar days.
- Profit is calculated from the configured target price rather than the later observed bar price,
  preventing a gap or overshoot from overstating the target milestone. Gross profit uses the durable
  paper quantity. Long and short trades have separate tested direction handling.
- MFE and MAE remain excluded from both the direct WhatsApp adapter and portable n8n formatter.
- Release `4cd6603` was pushed to canonical `master` and deployed to `paper-webhook-worker`; rollback
  image `trading-stack-paper-trading:rollback-pre-target-v6-20260825` preserves the prior renderer.
- Production-backed render reconciliation passed without sending or replaying events: OFSS intraday
  +1% rendered `01:26`, `+₹116.04/share` and `+₹11,604.00` gross; ETERNAL swing +1% rendered `1 day`,
  `+₹3.27/share` and `+₹7,939.45` gross. Both used target price rather than the higher observed price.
- Validation: Paper 24 passed / 6 database-only skipped, portable notification policy 16 passed,
  Ruff and mypy passed, and the canonical repository gate passed.

## 2026-08-25 — Permanent header stock ticker restoration

- Root cause: the lightweight `/v1/overview/header` performance endpoint returned only NIFTY 50,
  BANK NIFTY and INDIA VIX as `tickerTape`, replacing the former stock tape with index rows.
- Restored a stock-only ticker rail containing the 30 largest absolute current movers from the
  profiled NIFTY-500/F&O equity universe. Index quotes remain in the dedicated header context and
  are no longer repeated as ticker items.
- The focused stock query reads `instrument_profiles`, indexed NSE cash instruments and
  `instrument_state`; production `EXPLAIN ANALYZE` measured 32.687 ms cold for 268 eligible stocks
  and 30 returned rows. The expensive full overview query is not restored to the shared shell.
- Validation: API 123/123 including a dedicated stock-only ticker contract, web 45/45, both
  typechecks and production builds passed.
- Release `60e71e6` was pushed to canonical `master` and deployed as dashboard image
  `sha256:26ccc40a150991eb0dbb5d93079f6fa3e2ff0e5be5d1efe20e895622842a12b3`; rollback image
  `trading-stack-n50-dashboard:rollback-pre-stock-ticker-20260825` preserves the prior build.
- Authenticated public verification returned 30 stock rows in 78.9 ms, beginning with IDEA,
  PAYTM, ANGELONE, IREDA and ADANIENT. All rows had positive prices and numeric percentage
  changes; NIFTY50, BANKNIFTY and INDIAVIX were absent from `tickerTape` as required.

## 2026-08-25 — Additive Paper Trading Simple View

- Added `/paper-trading?tab=simple` as a third Paper Trading view without replacing Portfolio &
  trades or What good looks like. It reuses the existing filter context and canonical trade drawer.
- The fixed-height compact table shows stock identity, IST entry date/time, entry price, O/X
  factors, D0 high, D0 low and direction-normalised maximum drawdown, plus current price and P/L.
- Open trades label current P/L as open actual gross. Closed trades label the latest price path as
  hypothetical gross, preventing current counterfactual evidence from being presented as booked P/L.
- CSV and Excel-compatible exports contain the visible fields as separate raw columns. Missing
  evidence remains blank rather than becoming zero.
- Live ledger validation found 44/44 trades populated for every requested source field. Web
  typecheck, production build, 50/50 web tests, targeted lint and the canonical source gate passed;
  the repository-wide lint remains blocked by 193 pre-existing errors outside this change.
- Browser acceptance is implemented in `tools/playwright/paper-simple-view-regression.mjs`; it checks
  the additive tab, all requested columns, contained scrolling, canonical drawer and both downloads.
