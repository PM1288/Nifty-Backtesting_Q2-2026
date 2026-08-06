# NIFTY StratLab — Five-Phase Reference Implementation

This repository is the integrated reference code delivered with the five implementation bundles. It is designed to be integrated into the existing trading stack without replacing the SmartAPI collector or destructively rewriting existing PostgreSQL schemas.

The code provides:

1. point-in-time data contracts, session/expiry configuration, source manifests and CSV/PostgreSQL qualification;
2. an effective-dated cost engine, net-target solver, strategy SDK and event-driven equity simulator;
3. deterministic run identities, resumable shards, validation-gated publication and performance metrics;
4. leakage-controlled opportunity discovery, walk-forward splits, trial logging and probability calibration;
5. buying-only option simulation using actual premium bars, Greek calculations, historical/live replay parity and reproducible research ZIP packs.

The governed Strategy Evaluation Rules of Engagement layer is documented in
`docs/STRATEGY_EVALUATION_RULES_INTEGRATION.md`. It classifies target-only runs
as opportunity scans, computes independent stock/NIFTY/India-VIX context,
persists evaluation evidence in `strategy_eval`, and exports a standard
24-sheet workbook plus CSV and checksum artifacts.

The OIIS Phase-A cash-daily research implementation is documented in
`../../docs/oiis/README.md`. Use `../../scripts/oiis.sh` to validate, preflight,
run one-symbol acceptance, verify artifacts, and—with an explicit confirmation
gate—run the full current-panel Nifty 100 three-year workload. It persists every
decision, controlled outcome and stock/NIFTY/Bank-NIFTY/VIX performance bucket
without enabling broker orders.

## Local verification

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
pytest
python -m nifty_stratlab.cli demo-backtest --strategy config/strategies/fast_oversold_rebound_v1.yml --output ./artifacts/demo
```

Run the exact RSI 1-minute/prior-daily-regime rule on one explicit CSV with
`tools/run_rsi_intraday_backtest.py`; see `tools/README.md` and the operator runbook.

The stricter RSI15/Daily40 version from `NIFTY50/Test-Strat` has a guarded wrapper:

```bash
./scripts/run_rsi15_daily40.sh check
./scripts/run_rsi15_daily40.sh sample
./scripts/run_rsi15_daily40.sh reliance-small
./scripts/run_rsi15_daily40.sh run RELIANCE 2025-01-01 2025-12-31 \
  /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv
```

Every run writes a self-contained `report.html`, equity/drawdown/trade-P&L SVG
charts, CSV evidence, validation results, timing, and SHA-256 checksums. It reads
one explicit CSV and never runs an implicit full-history or directory-wide job.

The V2.0 control surface is available under `nifty-stratlab phase1` through
`phase5`. Run `nifty-stratlab programme-audit` before a phase command. A blocked
exit is a safety result, not permission to bypass a prerequisite.

PostgreSQL functionality is optional during unit tests:

```bash
pip install -e '.[postgres,dev]'
export TRADING_DATABASE_URL='postgresql://...'
python -m nifty_stratlab.cli inspect-postgres
```

## Safety boundary

This is research and paper/shadow infrastructure. It does not place broker orders. The existing live collector remains the source boundary. Any production deployment must pass the supplied phase acceptance criteria and separate risk approval.
