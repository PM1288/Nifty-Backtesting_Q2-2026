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
- Converted the MANEESH Scalper surface to chart-first visual ordering: compact command/status rows, pane identities, primary chart/ladder, measurement dock, level strip, secondary controls, OI and audit evidence.
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

### Completion validation

Deployed master commits `1f8ee2e`, `49ad60f` and `b4e4257` were tested against
the authenticated public application. The focused Scalper evidence regression
passed **30/30** checks at 1440×900 and 390×900: default 5-minute request,
one-day state, optional grid, new 1-minute request, calendar/coverage response,
OI profile, three resistance/support records, execution-disabled state, no
horizontal overflow, no browser errors and zero axe violations. The real
response contained 12 retained exchange sessions and 879 interval buckets for
NIFTY and the exact CE/PE pair. Evidence (ignored runtime output):
`output/playwright/scalper-evidence-20260908-retest/`.

Deployed validation completed after the implementation: the canonical dashboard container is healthy, the live route and Vite asset passed gateway smoke checks, and the authenticated 1440/mobile Scalper regression passed 22/22 including axe, overflow, data, default-state and no-execution assertions. Screenshots and machine-readable results are under `output/playwright/scalper-5m-20260907/`.

## Completed v1.2 read-model phase

The remaining chart/read-model work is now implemented as additive, read-only
evidence. No strategy rule, execution permission, collector ownership or source
precedence changed.

- **Six structural levels:** independent MR/MS, WR/WS and DR/DS records now
  include origin, strict completed-close invalidation, alternatives and explicit
  retained-source coverage. Resistance uses unbroken bearish opens; support uses
  the lowest unbroken close from every candle colour. Daily defaults to 20
  completed bars and weekly/monthly to 12; daily/weekly remain configurable.
- **Calendar-qualified periods:** weekly/monthly bars reconcile expected trading
  sessions, final scheduled session close and a consistent price basis. A
  missing session, mixed source basis or forming period stays unconfirmed.
- **OI baseline family:** exact contracts now expose previous-session-final OI
  when available, otherwise the actual first eligible session observation; the
  API preserves baseline time/kind and never converts a missing baseline to
  zero. The OI chart has composite retained/addition/reduction/current-only,
  qualified baseline change, current-only, prior-snapshot and provider fields.
- **Fixed display cohort:** the selected retained CE and PE contracts have
  separately aggregated current/baseline/layer values. The response labels this
  as a display cohort rather than implying trader ownership or a full chain.
- **Time-aligned OI:** 1/5/15/60 minute OI endpoints are selected at or before
  each calendar-anchored interval end. Interval and cumulative change modes
  leave unavailable endpoints as gaps; a prior-session quote cannot leak into a
  new session's first interval.
- **Price-aligned profile:** the Scalper dock renders CE/PE current OI or signed
  change on a numeric strike Y-axis bounded by the underlying visible price
  range. It is explicitly provider-native and only appears for observed levels.
- **Participant comparison:** each current participant row retains its current
  values and adds a qualified previous-report identity and changes when one is
  present; no prior value is synthesized.
- **Axis controls:** each underlying/CE/PE pane retains independent native
  financial scaling, `Fit levels`, optional NIFTY round guides, data-zoom
  filtering and a compact manual min/max lock/reset control.
- **OI in the candle workspace:** the Scalper lower pane now defaults to paired
  CE/PE interval ΔOI directly beneath the underlying candles. The same selector
  switches to current OI, cumulative ΔOI, RSI or MACD; the complete OI evidence
  chart below remains available for detailed inspection/export.
- **Call / put context at the top:** Scalper now shows the selected exact CE and
  PE LTP, current provider-native OI, latest interval ΔOI, OI PCR and the
  retained endpoint timestamp in one compact strip above the candle workspace.
  Missing observations remain `—`; no zero or cross-contract substitute is used.
- **OI & PCR order:** the SmartAPI OI & Quotes and Option Snapshots views now
  render their strike chart before the exact-contract table. The chart labels
  the canonical window OI PCR while the table remains immediately below it.

Validation for this addition: web typecheck and 87 unit tests passed; production
build passed. Authenticated Playwright passed 42/42 checks at 1440×900 and
390×900, including the top CE/PE strip, the lower candle OI pane, detailed OI
chart, OI & PCR chart/table order, axe, JavaScript-error and overflow checks.

**Measurement semantics:** the browser-only paired CE+PE measurement now uses
the selected A candle's actual `open` as entry and the selected B candle's
actual `close` as exit for the underlying and both exact option legs. Chart
markers and the value table explicitly say `A · open` / `B · close`. It still
requires completed, timestamp-matched source bars and never substitutes an
adjacent candle. Authenticated production measurement regression passed 22/22,
including the exact source open-to-close P&L calculation, desktop/mobile axe,
overflow, reload and error checks.

## Deliberate limitations

- The retained `trading_calendar` supplies session boundaries, but does not yet
  expose per-security/per-segment phase provenance. The API labels that
  limitation instead of inventing it.
- OI remains provider-native because contract/lot-unit normalization has not
  been independently certified. Window max pain remains indicative only.
- Retained source bars and quotes can be revised upstream; historical original
  publication revisions are not available.
- Index turnover/delivery is not applicable. Stock phase-matched delivery needs
  a separate retained provider before it can be displayed.

Missing inputs remain unavailable rather than zero. The feature is still
research-only and policy-incomplete; it does not submit paper or live orders.
