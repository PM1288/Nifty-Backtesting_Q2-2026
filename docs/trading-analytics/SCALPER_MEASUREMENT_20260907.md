# Browser-only scalper measurement

Route: MANEESH → `/strategy/trading-analytics?view=scalper`.

1. Select underlying, expiry and paired strike. Default interval remains 5m.
2. Click **Fix pair for measurement**. Its strike/expiry stay fixed independently
   of ATM updates. Existing URL pin controls remain available outside visual lock.
3. Quantity defaults to **65 units**, editable positive integer. This is the
   requested visual default, not a claim about the current exchange lot size.
4. **Select A → B on chart**, then click two points in any price pane. Selection
   snaps to candle-end timestamps and uses each instrument's completed close.
   Accessible start/end time dropdowns offer the same function.
5. Linked pink rectangles and A/B markers appear on underlying/CE/PE. Each pane
   uses its own endpoint prices; no mixed strike/expiry series. Wheel zoom and
   pan resume after selection. Clear/reselect or unlock at any time.

Exact same timestamps only; missing or partial bars produce unavailable values,
not interpolation, nearest quotes or zero. Reverse selections are chronologically
ordered. Δ = end close − start close. The displayed hypothetical **long both
legs** P&L is `(ΔCE + ΔPE) × units`, before costs/slippage. Underlying points are
reported separately and are not added to option P&L. This is price delta, not
Greek Delta, a fill, an order, a saved position or booked performance.

All visual lock/endpoints/quantity exist in component memory only: no database,
local/session storage, URL, webhook, movie or file writes. Reload/leaving the
Scalper resets them; changing interval/day/range resets endpoints. Existing
user-invoked source CSV export is unchanged and excludes the measurement.

## Indicators and preservation

RSI14 and MACD12/26/signal9 appear below the underlying price, with their own
scales and a shared time cursor/zoom. The indicator toggle restores price-only
geometry. Values are also available in a semantic source table.

Frontend display-only port of existing `papertrade/whatsapp.py` `_rsi`, `_ema`,
`_macd` and `internal/rsiwillr/indicators.go`: RSI is rolling-average gains/losses,
**not Wilder smoothing**, matching platform convention (flat/no loss yields100).
EMA uses SMA seed. RSI needs15 closes; MACD26; signal/histogram34. All retained
history warms the selected-day view; a partial/null candle resets warm-up.
These indicator outputs do not alter server EMA9 or strategy qualification.

No API, collector, broker, database or paper lifecycle changes. Existing chart,
resistance, OI, exact-source evidence and exports remain. Shared EChartSurface
adds an opt-in coordinate-click callback and MarkArea registration; all other
consumers retain their existing default behavior.

Reference: [ECharts events](https://echarts.apache.org/handbook/en/concepts/event/)
and [MACD definition](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd).
The repository's existing initialization/RSI conventions remain authoritative.

## Validation

`npm run typecheck && npm test && npm run build` in web/API; repository gate.
Unit fixtures cover synchronized/reversed selection, missing and partial bars,
zero, quantity validity/scaling, indicator seeds, partial reset and no lookahead.
Authenticated `tools/playwright/scalper-measurement.mjs` uses existing real NIFTY
source bars; tests exact numerical P&L, chart clicks, visual lock, reload reset,
responsive screenshots, keyboard time controls and axe. Protected login only;
no test orders. Output: `output/playwright/scalper-measurement/`.

Release evidence appended after actual validation. Existing missing option data
and incomplete executable-strategy policies still apply; this tool does not
remove those gates or certify all instruments.

## Deployed acceptance

Application commit `9bd6683` (pushed master), image
`sha256:4a898de5eaa7e20eee767164dce9aa0c80674877b76fe6b1cfc0620670324fc1`.
Dashboard only recreated, healthy with zero observed restarts. Previous image
retained as `trading-stack-n50-dashboard:before-scalper-measurement-20260907`.
Rollback: revert the scoped frontend commits on master, rerun gates and rebuild
dashboard; no database rollback or migration needed.

- Web83/83 and API180/180; typechecks/builds pass, repository/whitespace gates pass.
- Measurement22/22 final authenticated production checks. Numeric reconciliation
  uses real API closes at the exact same timestamps. Both UI chart clicks and
  accessible dropdown selection tested; quantity65→130 doubles P&L; zero quantity
  renders unavailable. Reload resets lock/endpoints/quantity. No measurement URL
  writes. All three valid source deltas and rectangles captured.
- Desktop1440 and mobile390 axe: zero violations. No page horizontal overflow.
- Existing Trading Analytics F&O regression53/53 on final deployed image.
- Paper notifier final isolated production run17/17: endpoint, automatic popup,
  concise speech/mute and mobile launcher. Two earlier concurrent runs timed out
  waiting for the existing mobile Analytics launcher; isolated rerun passed.
  Added failure screenshot capture for future diagnosis. No notifier runtime
  changes; these timing failures are not a long-duration reliability certification.
- Initial measurement runs exposed a scroll-focus issue on indicator evidence
  and the disabled strike ladder, plus fading/default undefined tooltips. Fixed
  and rerun, not suppressed. Both tabular scroll areas and ladder remain focusable.

Example captured NIFTY paired23800 comparison, 7September source timestamps
05:15Z→10:10Z: underlying23799.30→23779.15 (−20.15points), CE92.85→57.40
(−35.45), PE57.10→70.30 (+13.20). Combined−22.25 ×65 = **−₹1,446.25**,
illustrative gross long-pair change only. Candle/source times are retained as
provided; this tool does not certify collection latency or exchange-session coverage.

Open source limitations: partial/missing endpoints legitimately produce — and
cannot draw that pane's rectangle. RSI/MACD warm-up may be unavailable after
partial candles (signal needs34 consecutive valid closes under this policy).
No nearest-price substitution. Switch off resistance overlays for a closer price
scale if their existing higher levels compress the underlying rectangle.

Evidence root `/home/novius2/trading-stack/output/playwright/scalper-measurement/`:
`results.json`, `measurement-desktop.png`, `measurement-1440.png`,
`measurement-390.png`, `axe-1440.json`, `axe-390.json`.
