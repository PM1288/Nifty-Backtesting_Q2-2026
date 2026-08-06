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

Phase 2 and Phase 3 tests passed after integration: 31 tests, zero failures.
Python compilation passed for the common evaluator, OIIS runner, hybrid runner
and shared simulator.

## Bounded OIIS acceptance

The corrected OIIS V1.1 was dry-run and then persisted as run
`51140c91-82f6-4437-92ad-555279108f74` for RELIANCE from 2023-08-06 through
2026-08-05 using 718 daily decisions and one enterable entry. The one-minute
path entered at the canonical-basis price ₹2,685.90 on 2024-01-25 at 09:15 IST
and reached the tick-rounded I030 target ₹2,694.00 at 09:28 IST. It did not use
a stop or timeout. Quantity was 74, gross P&L ₹599.40, proxy costs ₹159.0053,
35% tax reserve ₹154.1382 and after-tax realised P&L ₹286.2566. MAE before exit
was -0.3463% and MFE was +0.3351%.

Seven checksummed artifacts passed, including consolidated decisions, trades,
target events, adverse events and regime performance.
The evidence-bound run hash includes the exact RELIANCE minute CSV SHA-256.

This one profitable target is pipeline evidence only. It is not proof that OIIS
works, and V1.1 remains `OPPORTUNITY_SCAN / NOT_RANKABLE / NR`.
