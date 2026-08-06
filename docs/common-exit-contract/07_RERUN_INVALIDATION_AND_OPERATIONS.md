# Rerun, Invalidation and Operations

## Superseded evidence

Full run `e0c2ceab-7d88-47a2-9ea9-9a876fd58d16` used OIIS V1.0 with structural
stops, a 2R target and ten-session timeout. Its ₹-50,181.88 and 39.13% win rate
must not appear in the common-exit comparison leaderboard. Keep it as immutable
audit evidence and label it `SUPERSEDED_EXIT_POLICY`.

Any other run is incompatible if it contains `STOP`, `TIMEOUT`, indicator,
forced-session or run-end liquidation as a normal exit. Do not silently edit
old output; rerun under the new policy and link old/new run identities.

All V1.1 runs are additionally
`SUPERSEDED_EARLY_EXIT_TRUNCATED_LADDER / NOT_COMPARABLE_WITH_FULL_PATH_V2`.
Their selected I030/S100 exit truncated higher reward and later adverse facts.
V1.2 fixed the D+5 path but incorrectly ended execution at D+5, so its economics
are also non-comparable. The canonical full V1.3 run is
`53b5bb32-6a33-470f-9884-8613fa18ad21`.

## Validation commands

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
./scripts/oiis.sh validate-config
platform/nifty_stratlab/.venv/bin/pytest -q \
  platform/nifty_stratlab/tests/phase2 \
  platform/nifty_stratlab/tests/phase3
```

## One-symbol OIIS acceptance

```bash
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --symbol RELIANCE \
  --start 2023-08-06 --end 2026-08-05 --workers 1
```

Verify the output directory printed by the command:

```bash
./scripts/oiis.sh verify <output-directory>
```

## Full OIIS rerun

Run only after the persisted one-stock acceptance and UI/database reconciliation
are reviewed:

```bash
CONFIRM_FULL_OIIS_REPLAY=YES \
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --start 2023-08-06 --end 2026-08-05 --workers 4
```

The one-minute CSV root defaults to
`/home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50` and can be replaced
with `--minute-csv-dir`. TMPV remains excluded.

## Acceptance checks

- no `STOP`, `TIMEOUT`, indicator or forced-close reason in trades;
- every closed reason begins `TARGET_INTRADAY` or `TARGET_SWING`;
- every open row has null exit date/price and `capital_released=false`;
- realised and unrealised P&L are separate;
- target/adverse event files exist and checksums pass;
- database and CSV counts reconcile;
- formula version is V1.3, evaluation policy is full-path V2 and execution
  scenario is `EXEC-I030-ELSE-S100-NO-TIMEOUT-V2`;
- old V1.0 results are excluded from compatible comparison.

The canonical corrected full replay completed as run
`53b5bb32-6a33-470f-9884-8613fa18ad21`: 99 symbols, 68,743 decisions, 23
enterable decisions and 18 target-closed positions. Fifteen closed at I030 and
three at S100. After-tax realised P&L was ₹7,406.4913. No stop or timeout exits
occurred. Full-path reward hits were 15/12/10/15/11/6 and adverse hits were
18/17/14/6/1/1 in ladder order. M&M and MAXHEALTH had five eligible decisions between them but no
minute CSV, so they are listed in `missing_minute_symbols.csv` and the run is
`data_completeness_status=WARN`.
