# Scalper V2 geometry and linked-inspection repair

Date: 10 September 2026

## Scope

This is an in-place repair of
`/strategy/trading-analytics?view=scalper_v2`. The existing Scalper V1 remains
separately available at `view=scalper`. No API, database, collector, signal
formula, order, notification or permission contract changed.

## Root cause confirmed in the browser

The narrow painted chart was a layout defect, not a data-range defect. Broad
Trading Analytics evidence-table cell rules reached Lightweight Charts'
internal table, while V2's host had no equivalent isolation boundary. The V2
card also combined 250px grid tracks with 500px/224px inline canvases and a
42px header, so the chart body and native time axis were cropped. The inspector
had six functional children after the repair controls were added but its old
four-track allocation placed the tab strip/body in the wrong expanding row.
Finally, the OI overlay used a chart-local coordinate after already applying a
42px container offset, then added the same header offset again.

The repaired cards use a measured `header + body` grid. A single explicit
ResizeObserver owns native chart sizing; ordinary resize does not call
`fitContent`. V2 has a narrowly scoped native-table boundary, and the OI overlay
uses one body-local origin.

## Implemented behaviour

- Full observed session is the default and explicit `Fit day` reset for
  1m/5m/15m/1h. The time scale permits dense 1m fitting without dropping or
  resampling bars.
- NIFTY, exact CE and exact PE use independent OHLC-only session envelopes with
  equal five-percent display padding and a two-tick flat-session fallback.
  EMA, OI, markers and out-of-session rank levels cannot widen those bounds.
- Three charts are created once, resized from their measured bodies and linked
  by canonical timestamps. Programmatic receiver updates are suppressed from
  becoming new origin events. Each receiver resolves its own price.
- Inspector modes are Latest, At cursor and Locked. Pane headers and the
  numerical inspector resolve exact O/H/L/C/EMA9 rows at the shared timestamp;
  missing exact rows stay unavailable. Escape releases inspection lock without
  clearing A/B anchors.
- The rail uses content-sized identity, premium, leader, mode and tab tracks,
  with one independently scrolling body. Exact CE/PE premiums remain 28px on
  desktop.
- Current OI profile widths share one bounded lane, preserve proportional
  magnitude, omit nulls and render observed zero with zero width. Strike Y is
  derived once from the underlying series' current `priceToCoordinate`.
- Chain/strike hover publishes a separate strike context. It highlights the
  underlying only when the strike is within the observed session and never
  puts a strike on a CE/PE premium axis or changes the selected contract.
  ECharts uses lightweight highlight/tooltip actions through backward-compatible
  optional props rather than rebuilding options for pointer movement.
- All-null delta OI is an explicit `Baseline unavailable` state with coverage,
  not an empty plot or zeros. A single PCR observation is a dated snapshot
  value, not a fabricated time series. Missing CE or PE PCR cohort data returns
  unavailable.
- Indicator calculation uses retained canonical bars before the selected day is
  sliced. V7 results are consumed unchanged and counted by state. Existing A
  open to B close arithmetic remains owned by `scalperMeasurement.ts`; render
  lines do not recalculate it.

## Field and control preservation map

| Source/control | Main destination | Evidence/export |
|---|---|---|
| Underlying, session, interval, strike, expiry | V2 command bar and fixed rail identity | Complete V2 JSON |
| Exact underlying/CE/PE bars and EMA9 | Three native charts and Snapshot section | Existing chart payload in complete JSON |
| Latest and selected-time O/H/L/C/EMA9 | Pane readouts and numerical Snapshot sections | Raw chart rows in complete JSON |
| Current OI and CE1/CE2/PE1/PE2 | Fixed leader strip, chain and underlying profile | Chain CSV and complete JSON |
| Delta OI plus baseline missingness | Dedicated analytic state/chart and Levels evidence | Raw nested `oi_layers` in JSON/chain CSV |
| Pair/window PCR scope | Dated PCR snapshot and analytics header | Source cohort in JSON |
| Max-pain common-unit payout | Payout analytic with explicit hypothetical scope | Points, candidates and source cohort in JSON |
| V7 event states | Rules section and render-only chart markers | Canonical chart/source rows in JSON |
| A/B anchors, quantity and results | Measure section and exact chart price lines | Measurement object in complete JSON |
| Source errors, limitations, as-of and ranking scope | Status and Health section | Complete JSON and chain CSV |
| V1, Trade Log, matrix, OI/PCR, History and SHAP | Existing Trading Analytics navigation unchanged | Their existing exports unchanged |

Actual positions are not inferred from OI, selections or V7 events. The Health
section explicitly states that this view has no connected position source.

## Deterministic verification

- Web unit tests include independent range padding, strict raw-bound level
  eligibility, flat-session padding, profile 1:2:0/null width semantics,
  delta-OI coverage states and incomplete PCR cohorts.
- Browser regression:
  `node tools/playwright/scalper-v2-repair-regression.mjs`.
  It records host/native/table geometry, plot heights, rail tracks, linked
  local-value readouts, hover clear, locked inspection, strike hover, 500
  pointer moves, V2-attributable network activity, cached timeframe switching,
  responsive widths and V1 preservation.
- Browser screenshots and runtime JSON are ignored artefacts and must remain
  outside Git.

Final results:

- Web typecheck/build and 129/129 tests: PASS.
- API typecheck/build and 193/193 tests: PASS; API source was unchanged.
- Canonical repository preservation gate: PASS.
- Authenticated local-Vite/live-API repair suite: PASS, 29/29.
- Authenticated deployed repair suite: PASS, 29/29 at 1920x1080, 1440x900,
  1366x768, 1024x768 and 390x844.
- Deployed geometry at 1920x1080: underlying host/native width
  812.23/812.23px and plot body 601.22px; CE/PE host/native width
  637.77/637.77px and plot body 267.22px; native time axes 28px.
- Deployed interaction profile: 500 pointer moves, 17.5ms p95 in headless
  Chromium at DPR1; no V2 chart/context request during the pointer loop; cached
  5m-to-1m route redraw 153ms. These are measurements on this test host, not a
  universal performance guarantee.

Ignored evidence: `/tmp/scalper-v2-repair-local-final/` and
`/tmp/scalper-v2-repair-deployed-final/`.

## Release

- Canonical release commit: `ed10c9cd5459b9314ec0e187298fa36ed1b85afa`.
- Dashboard image:
  `sha256:e46f6f84efed44c406182741395ce0d5df25588d5750850bb24b99653f55eca9`.
- Only the canonical `trading-stack-novius2` `n50-dashboard` was recreated. It
  is healthy with zero restarts and the public `/n50/` route returns HTTP 200.
- Rollback image: `trading-stack-n50-dashboard:pre-scalper-v2-repair-20260910`.
- An accidental duplicate Compose-project dashboard created during the release
  command was detected immediately and removed before canonical cutover. No
  unrelated service or volume was removed.

## Source limitations retained visibly

- Ranked chain inputs can be an observed retained cohort or a nearest paired
  window; the UI does not call the fallback a full-expiry chain.
- A historical OI/IV/PCR context is unavailable unless the source supplied an
  eligible timestamped observation. Latest data is not relabelled historical.
- Provider-native OI and payout units remain non-INR unless lot/value
  normalisation is verified.
- A one-snapshot PCR and current-only max-pain result remain snapshots, not
  histories or forecasts.

## Rollback

This is frontend-only. Recreate only `n50-dashboard` from the pre-repair image,
or revert the release commit and rebuild from canonical `master`. No database
rollback is required.
