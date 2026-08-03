# NIFTY Baseline Strategy Comparison Suite — Version 1.0

## Purpose

This package adds a controlled, fair and reproducible set of baseline intraday strategies to the existing NIFTY Strategy Lab. It is designed to prove that strategy registration, point-in-time features, next-bar execution, costs, resumability, comparison aggregation, UI reporting and P-Diagram evidence operate correctly before new ideas are accepted.

The suite contains one fixed-time control and eight candidate strategy archetypes. They are **reference hypotheses, not validated recommendations**.

## First commands

```bash
python tools/validate_suite.py
python tools/reference_golden_suite.py
```

After integration into the actual repository:

```bash
./scripts/strategy_suite.sh smoke
./scripts/strategy_suite.sh monitor last
./scripts/strategy_suite.sh verify last
./scripts/strategy_suite.sh compare last
./scripts/strategy_suite.sh ui last
```

## Integration boundary

Do not create a second backtester. Codex must integrate these JSONs, contracts and suite orchestration into the accepted `nifty_stratlab` feature registry, event simulator, effective-dated cost engine, experiment ledger, results API and web application.

## Core fairness rule

A comparison is rankable only when every strategy shares the same data snapshot, point-in-time universe, calendar, date range, fee profile, execution model, slippage, capital, position limits and quality-admission policy.

## One-command helpers

Standalone package verification:

```bash
bash RUN_REFERENCE_TESTS.sh
```

Codex medium integration into the real repository:

```bash
bash RUN_CODEX_MEDIUM.sh /absolute/path/to/target-repository
```

After the core implementation and acceptance gate, a low-context agent may execute one approved profile:

```bash
bash RUN_LOW_CONTEXT_AGENT.sh /absolute/path/to/target-repository smoke
```

The low-context agent is not authorised to edit code, JSON, thresholds, SQL or policy.
