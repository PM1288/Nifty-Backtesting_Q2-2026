# Home and Scalper V2 stable hydration repair — 23 September 2026

## Outcome

Home and Scalper V2 no longer appear to load, vanish and then return while
their slower datasets hydrate. A deployment discovered by an already open tab
also no longer reloads that tab automatically. The tab keeps running and offers
an explicit **Apply update** action.

## Causes found

1. The build-version guard automatically reloaded every route except Scalper
   V2 when `app-version.json` changed. That could replace Home during normal use
   immediately after a dashboard deployment.
2. Home initially rendered a small generic state and later inserted the full
   dashboard. Its separately loaded 3Month selector changed from a one-line
   message to two ten-row tables, moving the rest of the document by about
   300–370 CSS pixels.
3. Scalper V2 rendered a small status area while the expensive exact chart
   payload was pending. The hydrated workstation then replaced it with the
   complete fixed-height chart canvas.

No API error, React exception or failed market-data request was required to
produce the symptom.

## Changes

- `appVersion.ts`: every route now preserves the active DOM and user state when
  a new build is detected. Reload occurs only after **Apply update**.
- `TodaySummaryPage.tsx` / `Today.module.css`: the Home root mounts immediately
  and reserves a viewport-sized loading canvas. React retains the same root
  when overview data arrives.
- `ThreeMonthSelectorBoard.module.css`: loading, error and hydrated states own
  the same deterministic table envelope at desktop and stacked widths.
- `FuturesVolatilityPreview.module.css`: the async preview keeps a bounded
  stable height.
- `TradingAnalyticsPage.tsx` and Scalper V2 CSS: both market-context loading and
  exact-chart loading reserve the same remaining workstation viewport as the
  hydrated terminal, including its internal scroll owner.
- `tools/playwright/home-scalper-stable-hydration.mjs`: authenticated regression
  deliberately delays Home, 3Month, Scalper context and chart responses and
  verifies geometry, root retention, navigation count and runtime errors.

## Local evidence

The delayed-response browser regression passed 11/11:

- Home initial canvas: `1416 × 824` CSS px.
- Home root remained the same connected DOM node.
- Home main-frame navigation count did not change after the root mounted.
- 3Month envelope stayed `1416 × 369` CSS px before/after hydration.
- Scalper context, chart-loading and hydrated states retained the available
  workstation viewport without a document navigation.
- No page errors occurred.

Evidence is stored locally under
`output/playwright/home-scalper-stable-hydration/` and intentionally excluded
from Git.

## Preservation

This is presentation/lifecycle work only. It does not change Home calculations,
MWHD/3Month/Futures strategy logic, API contracts, data polling intervals,
Scalper contracts, chart data, indicators, drawings, cursor behavior, exports,
alerts, paper/live orders or authentication.

## Commands

```bash
cd /home/novius2/trading-stack
npm --prefix neon-stock-terminal/apps/web run typecheck
npm --prefix neon-stock-terminal/apps/web test
npm --prefix neon-stock-terminal/apps/web run build
npm --prefix neon-stock-terminal/apps/api run typecheck
npm --prefix neon-stock-terminal/apps/api test
npm --prefix neon-stock-terminal/apps/api run build
node tools/playwright/home-scalper-stable-hydration.mjs
bash scripts/verify/canonical-repository-gate.sh
```

## Rollback

The change is frontend-only and has no schema or data rollback. Restore the
previous dashboard image and recreate only `n50-dashboard`.
