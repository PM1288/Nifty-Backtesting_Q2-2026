# Common Backtest Exit Contract

This folder is the canonical handoff for the execution rules applied
to every long-equity entry strategy in NIFTY Strategy Lab. A strategy defines
only whether and when an entry is eligible. It does not silently replace the
shared exit mandate.

The frozen V1 execution mandate is:

1. Buy at the entry price produced by the declared point-in-time execution
   model.
2. During that entry session only, sell if the executable price reaches 0.30%
   above the original buy price.
3. If the 0.30% target is not filled in the entry session, promote the open
   position to a swing trade. From the next trading session onward, sell only
   when price reaches 1.00% above the same original buy price.
4. Never exit because of a stop-loss, indicator reversal, elapsed holding time,
   D+5 boundary, end of session, or end of the backtest.
5. Record downside, drawdown, adverse thresholds, time underwater and capital
   lock as risk evidence. None of those observations releases capital.
6. If the 1.00% target has not filled by the available-data boundary, keep the
   position `OPEN_AS_OF_END`, report net-liquidation value separately, and do
   not report that value as realised profit or loss.

Read the files in numerical order:

- `01_SOURCE_REVIEW_AND_DECISIONS.md`
- `02_ENTRY_EXIT_CONTRACT.md`
- `03_PROFIT_TAX_CAPITAL_CALCULATIONS.md`
- `04_TARGET_RISK_AND_REGIME_EVALUATION.md`
- `05_IMPLEMENTATION_MAP.md`
- `06_TEST_AND_ACCEPTANCE.md`
- `07_RERUN_INVALIDATION_AND_OPERATIONS.md`
- `08_LIMITATIONS_AND_OPEN_WORK.md`

Full-path ladder evaluation is now a separate V2 concern. Read
`docs/full-path-ladder-v2/README.md`: reaching I030/S100 may select an execution
fill, but never truncates I050/I070/S200/S500, adverse events, or D0-D+5
checkpoints. The implementation authorities are `evaluation/full_path_ladder.py`
for immutable research evidence and `simulation/execution_scenarios.py` for
scenario-specific capital release. `common_exit.py` is compatibility only.
