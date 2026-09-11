# Stock 360 MWD EMA Value drill-down

Date: 11 September 2026

Branch: `feat/stock-drilldown-mwd-ema-value`

Source specification: user-supplied `/home/novius2/NIFTY50/Test/Indicator pine script-MWD_EMA_Value.docx`

## Delivered scope

The existing shared Stock 360 route `/analytics/stock/:symbol` now uses the
supplied MWD EMA Value methodology as its only technical chart method. The
former Bollinger-band, pivot, volume and RSI technical chart was removed. All
non-chart stock evidence, navigation, strategy evidence and read-only controls
remain present.

The repository-native implementation provides:

- current NSE-session-aligned 15-minute and 60-minute bucket opens;
- current trading-day, week, calendar-month, calendar-quarter and calendar-year
  opens;
- previous completed trading-day close;
- previous day, previous week and previous month opens in the numerical level
  table;
- EMA 9, 21, 50 and 200, warmed from retained canonical one-minute history
  before the displayed session;
- per-bar traded value in INR crore using session cumulative HLC3 VWAP times
  the bar volume, without sharing or stretching the price scale; and
- the supplied comparison rule: latest price greater than a level is `Up`;
  equality or below is `Down`; unavailable input remains `Missing`.

Every level is a keyboard-accessible row. Selecting it emphasises the owning
line without recalculating or changing the data. Previous-period rows remain
table evidence and do not add extra chart lines, matching the source method.

## Data contract

`GET /v1/stocks/:symbol?range=1D` retains its visible `intraday` response and
adds `indicatorWarmup`. The latter contains up to 400 immediately preceding
canonical one-minute bars and is used only to initialise EMA state. It is not
displayed, does not expand the chart X range and does not replace missing
current-session data.

The daily/weekly/monthly/quarter/year anchors come from existing canonical
daily OHLCV. The current daily row is reconstructed from observed current-day
intraday bars. No missing level, price or volume is converted to zero.

## Files

- `neon-stock-terminal/apps/web/src/lib/mwdEmaValue.ts`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsStockPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/AnalyticsPage.module.css`
- `neon-stock-terminal/apps/web/src/lib/types.ts`
- `neon-stock-terminal/apps/web/tests/mwdEmaValue.test.ts`
- `neon-stock-terminal/apps/api/src/routes/stocks.ts`
- `neon-stock-terminal/apps/api/src/routes/stocks.test.ts`
- `tools/playwright/stock-mwd-ema-value.mjs`

## Verification

- Web typecheck: PASS.
- Web unit tests: PASS, 165/165.
- Web production build: PASS.
- API typecheck: PASS.
- API unit tests: PASS, 201/201.
- API production build: PASS.
- Focused calculation tests: PASS, 4/4, including rejection of same-date
  observations outside 09:15-15:30 IST.
- Focused API warm-up contract test: PASS, 1/1.
- Authenticated, live-backed isolated Chromium: PASS, 17/17 at 1440x1000
  and 390x844.
- Live candidate evidence for RELIANCE: 375 displayed one-minute bars and 400
  preceding warm-up bars, both restricted to canonical 09:15-15:30 IST
  observations; all 11 level rows rendered; all 11
  level values resolved; old Bollinger/RSI chart absent; desktop/mobile page
  overflow checks passed.
- Candidate screenshots and result JSON:
  `/tmp/stock-mwd-ema-value/` (not committed).
- Candidate image:
  `sha256:f56c37bb99934b67bea6a6332c71ea3a03c92f4ac35754e54e74f1febc922c48`.

The candidate used the authoritative PostgreSQL connection through the
existing application service. External analytics requests can be blocked by
the isolated browser environment; application exceptions and same-origin
request failures were checked separately and were absent.

## Preservation and release state

Home progression, Strategy Scalper Dashboard and monthly evidence already link
to the same Stock 360 route and therefore receive the same drill-down method.
Scalper V1/V2, Monthly Close/Open, Trade Log, SHAP Research, Paper Trading,
authentication, notifications, collectors, exports and order permissions were
not changed.

This work has been built and browser-tested in an isolated candidate only. It
has not been deployed to production. Production release requires merge to
`master`, a clean pushed commit and the repository's separate release process.
