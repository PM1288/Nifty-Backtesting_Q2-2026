# Compact Today outlook header — 20 September 2026

## Outcome

The global N50 command header now places the canonical Morning View outlook
next to the permanent NIFTY quote. It shows Equity, Index Futures and Index
Options Buy/Sell/Neutral state, each exact net value in ₹ crore, and the final
result produced by the existing original six-row market matrix.

The header does not recompute or reinterpret the matrix. It consumes
`GET /v1/trading-analytics/morning-summary`, which remains the single owner of
the six combinations. Missing cash or derivatives observations stay
unavailable and therefore cannot become a manufactured zero or outlook.

The derivatives figures cover all index derivatives in the FII report, not
NIFTY alone. Index-options reported value is not described as premium cash
flow. Those scope notes, the report date, and exact values remain in the
outlook tooltip/accessibility label.

## Space recovery

- Product mark shortened from `NIFTY 50 TRADER` to `N50`.
- Removed the redundant non-admin `PAPER` badge and market-open/closed sentence.
- Feed readiness remains live but is an accessible icon rather than visible
  `READY`/`CAUTION` text.
- Paper voice alerts retain the same persisted toggle, speech cancellation and
  notifications; only the visible `Speak`/`Muted` word was removed.
- Admin routes retain their explicit `ADMIN` environment badge.

No paper/live permissions, strategy logic, report ingestion, notifications or
order paths changed.

## Files

- `apps/api/src/routes/tradingAnalytics.ts`: additive exact net values on the
  Morning Summary response.
- `apps/web/src/components/chrome/AppShell.tsx`: compact N50 identity and Today
  outlook surface.
- `apps/web/src/components/chrome/headerTodayOutlook.ts`: display-only value,
  missingness and tone adapter.
- `apps/web/src/components/chrome/AppShell.module.css`: desktop/mobile compact
  presentation.
- `apps/web/src/design-system/WorkspacePrimitives.tsx`: optional accessible
  icon-only quality rendering.
- `tools/playwright/header-today-outlook-regression.mjs`: authenticated desktop
  and mobile preservation checks.

## Validation

Focused automated coverage verifies exact ₹ crore formatting, null preservation,
all six canonical matrix tone mappings, and the server response. The browser
regression verifies desktop/mobile visibility, no page overflow, `N50`, the
outlook result and exact desktop values, and absence of the retired header text.

Runtime evidence is written below `output/playwright/header-today-outlook-*`
and is intentionally not committed.
