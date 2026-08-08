# Universal Strategy Evaluation V2 implementation

This implementation translates the documents in `/home/novius2/NIFTY50/Universal-Evalaution` into a strategy-neutral, fail-closed post-run evaluator. It does not change a strategy's entry or exit logic.

## Default run contract

Every governed run folder should contain a single `trades.csv` covering all symbols. Optional evidence files use these names: `target_events.csv`, `adverse_events.csv`, `h30_observations.csv`, `regime_performance.csv`, `portfolio_decisions.csv`, `portfolio_equity.csv`, `skipped_signals.csv` and `trial_ledger.csv`.

The evaluator creates in one evaluation folder:

- `<STRATEGY>_Trades.csv`, one consolidated event/trade file, never one file per stock;
- `<STRATEGY>_Evaluation_Results.xlsx`, with all 25 prescribed sheets and explicit `NOT ESTIMABLE` cells;
- Word, JSON config/schema, findings, risk register, charts, evidence index, hashes and ZIP package;
- PostgreSQL run, validation-gate, risk and artifact records when a database URL is provided.

## Critical interpretation rules

- Entry-only strategies do not own an exit. Do not pass `--authoritative-exit`; shared Rules-of-Engagement results remain labelled scenario/path evidence.
- Use `--authoritative-exit` only after confirming that `exit_reason` came from the versioned strategy contract.
- A lower ladder touch never suppresses later ladder or adverse evaluation.
- MFE and 30-session maximum upside are opportunity diagnostics, not realised profit.
- A portfolio return requires `portfolio_equity.csv`; open mark-to-market liability is never discarded.
- A numeric quality score is blocked when a hard gate fails.

## Evaluate an existing run

```bash
python platform/nifty_stratlab/tools/evaluate_strategy_universal.py \
  --input-dir /path/to/run \
  --strategy-name RSI15_DAILY40 \
  --strategy-version v1 \
  --archetype ENTRY_ONLY \
  --output-dir /path/to/run/evaluation
```

## Govern a new run automatically

```bash
python platform/nifty_stratlab/tools/run_with_universal_evaluation.py \
  --strategy-name RSI15_DAILY40 --strategy-version v1 --archetype ENTRY_ONLY \
  --run-output-dir /path/to/run -- \
  python platform/nifty_stratlab/tools/run_rsi15_daily40_backtest.py <runner arguments>
```

The wrapper only evaluates after the backtest exits successfully. This should be the default invocation for future strategies.

## PostgreSQL tables

- `strategy_eval.universal_evaluation_run`
- `strategy_eval.universal_validation_gate`
- `strategy_eval.universal_risk_register`
- `strategy_eval.universal_artifact_manifest`

Migration: `db/sql/028_universal_strategy_evaluation.sql`.
