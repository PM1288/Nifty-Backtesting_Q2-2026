# Data-preservation final report

Date: 2026-08-09 UTC

## Outcome

**PASS for the strategy-lab additive deployment.** No pre-existing relation or
partition disappeared and no monitored exact critical-table count decreased.

| Check | Before | After | Outcome |
|---|---:|---:|---|
| Relations | 424 | 431 | Seven expected additions only |
| Partitions | 352 | 352 | Unchanged |
| Views | 52 | 52 | Unchanged |
| Indexes | 795 | 812 | Additive |
| Constraints | 784 | 844 | Additive |
| Functions | 8 | 8 | Unchanged |
| Triggers | 2 | 2 | Unchanged |
| Sequences | 43 | 45 | Two expected additions |

The seven new relations are:

```text
research.strategy_lab_artifact
research.strategy_lab_event
research.strategy_lab_run
research.strategy_lab_signal
simulation.strategy_lab_equity_point
simulation.strategy_lab_ladder_result
simulation.strategy_lab_trade
```

Critical timestamp ranges for minute bars, published backtests, OIIS selection
and paper-trade events did not move backwards or disappear. Migration
`060_strategy_lab.sql` was applied twice successfully to a disposable restored
PostgreSQL 16 instance before its single additive production application.

Machine-readable evidence:

- `baseline/data-preservation-manifest-pre.json`
- `baseline/data-preservation-manifest-post.json`
- `baseline/data-preservation-manifest-final.json`
- `data-preservation-comparison-final.json`

The deployment did not drop, truncate, rename or move any existing database
object and did not replace the verified PostgreSQL volume.
