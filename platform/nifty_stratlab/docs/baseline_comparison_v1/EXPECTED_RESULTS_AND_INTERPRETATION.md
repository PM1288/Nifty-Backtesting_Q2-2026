# Expected Results and Interpretation

## Deterministic golden result

The standalone feature-snapshot test must create exactly one trade for each of the nine strategy versions. It verifies condition evaluation, crossing semantics, day gates and next-bar execution. It does not replace indicator-formula or cost-engine tests.

## Real smoke and pilot results

No profit value is predetermined. A valid smoke run may produce zero trades for one or more strategies. Functional acceptance depends on correct run completion, evidence, reconciliation and UI behaviour—not on positive P&L.

For the three-month pilot, the expected engineering result is:

- all strategies present in the comparison page, including zero-trade strategies;
- one shared compatibility hash;
- individual totals reconciling to the comparison result;
- complete cost and execution evidence;
- reproducible reruns;
- monitor showing elapsed time, throughput, ETA and resource use;
- export pack containing run, strategy, trade, equity, metric and validation artifacts.

A strategy is not considered effective merely because it has the highest net P&L. Sample size, stability, drawdown, costs, concentration and out-of-sample evidence are mandatory later gates.
