# Scalper V2 shared cursor repair — 20 September 2026

## Outcome

The Scalper V2 time cursor is source-owned and follows across:

- NIFTY underlying;
- independently selected CE;
- independently selected PE;
- cumulative PE OI minus CE OI history;
- cumulative PE change OI minus CE change OI history.

The source chart publishes canonical candle-open UTC seconds. Each receiving price chart resolves that time against its own exact candle and uses its own close for the horizontal value label. OI history charts convert their millisecond time coordinate to the nearest observed underlying candle time before publishing. Strike charts remain strike-linked and do not falsely interpret time as strike.

## Defect repaired

The native source chart correctly emitted a physical pointer event, but the React echo of that event incremented the same suppression counter used for programmatic receiver updates. During continuous pointer motion this could suppress the source chart's next frame, making the shared cursor appear sticky or delayed.

The synchronization decision is now explicit:

- `ORIGIN_OWNS`: do not write or suppress the physical source chart;
- `RECEIVE`: update the receiving chart programmatically under feedback suppression;
- `CLEAR`: clear all transient guides together on pointer leave;
- `HOLD`: preserve an explicitly locked time.

Native panes additionally share one V2-local cursor coordinator. It fans the
latest physical timestamp directly from canvas to canvas in the same pointer
frame, before React renders the inspector. React remains responsible for the
small textual inspection state, but is no longer on the visual cursor path.
OI-history hover publishes through the same coordinator after its timestamp is
mapped to an observed underlying candle.

This does not copy a NIFTY price onto an option axis. CE and PE continue to display their own exact values. Missing exact candles remain missing.

## Files

- `apps/web/src/lib/scalperV2Cursor.ts`
- `apps/web/src/pages/scalper-v2/ScalperV2Chart.tsx`
- `apps/web/tests/scalperV2Cursor.test.ts`

## Validation

The production browser acceptance moves the physical pointer from each of NIFTY, CE and PE, then across the OI history chart. At every origin all three native hosts must expose the same canonical time and all three numerical readouts must be in `At cursor` mode. It also rapidly traverses the source chart to ensure the origin advances rather than sticking on a previous React echo.

No strategy, OI arithmetic, chart data, contract selection, drawing, measurement, order permission or collector is changed.
