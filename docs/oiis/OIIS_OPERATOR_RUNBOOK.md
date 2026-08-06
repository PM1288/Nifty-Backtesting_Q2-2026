# OIIS operator runbook

## Validate and preflight

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
./scripts/oiis.sh validate-config
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' ./scripts/oiis.sh preflight
```

## Required one-symbol acceptance

```bash
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --symbol RELIANCE --start 2023-08-06 --end 2026-08-05 --workers 1
./scripts/oiis.sh verify <output-directory-from-command>
```

## Full current-panel Nifty 100 replay

Run only after acceptance review:

```bash
CONFIRM_FULL_OIIS_REPLAY=YES \
DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb' \
  ./scripts/oiis.sh replay --start 2023-08-06 --end 2026-08-05 --workers 4
```

The full-run guard exits non-zero without the exact confirmation variable.
Outputs are one consolidated folder per run, with stock names as columns/rows—not
one folder per stock. PostgreSQL is authoritative; CSV/JSON/Markdown and
checksums support separate review.

## Saved evidence

- `oiis.replay_run`: run identity, hashes, counts and limitations.
- `oiis.decision_snapshot`: every daily decision and complete regime mapping.
- `oiis.trade_outcome`: next-open controlled LONG replay outcomes.
- `oiis.performance_bucket`: worked/did-not-work results by stock/NIFTY/Bank
  NIFTY/VIX/sector/decision condition.
- `oiis.artifact_manifest`: hashes for every exported file.
