# Paper Trading investment scenarios — 2026-08-19

## Outcome

The production Paper Trading workspace now shows two independent capital bases for every existing and future cash-equity paper observation:

1. **F&O-quantity investment required** = stored cash-equity entry price × the F&O-derived quantity captured when the paper trade opened.
2. **Fixed ₹2 lakh scenario** = `floor(₹200,000 / entry price)` whole cash-equity shares. Deployed capital and the uninvested cash remainder are shown separately.

The fixed-capital scenario is analytical only. It does not change the stored paper quantity, fills, realised/unrealised accounting, target events or observation lifecycle. Historical rows are backfilled deterministically in the API projection; no production record was rewritten.

## Derived fields

`GET /v1/workspace/paper-trading` now returns:

- `investment_price_basis`
- `investment_quantity_basis`
- `fno_quantity_investment_required`
- `fixed_investment_budget`
- `fixed_investment_quantity`
- `fixed_investment_deployed`
- `fixed_investment_cash_remaining`
- `fixed_investment_actual_pnl`
- `fixed_investment_carry_pnl`
- `fixed_investment_intraday_eod_pnl`
- `fixed_investment_mfe_5d_pnl` / `fixed_investment_mae_5d_pnl`
- `fixed_investment_mfe_30d_pnl` / `fixed_investment_mae_30d_pnl`

Long and short returns are direction-normalised. Target cells also show the fixed-capital profit after a target is hit. Completed horizon P&L is scaled from the governed closing return. Displayed rupee values retain a maximum of two decimal places.

## UI changes

- Added a capital-basis summary line above the complete evidence table.
- Added `Investment required` to the desktop table, with F&O quantity and ₹2 lakh sizing in one compact column.
- Added fixed-capital figures beneath actual economics, D0 15:30, target-hit profit, completed horizon result, maximum profit, maximum drawdown and never-closed carry.
- Added equivalent capital and P&L evidence to mobile trade cards.

## Files

- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/api/src/routes/workspace.paper.test.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13/services/dashboard-api.openapi.yaml`
- `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13/services/dashboard-api.openapi.json`
- `/home/novius2/trading-stack/tools/playwright/paper-investment-scenarios-regression.mjs`

## Validation

- API test suite: **107/107 passed**, including fixed-capital formula, whole-share remainder, F&O quantity basis and short-direction symmetry.
- API and web TypeScript checks: **passed**.
- API and web production builds: **passed**.
- Live authenticated Chromium regression: **passed** for all 26 current rows at 1920×1080 and 390×844.
- Live capital reconciliation:
  - F&O-quantity entry investment: ₹18,942,173.00
  - fixed budgets: ₹5,200,000.00
  - fixed capital deployed: ₹5,148,466.67
  - fixed scaled actual P&L: ₹4,020.13
  - fixed never-closed carry P&L: −₹21,114.81
  - fixed observed maximum profit: ₹281,911.09
  - fixed observed maximum drawdown: −₹314,391.49
- OpenAPI validation: **18 specifications, 602 operation instances, zero errors**.
- Container: `trading-stack-novius2-n50-dashboard-1` healthy after deployment.

Repository-wide lint was run and remains failed: API reported 60 errors and web reported 158 errors in pre-existing files/rules. No lint failure was relabelled as a warning; the modified code passes typecheck and production compilation.

## Screenshots

- Desktop: `/home/novius2/trading-stack/tools/playwright/output/playwright/paper-investment-scenarios/desktop.png`
- Mobile: `/home/novius2/trading-stack/tools/playwright/output/playwright/paper-investment-scenarios/mobile.png`

## Rollback

Restore the four dashboard files from:

`/home/novius2/trading-stack/backups/paper-fixed-investment-20260819T123246Z`

Then rebuild and recreate only `n50-dashboard`. No database rollback is required because this change added no migration and mutated no stored trade.
