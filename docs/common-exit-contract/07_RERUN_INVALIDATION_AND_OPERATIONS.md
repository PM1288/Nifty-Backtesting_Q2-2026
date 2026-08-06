# Rerun, Invalidation and Operations

## Superseded evidence

Full run `e0c2ceab-7d88-47a2-9ea9-9a876fd58d16` used OIIS V1.0 with structural
stops, a 2R target and ten-session timeout. Its ₹-50,181.88 and 39.13% win rate
must not appear in the common-exit comparison leaderboard. Keep it as immutable
audit evidence and label it `SUPERSEDED_EXIT_POLICY`.

Any other run is incompatible if it contains `STOP`, `TIMEOUT`, indicator,
forced-session or run-end liquidation as a normal exit. Do not silently edit
old output; rerun under the new policy and link old/new run identities.

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
- formula version and exit-policy ID are V1.1/V1;
- old V1.0 results are excluded from compatible comparison.
