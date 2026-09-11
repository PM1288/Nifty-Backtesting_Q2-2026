# Home scalper progression — implementation report

Date: 11 September 2026

Branch: `feat/home-scalper-intraday-progression`

Route: `/n50/` (`Today` → `Market Story` and `Sector Matrix`)

## Outcome

The Nifty 50 Trader home page now has a compact, fixed-height, vertically
scrollable `Scalper progression · Monthly Open` table immediately **above**
`Risk & Anomaly`. Every stock already present in the current home-page F&O
universe remains available. Each stock occupies two rows, one for each monthly
route. Stocks are ordered with any fully green route first, then by deepest
contiguous progression, total passed checks and symbol.

Conditions are stacked inside each strategy row so the table remains contained
to the widget width at desktop and mobile sizes without horizontal scrolling.

Each stock has two deliberately separate alternative routes:

1. `M−1`: current-month open > previous-month close.
2. `M−2`: current-month open > two-months-ago close.

Each route then applies the same additive AND gates in this order:

1. latest retained/live value > current-week open (`W0`);
2. latest retained/live value > previous-week open (`W−1`);
3. latest retained/live value > today's open (`D0`, green-day confirmation);
4. current clock-hour open > previous clock-hour open (`1H`);
5. current 15-minute bucket open > previous 15-minute bucket open (`15m`);
6. current 5-minute bucket open > previous 5-minute bucket open (`5m`).

The displayed `0/7` through `7/7` value is the deepest contiguous passed stage,
not a count of unrelated true conditions. A failed or unavailable earlier gate
stops progression depth while later raw comparisons remain individually
visible. `✓`, `×`, and `—` distinguish pass, fail, and unavailable; missing is
never converted to zero. Every cell also shows both exact operands. Fully green
routes and their stock identity are highlighted green; any failed check is red.

## Data contract

The additive read-only endpoint is:

`GET /v1/overview/scalper-progression`

It returns the current NSE stock F&O universe with the exact values required by
the UI: latest value, today's open, current/previous-week opens,
current-month open, previous-month close, two-months-ago close, and source
observation time. It also returns current/prior 1-hour, 15-minute and 5-minute
bucket opens with their exact bucket timestamps.

Daily source precedence is unchanged and explicit in the adapter:

1. `strategy_eval.stock_daily_regime`;
2. `nse.fact_eod_prices`;
3. `bars_1d`.

Today's valid `instrument_state` observation overrides the same daily endpoint.
Intraday opens come from canonical NSE `bars_1m`, bucketed in IST. A comparison
is returned only when the current and previous observed bucket starts are
exactly adjacent at the requested cadence; gaps remain unavailable instead of
being compared across an unknown interval. Indexed UTC day bounds keep the
intraday query on the existing timestamp index.
The endpoint is cached privately for 60 seconds. It does not create a collector,
strategy signal, order, paper position, or database table.

## Files changed

- `neon-stock-terminal/apps/api/src/routes/overview.ts`
- `neon-stock-terminal/apps/api/src/routes/overview.test.ts`
- `neon-stock-terminal/apps/web/src/lib/types.ts`
- `neon-stock-terminal/apps/web/src/features/today/todayModel.ts`
- `neon-stock-terminal/apps/web/src/features/today/TodaySummaryPage.tsx`
- `neon-stock-terminal/apps/web/src/features/today/Today.module.css`
- `neon-stock-terminal/apps/web/tests/todayRevamp.test.ts`
- `tools/playwright/today-scalper-progression.mjs`

## Validation evidence

- Real database query: 210/210 current F&O stock rows had a comparable current
  and previous bucket for 1-hour, 15-minute and 5-minute gates on the captured
  11 September session. The optimized direct query completed in about 2.9
  seconds on the local test stack; this
  is a machine-specific observation, not a latency SLA.
- Web typecheck: PASS.
- Web tests: PASS, 162/162.
- Web production build: PASS.
- API typecheck: PASS.
- API tests: PASS, 200/200, including endpoint/export mapping regressions.
- API production build: PASS.
- Authenticated Chromium candidate: PASS, 12/12 checks at 1440x1000 and
  390x844. Desktop displays the complete seven-gate table; mobile scrolls only
  inside the widget and has no accidental page-wide horizontal overflow.
- Browser evidence: `/tmp/today-scalper-intraday-progression/` (not committed).
- Canonical preservation gate: PASS after the implementation and report update.

## Preserved boundaries and limitations

Existing sector, risk/anomaly, stock Quick View, Today lenses, navigation,
authentication, paper/live permissions, monthly strategies, Scalper V1/V2,
Trade Log, SHAP and exports were not removed or redefined.

The card price uses the already merged home-page live value when available;
period references come from the endpoint. The endpoint exposes observation time
but does not claim simultaneous exchange publication for all sources. A missing
period reference remains unavailable. This is a progression display, not a new
entry strategy or profitability assertion.

No production deployment was performed by this change.
