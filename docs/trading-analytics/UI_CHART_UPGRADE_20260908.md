# MANEESH Trading Analytics UI and chart upgrade

Date: 8 September 2026

Reference: `/home/novius2/NIFTY50/ui upgrade/Trading_Analytics_UI_UX_and_Chart_Upgrade_20260908_v1_2.md`

Route: `/strategy/trading-analytics?view=scalper`

Feature gate: existing `VITE_TRADING_ANALYTICS_ENABLED` / `N50_TRADING_ANALYTICS_ENABLED`

## Audit result

The requested workspace already existed behind the temporary **MANEESH** header shortcut. It already supported the 5-minute default, one-day range, red/green OHLC candles, exact CE/PE selection, browser-only pair locking, synchronized A/B selection, editable quantity 65, close-to-close CE/PE changes, illustrative combined P&L, EMA9, RSI/MACD, a ten-pair ladder, OI history, PCR/max-pain context, retained source tables and complete CSV/JSON evidence.

The v1.2 review correctly identified three material presentation defects in the current source:

1. the shared chart extent reader treated a candlestick array as a generic series and used only its final value instead of both low and high;
2. Scalper forced every selected resistance and the optional 50-point tick interval into the underlying Y-axis, allowing a distant research level to flatten visible candles;
3. the chart used a 9% internal desktop gutter and appeared after multiple controls, explanations and evidence blocks.

## Implemented

- Added a scoped native financial-axis policy. Generic report charts retain their existing normalized extent behavior; the exact-contract terminal lets ECharts fit the active zoomed financial series.
- Corrected candlestick extent extraction to use `[low, high]` from `[open, close, low, high]`.
- Removed distant resistance from default automatic price bounds.
- Added explicit **Fit levels / Fit price** control. Default Auto price shows visible candles; distant levels remain listed with `above view` or `below view` direction.
- Changed the NIFTY 50-point feature from a forced axis interval/min/max to optional dotted round-number guide overlays inside the visible candle range. Option premiums and non-NIFTY underlyings retain their own automatic scale.
- Reduced the internal chart gutter, increased the underlying plot allocation, and retained independent CE/PE Y scales with a shared time cursor.
- Converted the MANEESH Scalper surface to chart-first visual ordering: compact command bar, level strip, pane identities, primary chart/ladder, measurement dock, secondary controls, OI and audit evidence.
- Kept all measurement state browser-only and preserved exact-time/missing-value semantics. No order, strategy, data-source or paper-trading logic changed.
- Added deterministic tests for candle low/high bounds, missing extrema, visible financial bounds, 50-point guide placement and off-screen level classification.

## Preserved contracts

- Route and MANEESH shortcut.
- Underlying, report date, expiry, interval, day/range and strike URL state.
- Default 5-minute interval and one-day view.
- Exact CE/PE identity and no rolling-ATM splice while fixed.
- A/B click and dropdown selection, rectangle, quantity and combined illustrative P&L.
- RSI/MACD calculation methods and evidence table.
- EMA9, raw bars, OI history, ladder, PCR/max-pain context, source timestamps and CSV/JSON exports.
- Green rising/red falling candle body, wick and border semantics.
- Read-only/policy-incomplete state and server-side execution gates.

## Validation

- Web TypeScript: passed.
- Web unit suite: 87/87 passed.
- Production web build: passed.
- Canonical repository preservation gate and authenticated deployed screenshots are recorded at deployment time in `AGENT_HANDOFF.md`.

## Remaining v1.2 phases

This delivery completes the urgent chart repair and chart-first presentation phase. The following v1.2 items require additive read-model/API work and are not represented as completed:

- independently calculated MR/MS, WR/WS and DR/DS lifecycle records (the current API exposes resistance previews only);
- comparable prior-session OI baselines, fixed-cohort composite OI and signed/cumulative interval OI;
- a price-aligned strike/OI profile sharing the underlying price transform;
- effective-dated NSE/NFO phase calendars and explicit expected missing minute buckets;
- complete participant previous-report comparisons where a qualified previous immutable report is unavailable.

Missing inputs remain unavailable rather than zero. Those phases must be implemented behind additive read-model flags and reconciled across chart, table and export before being called complete.
