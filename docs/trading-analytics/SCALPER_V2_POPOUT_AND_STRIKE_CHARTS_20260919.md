# Scalper V2 pop-out and strike-chart repair — 2026-09-19

## Scope

This is a scoped repair of the existing read-only `scalper_v2` workstation. It
does not add a third terminal, change strategy rules, alter exact-contract
selection, or enable order actions.

## Delivered behaviour

- `Pop out` opens the same authenticated Scalper V2 context in a separate
  same-origin window. The global application chrome is removed in that window,
  while Symbol, expiry, timeframe, exact CE and exact PE filters, scale, OI,
  drawing, measurement and export controls remain available.
- The active exact-chart query refreshes every 30 seconds and option-price
  history every 60 seconds while visible. Historical `asOf` contexts do not
  poll, and background tabs do not poll.
- NIFTY, selected CE and selected PE current values are visible in the compact
  command header.
- The former numerical right rail is now a bounded detail section below the
  price workspace. The 30-session reference gauge also follows the workspace.
- The right column contains two vertically stacked strike panels. Both use
  strike on X and vertical numerical axes:
  - OI bars for CE and PE with an independently scaled `PE OI − CE OI` line.
  - signed change-in-OI bars for CE and PE with an independently scaled
    `PE ΔOI − CE ΔOI` line.
- A missing CE or PE input keeps the corresponding difference missing. It is
  never converted to zero.
- Crosshair publication is coalesced to one animation frame and all three
  native chart hosts record one canonical selected timestamp. Receiver prices
  still require an exact candle; no adjacent option candle is substituted.

## Files

- `apps/web/src/pages/TradingAnalyticsScalperV2.tsx`
- `apps/web/src/pages/scalper-v2/ScalperV2Chart.tsx`
- `apps/web/src/pages/scalper-v2/ScalperV2.module.css`
- `apps/web/src/lib/scalperV2Analytics.ts`
- `apps/web/src/pages/TradingAnalyticsPage.tsx`
- `apps/web/src/components/chrome/AppShell.tsx`
- `apps/web/src/components/chrome/AppShell.module.css`
- `apps/web/tests/scalperV2Analytics.test.ts`
- `tools/playwright/scalper-v2-popout-structure.mjs`

## Verification

Focused numerical tests prove vertical category geometry, the secondary axis,
signed ΔOI preservation, exact `put minus call` arithmetic and null
preservation. The authenticated browser check verifies the two right-side
charts, below-workspace detail position, top values, shared timestamp across all
three native chart hosts, minimal pop-out shell and retained filters.

Local authenticated evidence is intentionally outside Git:

`/tmp/scalper-v2-popout-structure-20260919/`

The release record in `AGENT_HANDOFF.md` contains the final full-suite,
deployment and production-browser outcome. No screenshot, credential or market
data is committed.

## Production release

- Application commit: `f4552e6`
- Public route:
  `https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=scalper_v2`
- Dashboard container: `ba738e4be179...` (`healthy`)
- Entry asset: `/n50/assets/index-Bc-XlEAl.js`
- Production browser acceptance: 10/10 passed
- Evidence directory (not committed):
  `/tmp/scalper-v2-popout-structure-production-20260919/`
- Deployment scope: `n50-dashboard` only; no API, collector, database,
  strategy, order or notification service was recreated.
