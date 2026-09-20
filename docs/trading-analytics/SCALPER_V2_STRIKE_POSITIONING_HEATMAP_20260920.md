# Scalper V2 strike structure and positioning heatmap — 20 September 2026

## Outcome

The existing three-panel Scalper V2 right column retains **OI by strike** and
now uses its lower two panels for:

1. **Strike structure** — strike on X; CE/PE OI bars; signed Delta OI lines;
   premium-return markers; CE1-CE5 and PE1-PE5 rank labels; and separate CE/PE
   Long buildup, Short buildup, Short covering or Long unwinding labels.
2. **Strike x time positioning** — 5-minute cells by default and 15-minute
   cells in 15m mode. Each cell is the mean of the available signed Delta OI
   share, bounded premium return, signed volume share and order-depth imbalance.

This is a presentation and retained-evidence extension. It does not alter any
signal, order, measurement, contract-selection or ranking rule elsewhere.

## Evidence and missing data

`/v1/trading-analytics/option-price-history` now returns OI, reported Delta OI,
volume and depth fields alongside premium. It first uses the native archived
option chain. When that session is absent, it reads the already-retained
SmartAPI FULL quote snapshots for the nearest ten paired strikes and buckets
them to the requested 5/15-minute interval. No new collector or broker request
is introduced.

For the retained-quote fallback, Delta OI is current OI minus the first retained
OI observation of that session. The tooltip names this baseline. A heatmap cell
also reports how many of its four components were available. Missing inputs
remain missing and do not contribute a numerical zero.

The regime classification is mechanical and contract-local:

| Premium return | Delta OI | Regime |
|---|---|---|
| positive | positive | Long buildup |
| negative | positive | Short buildup |
| positive | negative | Short covering |
| negative | negative | Long unwinding |

It is not an underlying-direction recommendation and does not attribute an
anonymous strike position to a participant category.

## Validation

Focused tests cover all four regimes, missing-component preservation,
session-first baselines, pressure construction and the CE1-CE5/PE1-PE5 chart
contract. The API test covers native history and retained SmartAPI fallback.
Full web/API checks, the canonical preservation gate and production browser
evidence are recorded in the delivery report for this change.
