# OIIS component DOE V1 implementation

This implementation follows the delivery extracted at `OIIS-DOE/OIIS_FACTOR_DOE_COMPLETE_DELIVERY_V1.0/`. The ZIP integrity test passed. Its protocol, two workbooks, 147-row run matrix, experiment JSON, factor catalogue, response dictionary, regime definitions, folds, legacy ledger and event outcomes were reviewed.

## What is being tested

This is not another O/X threshold grid. The runner exposes all actual executable component scores, weights and weighted contributions:

- OFactor: MRS, SRS, TQS, RSS, MFS, MQS, ICS, LTS and CCS;
- XFactor: SIS, ELQ, TCS, SIQ, RRQ, MSS, LSQ, TSQ and IOQ.

The engine accepts governed compositional weights expressed as fractions or percentages, validates that they sum to one/100, and records the component contribution for LONG, SHORT and selected XFactor decisions. Component ablations renormalise the remaining weights exactly as prescribed by the DOE matrix.

FFactor remains undefined and is not invented.

## Regime and indicator context

Every component observation and trade is joined by its historical trade date—never a future date—to:

- stock regimes from `strategy_eval.stock_daily_regime`;
- NIFTY regimes from `strategy_eval.nifty50_daily_regime`;
- India VIX, Dow Jones, Gold, Crude Oil and USD/INR from `strategy_eval.global_market_daily_regime`.

The export retains trend, market zone, 21-session return, RSI14, annualised volatility, trend score and percentage distance from SMA20/SMA50. This allows component influence to be examined conditional on market state and indicator position.

## Run command

Small acceptance run:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/tradingdb'
python platform/nifty_stratlab/tools/run_oiis_component_doe.py \
  --symbol RELIANCE --start 2024-01-01 --end 2025-12-31 --max-trials 3
```

By default the smoke selects the canonical baseline, one OFactor ablation and one XFactor ablation. Use repeated `--trial-id` arguments for explicit trials. A future full execution can select the registered matrix phases after Stage 0 reconciliation.

## Output contract

Each DOE run creates one folder containing:

- `trades.csv`: all trials and stocks in one trade file;
- `component_event_scores.csv`: event-level component values, weights, contributions, decisions, regimes and technical positions;
- `trial_summary.csv` and `factor_effects_vs_baseline.csv`;
- `target_events.csv`, `adverse_events.csv` and `regime_performance.csv`;
- `OIIS_Component_DOE_Evaluation.xlsx` with executive, factor-effect, component, trade, regime and ladder sheets;
- `README.md` explaining the run.

The PostgreSQL tables are `strategy_eval.oiis_doe_run`, `strategy_eval.oiis_doe_trial` and `strategy_eval.oiis_doe_component_event`.

## Exit interpretation

OIIS is entry-only in the current repository. The common 0.3% intraday / 1% swing execution is a shared Rules-of-Engagement scenario. It is held constant across DOE treatments but is not described as an OIIS-owned authoritative exit. Independent reward, adverse and H30 paths continue to govern quality analysis.

## Smoke evidence

Run `5a4494f1-4737-43ec-87fa-989fbb9e1835` successfully evaluated RELIANCE over 2024–2025:

- 3 trials;
- 498 stock-date decisions per trial;
- 40,338 component-event rows;
- 3 scenario trades in the consolidated trade file;
- non-null stock, NIFTY and global-market regime context;
- valid Excel workbook and persisted PostgreSQL evidence.

This is an engineering acceptance test, not sufficient evidence to rank factors. The canonical baseline generated only one accepted trade for this stock/window; the full governed DOE needs the qualified multi-stock folds and minimum effective sample requirements from the protocol.
