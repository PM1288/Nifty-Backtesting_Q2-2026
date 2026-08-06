# Tests and Acceptance Evidence

## Automated regression cases

`tests/phase3/test_common_exit_contract.py` proves:

1. I030 exits on the entry session even after an 8% intrabar adverse move; no
   stop is fired.
2. An intraday miss promotes to S100 from the original buy price.
3. A path falling through -10% records adverse events and can later close only
   at S100.
4. An unresolved loss remains open, has zero realised P&L, negative marked
   value and does not release capital.
5. Long targets round upward to the tick.

The full repository suite now passes: 63 tests, zero failures. Twelve golden
cases in `test_full_path_ladder_v2.py` prove independent ladder reachability,
same-bar uncertainty, D+6 immutability, tick rounding, partial coverage and
monotonic invariants.
Python compilation passed for the common evaluator, OIIS runner, hybrid runner
and shared simulator.

## Bounded OIIS acceptance

The canonical OIIS V1.3 acceptance is run
`26803207-5b90-4cdd-8ca9-f59601245291` for RELIANCE from 2023-08-06 through
2026-08-05 using 718 daily decisions and one enterable entry. The one-minute
path. Although the execution scenario sold at I030, the immutable evaluator
continued and proved that I050, I070, S100, S200 and S500 were also reached by
D+5. After-tax realised P&L under the selected execution scenario was ₹286.2566.

Ten checksummed artifacts passed, including paths, targets, adverse events and
D0-D+5 checkpoints.
The evidence-bound run hash includes the exact RELIANCE minute CSV SHA-256.

This one profitable target is pipeline evidence only. It is not proof that OIIS
works, and V1.3 remains `OPPORTUNITY_SCAN / NOT_RANKABLE / NR`.
