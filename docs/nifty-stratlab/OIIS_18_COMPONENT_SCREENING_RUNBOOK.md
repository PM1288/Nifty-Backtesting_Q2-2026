# OIIS corrected baseline and 18-component screening runbook

## Scope and invariant rules

This milestone screens the nine OFactor and nine XFactor components. It does not optimise component weights or aggregate thresholds. The immutable control is O=74, X Tier-B=76 and X Tier-A=84. The authoritative cash-equity exit remains I030 intraday, otherwise eventual S100, with no stop and no timeout. The D+5 liquidation result is diagnostic only.

The implementation uses PostgreSQL inputs read-only. DOE catalogues are written only to the disposable `oiis_doe_test` database after the additive migration has passed there. High-volume event evidence is immutable Parquet under the experiment `full_evidence` directory.

## Environment

Run from the repository root:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
platform/nifty_stratlab/.venv/bin/python --version
platform/nifty_stratlab/.venv/bin/pip check
```

The wrapper always selects the accepted repository virtual environment:

```bash
./scripts/oiis_doe.sh status
```

## Complete execution sequence

```bash
./scripts/oiis_doe.sh inventory
./scripts/oiis_doe.sh qualify-data
./scripts/oiis_doe.sh preflight
./scripts/oiis_doe.sh register-existing-trials
./scripts/oiis_doe.sh reproduce-baseline --workers 4
./scripts/oiis_doe.sh run-component-screening --all-components --workers 4
./scripts/oiis_doe.sh run-redundancy-study --workers 4
./scripts/oiis_doe.sh run-walk-forward
./scripts/oiis_doe.sh run-finite-capital --capital 1000000 --max-positions 5
./scripts/oiis_doe.sh run-finite-capital --capital 1600000 --max-positions 8
./scripts/oiis_doe.sh verify
./scripts/oiis_doe.sh export --compact-max-mb 200
```

Pass the printed experiment ID with `--experiment-id` to operate on a specific run. `resume` finds the first incomplete compute stage and all completed trials are reused unless `--force` is explicitly supplied.

## Evidence interpretation

- `TARGET_ONLY` and `TARGET_FIRST` are clean I030-before-A050 paths.
- `SAME_TIMESTAMP_AMBIGUOUS` is never counted as clean.
- Every I030/I050/I070, S100/S200/S500 and adverse level is evaluated independently; the first hit does not stop path observation.
- `evaluation_sessions` means D0-D5 observation sessions. Actual holding minutes, trading sessions, calendar days, capital-days, underwater sessions and recovery sessions are separate.
- A target after D+5 is late recovery, not D+5 success.
- Every enterable decision without a path has a governed reason code.
- `UNCONSTRAINED_ENTRY_STUDY` is not a portfolio return.
- Finite-capital authoritative and D+5 diagnostic portfolios are separate scenarios.

## Current blockers that prevent promotion

The dated `nse_intraday.universe_membership` rows all reproduce one current 100-symbol panel. This is survivorship backfill and fails point-in-time membership. The authoritative corporate-action table begins after the 2024-2025 frozen study period. These conditions permit engineering and explicitly exploratory screening but block causal claims, component removal, weight changes, threshold optimisation and production promotion.

## Troubleshooting

Inspect progress without changing state:

```bash
./scripts/oiis_doe.sh status <experiment_id>
ps -eo pid,stat,etime,%cpu,%mem,rss,cmd | rg 'oiis_doe_v2.py'
du -sh platform/nifty_stratlab/outputs/oiis_complete_screening_v2/<experiment_id>
```

Run the focused suite:

```bash
platform/nifty_stratlab/.venv/bin/python -m pytest platform/nifty_stratlab/tests/phase3 -q
```

Never delete a failed trial. Correct the cause, preserve its ledger row and rerun using a new immutable result identity.
