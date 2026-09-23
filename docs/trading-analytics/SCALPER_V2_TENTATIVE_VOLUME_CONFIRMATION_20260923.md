# Scalper V2 tentative EMA references with option-volume confirmation

Date: 2026-09-23

## Outcome

The existing three-instrument EMA observation remains research evidence only.
It is now displayed as a **tentative reference**, never as an actual entry,
order or fill.

- CE uses a hollow upward triangle in yellow.
- PE uses a hollow downward triangle in blue.
- The underlying triangle follows the observed CALL/PUT direction.
- These glyphs and their short `Tentative` labels render at 40% opacity, which
  is 60% transparent.
- The prior star/circle marker is not used for this rule.

## Volume EMA20 warm-up

The 1m and 5m volume overlays use period 20. The line is no longer absent for
the first 19 candles:

1. From observation 1 through 19, it is the progressive mean of all valid
   observations in the current uninterrupted run.
2. Observation 20 is the full SMA20 seed.
3. After observation 20, normal EMA recurrence uses `alpha = 2 / 21`.
4. Missing or invalid volume breaks the run. Values are never joined across a
   missing-evidence gap.

This makes the baseline visible from the first valid candle without inventing
the unavailable preceding 19 observations.

## Tentative-reference volume gate

The EMA9 alignment rule still uses exact shared, completed 5m candles. A
candidate is now emitted only when both exact option contracts have supporting
volume at the setup candle:

```text
CE volume / CE progressive Volume EMA20 >= 0.95
AND
PE volume / PE progressive Volume EMA20 >= 0.95
```

The underlying continues to supply price/EMA direction evidence; the new 95%
gate applies independently to CE and PE. Missing volume or a missing baseline
does not pass as zero. The evidence panel exposes the ratio for each option leg.

Rule identifier:

```text
SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_VOLUME_V2
```

## Calculation boundary

This repair does not create an order, alter account state, add an exit/target,
or claim a profitable signal. It changes the displayed marker contract and
requires contemporaneous option-volume support before the tentative reference
is reported.

## Validation contract

- Unit tests cover progressive warm-up, missing-volume boundaries, the exact
  95% threshold, failure below threshold, and fixed CE/PE triangle directions.
- Typecheck/build and the repository preservation gate must pass.
- Authenticated browser acceptance must confirm the three-pane marker counts,
  marker-style contract and truthful Strategy wording on the deployed page.
