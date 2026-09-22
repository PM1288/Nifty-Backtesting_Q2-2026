# Scalper V2 three-instrument EMA potential reference

Date: 22 September 2026
Route: `/n50/strategy/trading-analytics?view=scalper_v2&interval=5`

## Outcome

Scalper V2 now marks a new, render-only **potential entry reference** with a
yellow star on the NIFTY/stock, selected CE and selected PE panes. The reference
does not place an order, reconstruct a fill, invent a target or alter the
existing V7 and OI-direction rules.

The exact selected CE and PE are evaluated independently; they do not need to
share a strike. Only completed, exact-time 5-minute observations are eligible.

## Closed-bar rule

For a CALL reference, all three exact instruments must be aligned at timestamp
`t`:

- underlying close is above EMA9 after crossing from below;
- selected CE close is above EMA9 after crossing from below;
- selected PE close is below EMA9 after crossing from above.

For a PUT reference the three directions are exactly reversed.

For each instrument separately:

1. the crossing candle is the candle at `t` or the immediately preceding
   completed 5-minute candle;
2. at least two of the five completed candles before that instrument's cross
   closed on the source side of EMA9;
3. the required sequence is consecutive and remains within one IST session;
4. equality with EMA9 is neutral and cannot prove a cross;
5. only close versus EMA9 is used. Open, candle colour and body fraction do not
   affect this rule;
6. missing CE/PE timestamps are not replaced by adjacent observations.

The current/previous-candle allowance can leave the alignment true for two
bars. Only the first aligned timestamp receives a star, preventing a duplicate
zone.

## Presentation and speech

- Yellow circle/star marker: `★ CALL potential` or `★ PUT potential`.
- The same reference appears on all three panes because all three instruments
  are part of its evidence.
- The Rules inspector retains the direction, setup timestamp, each leg's cross
  timestamp and its prior-source-side count.
- A newly generated live reference is spoken only when the existing browser
  market/paper voice preference is enabled.
- Voice is limited to the current IST trading day and references no older than
  ten minutes. Spoken IDs are retained locally (bounded to 100) to prevent
  refresh/re-mount repetition. Historical/replay references are never spoken.

## Calculation ownership

- Rule: `SCALPER_V2_THREE_INSTRUMENT_EMA_ALIGNMENT_V1`
- State: `POTENTIAL_ENTRY_REFERENCE`
- Pure calculation: `apps/web/src/lib/scalperV2EmaAlignment.ts`
- Rendering/integration: `TradingAnalyticsScalperV2.tsx` and
  `scalper-v2/ScalperV2Chart.tsx`
- Deterministic tests: `apps/web/tests/scalperV2EmaAlignment.test.ts`

## Preservation

The existing V7 paired-body rule, direction/OI rule, strategy calculations,
independent contract selection, drawings, measurements, exports, API
permissions and paper/live order controls are unchanged. This release adds no
API, database migration, collector or order action.

## Validation and rollback

Run:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

Rollback is a scoped revert of the calculation, tests and two UI integrations,
followed by rebuilding/recreating only `n50-dashboard`. There is no stored-data
rollback.
