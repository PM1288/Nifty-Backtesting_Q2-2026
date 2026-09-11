# Home scalper progression — implementation report

Date: 11 September 2026

Branch: `feat/home-scalper-progression`

Route: `/n50/` (`Today` → `Market Story` and `Sector Matrix`)

## Outcome

The Nifty 50 Trader home page now has a fixed-height, horizontally scrollable
`Scalper progression · Monthly Open` row immediately below `Risk & Anomaly`.
Every stock already present in the current home-page F&O universe remains in
the row. Cards are ordered by the deepest completed progression first and then
by symbol. Selecting a card opens the existing stock Quick View.

Each stock has two deliberately separate alternative routes:

1. `M−1`: current-month open > previous-month close.
2. `M−2`: current-month open > two-months-ago close.

Each route then applies the same additive AND gates in this order:

1. latest retained/live value > current-week open (`W0`);
2. latest retained/live value > previous-week open (`W−1`);
3. latest retained/live value > today's open (`D0`, green-day confirmation).

The displayed `0/4` through `4/4` value is the deepest contiguous passed stage,
not a count of unrelated true conditions. A failed or unavailable earlier gate
stops progression depth while later raw comparisons remain individually
visible. `✓`, `×`, and `—` distinguish pass, fail, and unavailable; missing is
never converted to zero.

## Data contract

The additive read-only endpoint is:

`GET /v1/overview/scalper-progression`

It returns the current NSE stock F&O universe with the exact values required by
the UI: latest value, today's open, current/previous-week opens,
current-month open, previous-month close, two-months-ago close, and source
observation time.

Daily source precedence is unchanged and explicit in the adapter:

1. `strategy_eval.stock_daily_regime`;
2. `nse.fact_eod_prices`;
3. `bars_1d`.

Today's valid `instrument_state` observation overrides the same daily endpoint.
The endpoint is cached privately for 60 seconds. It does not create a collector,
strategy signal, order, paper position, or database table.

## Files changed

- `neon-stock-terminal/apps/api/src/routes/overview.ts`
- `neon-stock-terminal/apps/api/src/routes/overview.test.ts`
- `neon-stock-terminal/apps/web/src/lib/types.ts`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/lib/hooks.ts`
- `neon-stock-terminal/apps/web/src/features/today/useTodayData.ts`
- `neon-stock-terminal/apps/web/src/features/today/todayModel.ts`
- `neon-stock-terminal/apps/web/src/features/today/TodaySummaryPage.tsx`
- `neon-stock-terminal/apps/web/src/features/today/Today.module.css`
- `neon-stock-terminal/apps/web/tests/todayRevamp.test.ts`
- `tools/playwright/today-scalper-progression.mjs`

## Validation evidence

- Real database query: 210/210 current F&O stock rows had all seven requested
  numerical endpoints on the captured 11 September session. The optimized
  direct endpoint completed in about 2.7 seconds on the local test stack; this
  is a machine-specific observation, not a latency SLA.
- Web typecheck: PASS.
- Web tests: PASS, 153/153.
- Web production build: PASS.
- API typecheck: PASS.
- API tests: PASS, 198/198, including the new endpoint mapping regression.
- API production build: PASS.
- Authenticated Chromium candidate: PASS, 11/11 checks at 1440x1000 and
  390x844. The stock strip overflowed only inside its own horizontal scroller;
  the mobile page had no accidental horizontal overflow.
- Browser evidence: `/tmp/today-scalper-progression/` (not committed).
- Canonical preservation gate: PASS.

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
