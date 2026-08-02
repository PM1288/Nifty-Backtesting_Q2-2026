# What you should do next

The immediate next step is **not** to launch all five phases or begin testing trading strategies. The next step is to integrate and formally accept **Phase 1: Data Foundation and Qualification** inside the actual Novius2 repository.

The supplied packages are reference implementations. They have passed their isolated tests, but they have **not yet been reconciled with the real repository, the complete historical CSV contents or a disposable copy of `tradingdb`**. Until Phase 1 passes against the real environment, any strategy result could still be affected by missing minutes, duplicate bars, timestamp errors, corporate actions, present-day constituent bias or incorrect session handling.

Your historical estate contains 100 stock files and 680 index/sector/VIX files, but the current inventory proves paths, sizes and checksums—not the correctness of the data inside every file.  The PostgreSQL estate already contains extensive daily, minute, universe, feature, options, backtest and operational tables, so the new platform should adapt those structures rather than creating an unrelated second system.  

---

## 1. Download and retain these three files

Use the complete ZIP only as the master archive. For implementation, begin with the individual Phase 1 ZIP.

* [Download Phase 1 — Data Foundation](sandbox:/mnt/data/nifty_backtesting_5phase_delivery/final_deliverables/NIFTY_BACKTEST_PHASE_01_DATA_FOUNDATION_V1.0.zip)
* [Download the implementation roadmap](sandbox:/mnt/data/nifty_backtesting_5phase_delivery/final_deliverables/NIFTY_BACKTESTING_FIVE_PHASE_IMPLEMENTATION_ROADMAP_V1.0.docx)
* [Download the complete delivery archive](sandbox:/mnt/data/nifty_backtesting_5phase_delivery/final_deliverables/NIFTY_BACKTESTING_FIVE_PHASE_COMPLETE_DELIVERY_V1.0.zip)

Do not install the integrated-reference ZIP over the real repository. It is for comparison, review and synthetic testing. The phase ZIPs are the controlled integration path.

---

# 2. Establish the implementation environment

Perform this work on the server that contains:

```text
/home/novius2/data/nifty-50-minute-data/aaditya555
/home/novius2/data/nifty-50-minute-data/debashis74017
/home/novius2/data/fii-dii-and-nifty-historical-study-july-2023
```

First locate the actual application repository:

```bash
find /home/novius2 /opt /srv \
  -maxdepth 5 \
  -type d \
  -name .git \
  -print 2>/dev/null
```

Then enter the correct repository:

```bash
cd <TARGET_REPO>

git rev-parse --show-toplevel
git status --short
git branch --show-current
git remote -v
```

Do not proceed blindly when the repository is dirty. Preserve the current state first:

```bash
mkdir -p /home/novius2/backups/nifty-backtesting

git status --porcelain \
  > /home/novius2/backups/nifty-backtesting/pre_phase1_status.txt

git diff \
  > /home/novius2/backups/nifty-backtesting/pre_phase1_uncommitted.patch

git diff --staged \
  > /home/novius2/backups/nifty-backtesting/pre_phase1_staged.patch
```

Create or switch to the designated integration branch:

```bash
git switch DEV_PM_CODE 2>/dev/null || git switch -c DEV_PM_CODE
```

Create a recoverable Git pointer before any integration:

```bash
git branch "backup/pre-nifty-phase1-$(date +%Y%m%d-%H%M%S)"
```

The target structure should ultimately contain:

```text
<TARGET_REPO>/
└── platform/
    └── nifty_stratlab/
```

The coding agent may use a different location only where the repository already has a stronger established package convention. That decision must be recorded in an Architecture Decision Record.

---

# 3. Establish database safety before running an agent

Phase 1 should inspect production data **read-only**. It must not modify the production database.

You need two separate connection variables:

```text
TRADING_DATABASE_URL
    Existing tradingdb connection using a read-only role

TRADING_TEST_DATABASE_URL
    Disposable PostgreSQL database used for migrations and integration tests
```

Do not place either connection string inside a prompt, source file, Git commit or log.

Confirm that the variables exist without printing their contents:

```bash
test -n "$TRADING_DATABASE_URL" \
  && echo "Production read-only DSN is configured" \
  || echo "TRADING_DATABASE_URL is missing"

test -n "$TRADING_TEST_DATABASE_URL" \
  && echo "Test DSN is configured" \
  || echo "TRADING_TEST_DATABASE_URL is missing"
```

Confirm connectivity:

```bash
psql "$TRADING_DATABASE_URL" \
  -c "SELECT current_database(), current_user, current_timestamp;"

psql "$TRADING_TEST_DATABASE_URL" \
  -c "SELECT current_database(), current_user, current_timestamp;"
```

The production role should have only the permissions required for inspection. The test database should be a separate disposable database.

Create a schema-only backup before later schema integration:

```bash
mkdir -p /home/novius2/backups/nifty-backtesting/postgres

pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  "$TRADING_DATABASE_URL" \
  > "/home/novius2/backups/nifty-backtesting/postgres/tradingdb_schema_$(date +%Y%m%d_%H%M%S).sql"
```

For Phase 1:

```text
Production tradingdb: read only
Test database: migration and write tests allowed
Historical folders: read only
Target Git repository: writable on DEV_PM_CODE
Broker order placement: prohibited
```

---

# 4. Extract Phase 1 outside the application repository

Create a controlled delivery directory:

```bash
mkdir -p /home/novius2/deliveries/nifty-backtesting/phase1
```

Copy or upload the Phase 1 ZIP there, then extract it:

```bash
cd /home/novius2/deliveries/nifty-backtesting/phase1

unzip NIFTY_BACKTEST_PHASE_01_DATA_FOUNDATION_V1.0.zip
cd PHASE_01_DATA_FOUNDATION_QUALIFICATION
```

Review the package before applying anything:

```bash
sed -n '1,240p' README.md
sed -n '1,320p' CODEX_PROMPT.md
sed -n '1,260p' PHASE_PLAN.md
sed -n '1,260p' INTEGRATION_MAP.md
sed -n '1,260p' ACCEPTANCE_CRITERIA.md
```

Verify the phase-package hashes:

```bash
python3 - <<'PY'
import hashlib
import json
from pathlib import Path

root = Path(".")
manifest = json.loads((root / "MANIFEST.json").read_text())

errors = []
for item in manifest.get("files", []):
    path = root / item["path"]
    if not path.exists():
        errors.append(f"Missing: {path}")
        continue

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != item["sha256"]:
        errors.append(f"Hash mismatch: {path}")

if errors:
    print("\n".join(errors))
    raise SystemExit(1)

print("Phase package manifest verified.")
PY
```

---

# 5. Run the overlay in dry-run mode first

Set the target repository path:

```bash
export TARGET_REPO="/actual/path/to/repository"
```

Run:

```bash
bash APPLY_OVERLAY.sh "$TARGET_REPO" --dry-run
```

Review the output carefully. The dry run should show intended additions or merges without changing the repository.

It must not:

* replace the current SmartAPI collector;
* overwrite an existing root `pyproject.toml`, `go.mod` or `package.json` blindly;
* delete legacy backtest tables;
* run production migrations;
* add broker-order calls;
* hard-code credentials;
* hard-code one permanent exchange session or expiry convention.

Only after the dry-run output is understood should the coding agent begin integration.

---

# 6. Use one primary Codex agent for Phase 1

At this stage, use **one integration-owning agent**, not five independent agents editing the same repository.

Verify that the Codex CLI is available:

```bash
command -v codex
codex --version
```

Then run the supplied full integration prompt:

```bash
cd /home/novius2/deliveries/nifty-backtesting/phase1/PHASE_01_DATA_FOUNDATION_QUALIFICATION

bash RUN_CODEX.sh "$TARGET_REPO" \
  2>&1 | tee phase1_codex_execution.log
```

The detailed prompt directs the coding agent to:

* inspect the actual repository before changing it;
* preserve the existing collector and PostgreSQL facts;
* integrate the bounded `nifty_stratlab` package;
* reconcile the existing Go and Python code;
* quarantine invalid legacy calculations;
* test migrations only against `TRADING_TEST_DATABASE_URL`;
* qualify actual historical files;
* add tests for defects discovered during integration;
* produce `PHASE_1_COMPLETION.md`;
* commit the work on `DEV_PM_CODE`.

Where the Codex CLI is unavailable, open `CODEX_PROMPT.md` and provide its complete contents to a coding agent that has terminal and repository access. Do not use the concise low-context prompt as the primary Phase 1 integrator.

---

# 7. Run Phase 1 in two data-validation stages

Do not begin by processing the entire 8.20 GiB historical estate. First prove the pipeline on a controlled pilot set, then run the full qualification.

## Stage 1A — Pilot qualification

Use representative datasets such as:

```text
Stocks
------
RELIANCE.csv
HDFCBANK.csv
INFY.csv
TATAMOTORS.csv
BAJFINANCE.csv

Shorter/newer-history cases
---------------------------
JIOFIN.csv
BAJAJHFL.csv

Indices
-------
NIFTY 50_minute.csv
NIFTY BANK_minute.csv
NIFTY IT_minute.csv
INDIA VIX_minute.csv
```

The pilot must verify:

* actual input columns;
* timestamp parsing;
* timezone interpretation;
* whether timestamps represent bar start or bar end;
* minimum and maximum dates;
* ordering;
* duplicate timestamps;
* conflicting duplicate values;
* invalid OHLC relationships;
* missing expected minutes;
* out-of-session records;
* zero or negative prices;
* volume semantics;
* corporate-action discontinuities;
* overlap with PostgreSQL/API data;
* deterministic checksums and reruns.

Fix the pipeline, not the source files. Source files should remain immutable.

## Stage 1B — Full qualification

After the pilot passes, process:

```text
100 stock files
680 index, sector, VIX and interval files
FII/DII workbook contents
```

Every file considered for research must receive one of:

```text
PASS
WARN
FAIL
QUARANTINED
```

The existing inventory does not establish these content-level results; this is the principal unfinished Phase 1 task. 

The FII/DII record presently establishes the archive and workbook checksum but not the workbook’s sheet structure, date coverage or publication-time semantics. Do not use it as a model feature until the internal workbook contents have been profiled and assigned an `available_at` rule. 

---

# 8. Divide Phase 1 among developers only after contracts are frozen

Once the primary agent has inspected the repository and fixed the module boundaries, use short-lived branches or Git worktrees.

Recommended ownership:

| Workstream               | Owner                         | Boundary                                                  |
| ------------------------ | ----------------------------- | --------------------------------------------------------- |
| Phase integration lead   | Senior coding agent/developer | Shared contracts, merge decisions, completion report      |
| Calendar and contracts   | Agent A                       | Sessions, expiry rules, timestamps, JSON schemas          |
| Historical qualification | Agent B                       | CSV profiler, manifests, quarantine, quality outputs      |
| PostgreSQL adapters      | Agent C                       | Read-only coverage, universe-as-of query, test migrations |
| Independent reviewer     | Agent D                       | Temporal leakage, tests, safety and release evidence      |

Suggested branches:

```text
DEV_PM_CODE
feature/p1-calendar-contracts
feature/p1-data-qualification
feature/p1-postgres-adapters
review/p1-independent-validation
```

One owner must control shared files such as:

```text
contracts
calendar definitions
database migrations
canonical bar schema
source manifest schema
```

Do not let multiple agents independently change those files.

The low-context runner is suitable for a narrowly bounded workstream:

```bash
bash RUN_LOW_CONTEXT_AGENT.sh "$TARGET_REPO"
```

Before using it, edit or wrap the concise task so the agent owns only one specific directory and acceptance criterion.

---

# 9. Run verification after the agent finishes

From the Phase 1 delivery directory:

```bash
bash VERIFY_PHASE.sh "$TARGET_REPO" \
  2>&1 | tee phase1_verification.log
```

Also inspect the repository changes:

```bash
cd "$TARGET_REPO"

git status --short
git diff --stat
git diff --check
git log -1 --oneline
```

Run the package tests from a clean virtual environment:

```bash
cd "$TARGET_REPO/platform/nifty_stratlab"

python3 -m venv .venv
. .venv/bin/activate

python -m pip install --upgrade pip
pip install -e '.[dev,postgres]'

python -m compileall -q src
python -m pytest -q
```

Run all affected existing tests as well:

```text
Existing Python tests
Existing Go tests
Existing TypeScript/API tests
Database migration tests
Historical data pilot tests
Point-in-time universe tests
```

The package’s own tests are necessary but not sufficient. The target repository and actual data must also pass.

---

# 10. Do not accept Phase 1 until this gate is complete

Phase 1 is accepted only when all of the following are evidenced:

| Gate                      | Required result                                                      |
| ------------------------- | -------------------------------------------------------------------- |
| Clean installation        | Package installs in a clean virtual environment                      |
| Automated tests           | Phase tests and smoke tests pass                                     |
| Actual data qualification | Every admitted file has checksum, schema, timestamp range and status |
| Quarantine                | Conflicting duplicates and invalid OHLC data cannot enter research   |
| Point-in-time universe    | Historical NIFTY membership resolves using effective dates           |
| Session handling          | NSE cash-market session produces the expected 375 one-minute bars    |
| Expiry handling           | Rules are effective-dated and holiday-adjusted                       |
| PostgreSQL safety         | No production write occurred                                         |
| Legacy reconciliation     | Existing data and relevant outputs were compared                     |
| Documentation             | `PHASE_1_COMPLETION.md` exists                                       |
| Version control           | Commit hash and changed-file list are recorded                       |
| Safety                    | No live order placement or credentials were introduced               |

The database already contains `nse_intraday.universe_membership` with effective dates and extensive existing daily and minute features. The Phase 1 implementation should use these rather than infer historical membership from today’s constituents. 

A successful synthetic smoke test alone is **not** enough.

---

# 11. What you should prepare while Phase 1 is running

These items will be needed for the next phases.

## For Phase 2

Prepare sanitised broker evidence:

* at least one actual equity intraday contract note;
* at least one actual equity delivery contract note;
* examples with more than one executed order where available;
* applicable DP charges;
* observed brokerage, STT, GST, exchange, SEBI, IPFT and stamp-duty values;
* actual tick-size examples.

Remove account number, client ID, PAN, address and other personal identifiers.

Phase 2 must reconcile the cost engine against actual broker evidence before ₹500 and ₹1,000 target calculations are accepted.

## For Phase 3

Select the first frozen reference strategy. Keep it simple:

```text
Long-only cash equity
₹2,00,000 maximum capital per stock
Signal calculated only from completed bars
Entry on next executable bar
₹500 net intraday target
Explicit stop
Defined carry-review time
₹1,000 net swing target
Defined maximum holding period
```

The purpose of the first strategy is to validate the platform, not to maximise historical profit.

## For Phase 4

Reserve the final untouched historical holdout before reverse discovery begins. Do not inspect or optimise against that period.

## For Phase 5

Continue collecting option-chain, premium, OI and Greeks data, but do not begin long-period options conclusions yet. The PostgreSQL audit showed that option-chain/OI/PCR data were recent and that the derived Greeks table had become stale relative to the continuing live feeds. 

---

# 12. The correct testing ladder

Do not move directly from synthetic data to a ten-year full-market run.

Use this progression:

```text
Level 1
Synthetic deterministic bars

Level 2
One stock, five trading days

Level 3
Five representative stocks, three months

Level 4
Current NIFTY 50, one year

Level 5
Point-in-time NIFTY universe, multiple years

Level 6
Complete qualified historical period

Level 7
Interrupted run and restart test

Level 8
Execution-cost and slippage stress tests

Level 9
Paper replay against incoming SmartAPI data

Level 10
Shadow operation with no broker orders
```

At every level, compare:

```text
signals
entry timestamps
entry prices
exit timestamps
gross P&L
each charge component
net P&L
cash
positions
equity
skipped signals
data-quality status
run checksum
```

---

# 13. Phase sequence after Phase 1

Do not overlap the release gates.

```text
Phase 1 accepted
    ↓
Phase 2: costs, target solver, feature registry and simulator
    ↓
Phase 3: resumable ten-year replay and experiment ledger
    ↓
Phase 4: reverse discovery and calibrated probability
    ↓
Phase 5: actual-premium option research and analyst ZIP packs
    ↓
Separate later programme:
paper → shadow → constrained live
```

The SmartAPI collector should continue running as it is. The historical research workload must not degrade or interrupt its live PostgreSQL writes.

---

# Your immediate action list

1. Put the Phase 1 ZIP on the Novius2 server.
2. Identify the actual Git repository path.
3. Switch to `DEV_PM_CODE` and preserve the current state.
4. Configure a read-only production DSN and a separate disposable test DB.
5. Run `APPLY_OVERLAY.sh <repo> --dry-run`.
6. Run the full `RUN_CODEX.sh <repo>` integration.
7. Qualify the pilot dataset.
8. Qualify all admitted historical files.
9. Run the phase verifier and affected legacy tests.
10. Review `PHASE_1_COMPLETION.md` against the acceptance table.
11. Merge Phase 1 only after every mandatory gate has evidence.
12. Begin Phase 2 only after that acceptance.

The single most important next milestone is:

> **A committed Phase 1 integration on `DEV_PM_CODE` with a complete historical-data qualification report, a tested point-in-time universe query, successful disposable-database migration evidence and confirmation that production PostgreSQL was not modified.**

Send the resulting `PHASE_1_COMPLETION.md`, test logs and qualification summary back here for an independent gate review before Phase 2.
