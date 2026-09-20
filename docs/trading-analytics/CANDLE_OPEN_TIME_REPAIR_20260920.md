# Candle opening-time chart repair — 2026-09-20

## Outcome

Trading Analytics interval candles are positioned and labelled by their opening timestamp. The first NSE session candle therefore appears at `09:15` for 1-minute, 5-minute and 15-minute views. The source `end` timestamp remains unchanged and continues to control candle completion, signal rules, freshness and A-open/B-close measurement evidence.

## Cause

The API already returned both `start` and `end`. Scalper V2 and the synchronized timeframe matrix used `end` as the Lightweight Charts X coordinate, causing the first 1-minute candle to display as `09:16` and the first 5-minute candle as `09:20`.

## Changes

- Added one shared `intervalBarChartTime` adapter that prefers a valid `start` and retains an `end` fallback for older payloads.
- Moved Scalper V2 candle, EMA and underlying-volume coordinates to candle start time.
- Kept OI snapshot timestamps at their real capture times.
- Updated linked cursor/readout lookup to use candle start time.
- Translated canonical end-time signal, measurement and saved-drawing anchors at the renderer boundary so strategy and persisted evidence semantics do not change.
- Updated the 1m/5m/15m matrix and exact-boundary cursor selection to use opening-time intervals.
- Added development/test geometry attributes for the first plotted start and source end timestamp.

## Verification

```text
web typecheck: PASS
web tests: PASS (225/225)
web production build: PASS
api typecheck: PASS
api tests: PASS (253/253)
api build: PASS
canonical repository gate: PASS
```

## Production evidence

- Release commit: `1480c7d`
- Deployed entry asset: `/n50/assets/index-BCmA04qI.js`
- Dashboard container: healthy
- Authenticated browser, 1m: first plotted label `09:15`, canonical end `09:16`, one initial `setData`
- Authenticated browser, 5m: first plotted label `09:15`, canonical end `09:20`, one initial `setData`
- Evidence: `/home/novius2/NIFTY50/evidence/candle-open-time-20260920/browser-results.json`
- Screenshots: `/home/novius2/NIFTY50/evidence/candle-open-time-20260920/scalper-v2-1m.png` and `scalper-v2-5m.png`

## Rollback

Revert the release commit. No API schema, database, collection, order, alert or strategy formula changed.
