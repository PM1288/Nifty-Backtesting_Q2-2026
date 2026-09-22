# Scalper V2 entry arrows and strategy evidence

Date: 23 September 2026
Route: `/n50/strategy/trading-analytics?view=scalper_v2&interval=5`

## Cause and repair

The three-instrument EMA calculation was working. Authenticated production
inspection found `READY`, six references, and six native markers on each of the
NIFTY, selected CE and selected PE panes. The marker adapter nevertheless
forced every potential reference to the Lightweight Charts `circle` shape.
That presentation made the requested directional entry arrows appear missing.

The adapter now uses a yellow arrow whose direction is local to the pane:

| Reference | NIFTY | selected CE | selected PE |
| --- | --- | --- | --- |
| CALL | up | up | down |
| PUT | down | down | up |

The same exact timestamp remains on all three panes. A marker is not drawn when
the exact completed candle is absent.

## Methodology shown in Strategy

`SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_V1` remains unchanged:

- completed five-minute candles only;
- CALL requires NIFTY and the selected CE to cross/close above EMA9 while the
  selected PE crosses/closes below EMA9;
- PUT is the exact inverse;
- each leg crosses on the current or immediately previous completed candle;
- each leg has at least two of its five completed pre-cross closes on the source
  side of EMA9;
- all three exact timestamps must exist; nearest-time replacement is forbidden;
- the result is a research entry reference, not an order, fill, target or exit.

The right inspector's `Rules` label is now `Strategy`. `More -> Strategy
evidence` opens it directly. It contains the exact leg evidence, retained-data
evaluation and other existing strategy references.

## Retained-data evaluation contract

The evaluation uses only the currently selected exact CE and PE contracts and
retained completed bars. It splits observations by IST session and recalculates
the rule independently in each session.

For each reference it reports direction-adjusted NIFTY return and the selected
CALL/PUT premium return after 1, 3 and 6 exact bars. `Both positive` means both
were positive in the reference direction. It is not a win rate or P&L because
there is no reconstructed fill, cost, target, stop or exit.

Pearson correlation uses exact timestamp-matched close-to-close returns for:

- NIFTY versus the selected CE;
- NIFTY versus the selected PE.

The panel and JSON export show sample/session counts. Missing forward bars are
excluded rather than replaced or converted to zero.

## Pre-release live-data evidence

Authenticated production data for NIFTY 29 September 2026, strike 23,350,
contained one exact shared session (`2026-09-22`), 75 selected-CE bars and 75
selected-PE bars. The retained calculation produced:

| Metric | Evidence |
| --- | ---: |
| References | 6 (3 CALL / 3 PUT) |
| NIFTY / CE return correlation | +0.869, n=74 |
| NIFTY / PE return correlation | -0.902, n=74 |
| 1-bar both-positive follow-through | 3/6 |
| 3-bar both-positive follow-through | 3/6 |
| 6-bar both-positive follow-through | 1/6 |

This is a one-session sample and cannot establish a durable trading edge.

## Preservation and validation

The implementation changes marker presentation and adds read-only evidence. It
does not change the EMA rule, V7 paired-body rule, OI direction rule, source
queries, SmartAPI collector, contract selection, alert eligibility, drawings,
measurements, exports other than adding strategy evidence to JSON, or any
paper/live order control.

Focused rerun:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npx tsx --test tests/scalperV2EmaAlignment.test.ts tests/scalperV2EmaEvaluation.test.ts
```

Run the complete repository-required web/API checks and canonical gate before
release. Authenticated browser acceptance must confirm the six arrows, Strategy
panel, sample counts, and no page/API error before completion is claimed.
