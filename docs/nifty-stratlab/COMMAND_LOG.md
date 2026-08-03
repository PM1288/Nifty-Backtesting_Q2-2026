# Integration Command Log

Date: 2026-08-02 UTC

This log records the material commands used. Secrets were never printed or copied.

## Discovery and source review

```bash
find /home/novius2/NIFTY50 /home/novius2/trading-stack -name AGENTS.md -o -name .git -type d
find /home/novius2/NIFTY50 /home/novius2/trading-stack -type f \( -iname '*.md' -o -iname '*.docx' -o -iname '*.zip' \)
rg --files /home/novius2/trading-stack -g 'go.mod' -g 'pyproject.toml' -g 'requirements*.txt' -g 'package.json' -g 'compose*.yml'
find /home/novius2/trading-stack -path '*/backtesting/internal/backtest/archive_runner.go' -o -path '*/backtesting/internal/backtest/history.go'
sha256sum /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/delivery/*.docx /home/novius2/trading-stack/docs/source/*.docx
unzip -tq <each ZIP>
unzip -l <each ZIP>
```

DOCX paragraph styles/headings were inspected using Python's standard `zipfile` and
`xml.etree.ElementTree` against `word/document.xml`. Duplicate `(1)` NIFTY DOCX
files had identical SHA-256 values and were reviewed once per unique digest.

## Delivery extraction and overlay

```bash
mkdir -p /home/novius2/deliveries/nifty-backtesting/full-review
unzip -oq NIFTY_BACKTESTING_FIVE_PHASE_COMPLETE_DELIVERY_V1.0.zip -d /home/novius2/deliveries/nifty-backtesting/full-review
unzip -oq <each phase ZIP> -d /home/novius2/deliveries/nifty-backtesting/full-review/phases
python3 <phase>/APPLY_OVERLAY.py /home/novius2/trading-stack --dry-run
python3 <phase>/APPLY_OVERLAY.py /home/novius2/trading-stack
```

All five overlays reported only additions and no overwrites. Ninety-seven delivery
files were installed before integration-specific docs/tools were added.

## Backup

```bash
mkdir -p /home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z/files
cp -a <each pre-existing affected file> <backup>/files/<same-path>
sha256sum <affected files> > <backup>/PRE_CHANGE_SHA256SUMS.txt
docker exec trading-stack-novius2-postgres-1 sh -lc 'pg_dump --schema-only --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > <backup>/postgres/tradingdb_schema.sql
```

## Production read-only inspection

```bash
docker exec trading-stack-novius2-postgres-1 sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" ...'
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm nifty-stratlab inspect-postgres
```

Queries covered schemas, table counts, columns, market-data coverage, option
freshness, and universe effective dates. One initial combined coverage query failed
because `public.bars_1d` uses `trade_date`, not `ts`; corrected per-table queries
then passed. No production DDL or DML was issued.

## Package verification

```bash
chmod +x scripts/nifty_stratlab_test.sh scripts/nifty_stratlab_migrate_test.sh
bash -n scripts/nifty_stratlab_test.sh scripts/nifty_stratlab_migrate_test.sh scripts/db_migrate_all.sh
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml config --quiet
./scripts/nifty_stratlab_test.sh
python platform/nifty_stratlab/tools/phase4_smoke.py
python platform/nifty_stratlab/tools/phase5_smoke.py
```

Initial integration result: 23 tests passed and all five smoke tests passed.
After adding the explicit RSI 1-minute/daily-regime strategy, 25 tests passed and
all five smoke tests continued to pass.

The final shell check initially exposed mixed CRLF/LF in the pre-existing
`scripts/db_migrate_all.sh`. `sed -i 's/\r$//' scripts/db_migrate_all.sh` normalized
it to LF; `bash -n` then passed. The failed syntax check executed no migration.

## Disposable database verification

```bash
./scripts/nifty_stratlab_migrate_test.sh
```

The runner created/used `tradingdb_nifty_stratlab_test`, applied migrations 014–018
twice, and reported 13 `catalog`, 13 `research`, and 4 `simulation` tables. Production
`tradingdb` was not migrated.

## Container verification

```bash
docker compose --env-file .env -f compose/compose.base.yml -f compose/compose.jobs.yml build nifty-stratlab
docker compose --env-file .env -p trading-stack-novius2 -f compose/compose.base.yml -f compose/compose.jobs.yml run --rm nifty-stratlab inspect-postgres
```

The first build revealed a 397 MB context because `.venv` was included. A package
`.dockerignore` reduced the next context to 6.05 kB and the image from 1.27 GB to
712 MB. An initial run without `-p trading-stack-novius2` connected to a different
empty Compose project; the corrected project-qualified command returned live data.

## Pilot data and bounded workbook check

```bash
. platform/nifty_stratlab/.venv/bin/activate
python platform/nifty_stratlab/tools/qualify_sources.py \
  --csv .../RELIANCE.csv \
  --csv .../JIOFIN.csv \
  --csv '.../NIFTY 50_minute.csv' \
  --csv '.../NIFTY BANK_minute.csv' \
  --csv '.../INDIA VIX_minute.csv' \
  --workbook '.../Indian Stock Market Chronicles FIIDII and Nifty Historical Study.xlsx' \
  --workbook-sample-rows 25 \
  --output platform/nifty_stratlab/outputs/pilot_qualification_20260802.json
```

Result: five WARN and one QUARANTINED. The workbook reported seven sheets using at
most 25 sampled rows per sheet and `workbooks_fully_processed=false`. India VIX had
2,547 invalid OHLC relationships and was quarantined. Input files were unchanged.

## Final change-manifest verification

```bash
awk '{sub(/^[^ ]+  /, ""); print}' docs/nifty-stratlab/CHANGE_MANIFEST.sha256 \
  | tr '\n' '\0' \
  | xargs -0 sha256sum \
  > /tmp/nifty-stratlab-change-manifest.sha256
mv /tmp/nifty-stratlab-change-manifest.sha256 \
  docs/nifty-stratlab/CHANGE_MANIFEST.sha256
sha256sum -c docs/nifty-stratlab/CHANGE_MANIFEST.sha256
```

The checked manifest is the change inventory for this non-Git deployment tree.
It intentionally excludes virtual environments, caches, generated pilot output,
and unrelated pre-existing files.

## Exact RSI strategy validation on one symbol

Assumption recorded from the request: “test on 1 when day RSI is >45” means use
1-minute RSI for signals and require prior-completed-day RSI(14) >45 for entry.

```bash
platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/run_rsi_intraday_backtest.py \
  --csv /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv \
  --symbol RELIANCE \
  --start 2025-05-01 \
  --end 2025-07-31 \
  --warmup-days 90 \
  --output-dir \
    platform/nifty_stratlab/outputs/rsi_1m_daily45_reliance_20250501_20250731
```

Result: PASS on 24,375 regular-session minute bars. There were 75 entries and 75
exits, all 75 closed trades used `strategy_exit_next_open`, and no position remained
open. Entry signal maximum minute RSI was 29.997682; entry prior-daily RSI minimum
was 47.690894; exit signal minimum minute RSI was 70.016992. With the explicitly
labelled TEST_ONLY equity-delivery costs, net P&L was -₹38,064.69, win rate was
34.67%, and maximum drawdown was -4.04%. This is a successful engine/report test,
not a profitable or deployment-approved result.

Rule and report evidence was independently asserted after the run:

```bash
platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/verify_rsi_backtest.py \
  platform/nifty_stratlab/outputs/rsi_1m_daily45_reliance_20250501_20250731
./scripts/nifty_stratlab_test.sh
```

Result: seven loose report files verified, 75 entries, 75 exits, 75 trades, five
research-pack files verified, 25 tests passed, and every phase smoke test passed.
The same rule conditions are enforced by `tests/phase2/test_rsi_daily_regime.py`.

## V2.0 package review and control implementation

```bash
sha256sum /home/novius2/NIFTY50/NIFTY_ALL_PHASES_IMPLEMENTATION_AND_TEST_PLAYBOOK_V2.0.docx \
  /home/novius2/NIFTY50/NIFTY_ALL_PHASES_IMPLEMENTATION_TEST_HANDOFF_V2.0.zip
unzip -tq /home/novius2/NIFTY50/NIFTY_ALL_PHASES_IMPLEMENTATION_TEST_HANDOFF_V2.0.zip
unzip -q -o /home/novius2/NIFTY50/NIFTY_ALL_PHASES_IMPLEMENTATION_TEST_HANDOFF_V2.0.zip \
  -d /home/novius2/deliveries/nifty-backtesting/v2-programme-20260802
bash /home/novius2/deliveries/nifty-backtesting/v2-programme-20260802/\
NIFTY_ALL_PHASES_IMPLEMENTATION_TEST_HANDOFF_V2.0/VERIFY_PACKAGE.sh
```

Result: package manifest verified 185 files; secret scan, nested ZIP integrity, CRC,
and path-safety checks passed. The programme launcher scripts were reviewed but not
executed because they spawn additional agents, require Git, and require human phase
acceptance; the target directory has no Git metadata.

```bash
./scripts/nifty_stratlab_test.sh
platform/nifty_stratlab/.venv/bin/nifty-stratlab programme-audit \
  --output platform/nifty_stratlab/outputs/v2_programme_audit_20260802.json
platform/nifty_stratlab/.venv/bin/nifty-stratlab phase1 preflight \
  --config platform/nifty_stratlab/config/programme.runtime.example.yml \
  --output platform/nifty_stratlab/outputs/v2_preflight_20260802
platform/nifty_stratlab/.venv/bin/nifty-stratlab phase2 strategy-validate \
  --manifest platform/nifty_stratlab/config/strategies/rsi_1m_daily45_v1.yml \
  --output platform/nifty_stratlab/outputs/v2_strategy_validation
platform/nifty_stratlab/.venv/bin/nifty-stratlab phase5 pack-verify \
  --zip platform/nifty_stratlab/outputs/rsi_1m_daily45_reliance_20250501_20250731/research_pack.zip \
  --output platform/nifty_stratlab/outputs/v2_pack_verification
```

Result: 27 tests and all five smoke tests passed; all 49 frozen help paths parsed
without external access; strategy and pack verification passed. Audit exit 3 is
expected: 22 EVIDENCED, 16 PARTIAL, 9 BLOCKED, 3 NOT_RUN, and all owner acceptance
states remain PENDING. Phase 1 preflight returned WARN because DSNs and Git identity
were absent. A Phase 5 gated-command probe returned exit 4 and wrote no artifact.

Clean-environment, disposable-migration, secret, and no-order checks:

```bash
V2_CLEAN_ENV=$(mktemp -d /tmp/nifty-v2-clean-XXXXXX)
python3 -m venv "$V2_CLEAN_ENV/venv"
"$V2_CLEAN_ENV/venv/bin/python" -m pip install -q \
  -e 'platform/nifty_stratlab[dev,postgres]'
"$V2_CLEAN_ENV/venv/bin/python" -m pytest -q platform/nifty_stratlab/tests
./scripts/nifty_stratlab_migrate_test.sh
python3 /home/novius2/deliveries/nifty-backtesting/v2-programme-20260802/\
NIFTY_ALL_PHASES_IMPLEMENTATION_TEST_HANDOFF_V2.0/tools/scan_for_secrets.py \
  platform/nifty_stratlab/src
rg -n 'SmartConnect|placeOrder|place_order|submit_order|broker[_ -]?auth' \
  platform/nifty_stratlab/src platform/nifty_stratlab/tools \
  platform/nifty_stratlab/config
```

Result: clean install and 27 tests passed; migrations 014–018 applied twice on
`tradingdb_nifty_stratlab_test` with 13/13/4 tables; secret scan passed; the broker
execution/authentication search returned no matches. Production was not migrated.

Pre-V2 recovery snapshot:
`/home/novius2/backups/nifty-backtesting/trading-stack-pre-v2-programme-20260802T145407Z`.

## Owner-authorised production research deployment

The owner subsequently authorised database use and a best-judgment operational
deployment. A schema and universe-data backup was created first:

```bash
BACKUP=/home/novius2/backups/nifty-backtesting/production-before-stratlab-20260802T153627Z
docker exec trading-stack-novius2-postgres-1 sh -lc \
  'pg_dump --schema-only --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$BACKUP/tradingdb-schema-before.sql"
docker exec trading-stack-novius2-postgres-1 sh -lc \
  'pg_dump --data-only --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t nse_intraday.universe_membership' \
  > "$BACKUP/universe-membership-before.sql"
```

Migrations 014–019 were each applied twice to production `tradingdb` with
`psql -X -v ON_ERROR_STOP=1`, after the backup. Final schema counts were 13 catalog,
14 research, and 4 simulation tables. Migration 019 adds skipped-signal idempotency
and the V2 acceptance-evidence register. The disposable migration suite also passed.

The governed real-data run command is copied exactly in `PRODUCTION_DEPLOYMENT.md`.
It was executed through the Compose job with `/home/novius2/data` mounted read-only
and `/home/novius2/artifacts/nifty-stratlab` mounted for evidence.

Initial live execution exposed two defects during deliberate repeat testing:

1. ZIP timestamps made the same research pack nondeterministic. ZIP timestamps and
   request creation time are now frozen; a two-build unit test proves identical bytes.
2. Result IDs were not run-scoped and validation checked only shard completion. Two
   zero-result intermediate runs were briefly published. After a complete database
   backup, they were marked `failed/failed`; IDs are now run-scoped and validation
   requires exact expected signal/trade/equity counts.

The final run was executed twice. Both produced pack SHA-256
`f071297ec7319d5cc82afadfceee7957468133901b3e45998cc1149457bbaed5`.
The second execution reported `reused_published_run=true`; the shard attempt remained
one. Direct SQL verified 150 signals, 75 trades, 24,375 equity points, zero financial-
accounting failures, and zero equity-accounting failures.

Publication guard test:

```bash
docker exec -i trading-stack-novius2-postgres-1 sh -lc \
  'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   -c "SELECT research.publish_validated_run('"'"'run_6474971945d353fa3e0e5c4545cede4e'"'"','"'"'must_not_publish'"'"','"'"'guard-test'"'"');"'
```

Result: exit 1 and zero rows under `must_not_publish`; the last-good pointer remained
`run_73281f76f5923e14d832ea232650e66a`.

Database-backed V2 commands were then executed through Compose: `programme-audit`
persisted all 50 PENDING-owner criteria, `phase1 universe-as-of` returned 100 members
for 2026-01-09 and 2026-07-31, `phase3 status` returned published/passed, and `phase5
coverage-audit` returned nine datasets. Commands before 2026-01-09 still fail closed.
All 28 tests and all five smoke tests pass. Collector, PostgreSQL, option watcher,
and market-data gateway were healthy after deployment.

## 2026-08-02 — RSI15/Daily40 Test-Strat review and bounded proof

Read-only inspection/review commands:

```bash
rg --files -uu /home/novius2/NIFTY50/Test-Strat | sort
find /home/novius2/NIFTY50/Test-Strat -type f -printf '%s\t%p\n' | sort -n
file /home/novius2/NIFTY50/Test-Strat/*
sed -n '1,760p' /home/novius2/NIFTY50/Test-Strat/CODEX_IMPLEMENT_AND_VERIFY_RSI15_DAILY40_V1.0.md
unzip -t /home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0.zip
unzip -l /home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0.zip
mkdir -p /tmp/nifty-rsi15-review-20260802
unzip -oq /home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0.zip \
  -d /tmp/nifty-rsi15-review-20260802
cd /tmp/nifty-rsi15-review-20260802/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0
sha256sum -c MANIFEST.sha256
```

The external DOCX was read with Python `zipfile` plus ElementTree over
`word/document.xml`. All ZIP Markdown/JSON/shell/Python/evidence text was printed
and reviewed; JSON was normalised with `jq`.

Implementation and bounded verification commands:

```bash
chmod 0755 platform/nifty_stratlab/scripts/run_rsi15_daily40.sh \
  platform/nifty_stratlab/tools/run_rsi15_daily40_backtest.py
platform/nifty_stratlab/.venv/bin/python -m py_compile \
  platform/nifty_stratlab/tools/run_rsi15_daily40_backtest.py \
  platform/nifty_stratlab/src/nifty_stratlab/features/technical.py \
  platform/nifty_stratlab/src/nifty_stratlab/strategies/reference_equity.py \
  platform/nifty_stratlab/src/nifty_stratlab/simulation/engine.py
cd platform/nifty_stratlab
./scripts/run_rsi15_daily40.sh check
./scripts/run_rsi15_daily40.sh sample
./scripts/run_rsi15_daily40.sh reliance-small
.venv/bin/python -m pytest
```

Artifact verification:

```bash
sample_dir=artifacts/backtests/rsi15_daily40_golden_20260802T171109Z
cd "$sample_dir"
sha256sum -c checksums.sha256
jq . summary.json
jq . validation.json
```

Results: golden 10/10; targeted tests 5/5; entire suite 29/29; canonical golden
one trade and ₹2,364.54 TEST_ONLY net; five-session RELIANCE one trade and −₹165.06
net. HTML referenced all three non-empty SVGs. No full-history run, PostgreSQL
write, publication, or broker order was performed.

Final static verification and manifest refresh:

```bash
bash -n platform/nifty_stratlab/scripts/run_rsi15_daily40.sh
platform/nifty_stratlab/.venv/bin/python -m py_compile \
  platform/nifty_stratlab/tools/run_rsi15_daily40_backtest.py
# Re-hash the prior curated manifest path list plus the seven new delivered files,
# sort it, replace CHANGE_MANIFEST.sha256, then verify with sha256sum -c.
```
