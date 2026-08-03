# RSI15 / Daily40 Bounded Runner — Implementation Completion

## Outcome

The Test-Strat package is ready for deterministic checking, a tiny canonical
sample, and explicit single-symbol bounded runs. Every run produces a browser-
readable HTML report plus equity, drawdown, and per-trade net-P&L charts.

This delivery intentionally did **not** run full history, scan all source files,
write to PostgreSQL, publish a result, or place a broker order.

## Sources reviewed

- `/home/novius2/NIFTY50/Test-Strat/CODEX_IMPLEMENT_AND_VERIFY_RSI15_DAILY40_V1.0.md`
- `/home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_OPERATOR_GUIDE_V1.0(1).docx`
- `/home/novius2/NIFTY50/Test-Strat/NIFTY_RSI15_DAILY40_STRATEGY_STARTER_V1.0.zip`

The ZIP contains 56 entries. `unzip -t` passed and all entries in its
`MANIFEST.sha256` verified. All Markdown, JSON, scripts, Python tools, fixture
headers/limits, evidence files, and the DOCX body were reviewed. The five PNG
assets were checked by ZIP integrity and manifest identity; they are explanatory
mockups, not runtime inputs.

## Frozen strategy behavior

- Daily gate: exact Wilder RSI(14), SMA seed, through D-1, strictly `>40`.
- Entry: first completed 1-minute RSI(14) strictly `<15`, 09:15–14:45 IST.
- Fill: next available minute open; never the signal-bar close.
- Exit: completed 1-minute RSI strictly `>70`, next-minute open.
- Fallback: decision at 15:15, next open, no later than 15:20.
- One entry/trade per symbol/day; no re-entry or overnight carry.
- ₹2,00,000 ticket; ₹500 is an evaluation metric, not an exit.
- TEST_ONLY intraday fee schedule plus 2.5 bps slippage per side.
- Probability is `Not calibrated`; order authority is false.

## Implemented files

- `platform/nifty_stratlab/config/strategies/rsi15_daily40_intraday_v1.yml`
- `platform/nifty_stratlab/tools/run_rsi15_daily40_backtest.py`
- `platform/nifty_stratlab/scripts/run_rsi15_daily40.sh`
- `platform/nifty_stratlab/scripts/README.md`
- exact RSI and strategy/session behavior in the canonical feature, strategy,
  and simulation modules; regression tests updated/added.

## Generated artifacts

Each run directory contains `run.json`, `summary.json`, `summary.md`, `trades.csv`,
`signals.csv`, `skipped_signals.csv`, `equity_curve.csv`, `metric_slices.csv`,
`timing.json`, `data_quality.json`, `validation.json`, `pdiagram_manifest.json`,
`report.html`, three SVG charts, `checksums.sha256`, `MANIFEST.json`, and
`RUN_COMPLETE`.

## Verification results

Canonical golden sample:

- path: `platform/nifty_stratlab/artifacts/backtests/rsi15_daily40_golden_20260802T171109Z`
- 58 bars, one entry, one exit, one closed trade;
- gross P&L ₹2,584.40; TEST_ONLY costs/slippage ₹219.86; net ₹2,364.54;
- all validation checks and loose-file checksums passed;
- HTML references all three non-empty SVG charts.

Bounded real-data smoke:

- path: `platform/nifty_stratlab/artifacts/backtests/rsi15_daily40_RELIANCE_2025-07-01_2025-07-07_20260802T171135Z`
- only RELIANCE and five sessions were evaluated;
- one closed trade; net P&L −₹165.06;
- validation passed and report generated.

Test result: `29 passed in 3.01s`. Standalone package result:
`PASS: 10/10 golden assertions` and reference gross P&L `₹2584.40`.

## Operator commands

```bash
cd /home/novius2/trading-stack/platform/nifty_stratlab
./scripts/run_rsi15_daily40.sh check
./scripts/run_rsi15_daily40.sh sample
./scripts/run_rsi15_daily40.sh reliance-small
./scripts/run_rsi15_daily40.sh last
```

Explicit bounded run:

```bash
./scripts/run_rsi15_daily40.sh run RELIANCE 2025-01-01 2025-12-31 \
  /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50/RELIANCE.csv
```

After completion:

```bash
run_dir=$(tr -d '[:space:]' < artifacts/backtests/.last_rsi15_daily40_run)
cd "$run_dir"
sha256sum -c checksums.sha256
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/report.html` locally.

## Deliberate limitations and next gates

This bounded runner is ready. The starter package's larger platform wish list is
not silently claimed complete: a multi-symbol point-in-time NIFTY50 full runner,
declarative JSON registration/API, live progress/resume service, deployed React
routes, and independently reconciled production brokerage schedule remain separate
gates. Do not run full history until qualified historical universe membership and
broker-cost reconciliation are accepted. The wrapper has no implicit `full`
command for this reason.
