# Paper Trading EOD rollup and heatmap reconciliation — 15 August 2026

## Outcome

The live Paper Trading command centre now separates D0, intraday execution, swing carry, 5D/30D
evidence and the never-closed counterfactual. The earlier `Intraday sums` card was incorrect because
it selected trades with an intraday target hit and then mixed their booked realised and currently
open unrealised balances. It also never summed row-level maximum profit.

## Corrected definitions

- **D0 15:30 hypothetical P/L:** direction-normalised entry-to-final-entry-session close multiplied
  by the original quantity. It is shown only when `bars_1m` contains a final bar at or after 15:29 IST.
- **Intraday booked:** realised net P/L only for executions closed on the entry trading date by
  15:30:59 IST.
- **Swing realised:** realised net P/L for trades not closed intraday and closed later.
- **Swing open gross:** current open unrealised gross P/L only for positions carried beyond D0.
- **D0 maximum profit/drawdown:** direction-normalised high/low after entry through the session close.
- **Observed maximum profit/drawdown:** existing full observation path through the evaluated date.
- **Never-closed carry:** original quantity marked to the latest SmartAPI quote. It never enters
  booked execution accounting.

## Live reconciliation

| Measure | Live value |
|---|---:|
| Trades | 17 |
| Complete D0 final marks | 17 / 17 |
| D0 15:30 hypothetical P/L | +₹3,683.05 |
| D0 maximum opportunity | +₹85,638.45 |
| D0 maximum drawdown | −₹71,083.70 |
| Intraday booked realised net | +₹19,087.79 |
| Swing realised after D0 | +₹15,338.69 |
| Swing still-open gross | −₹34,600.35 |
| Full-path maximum profit | +₹141,008.25 |
| Never-closed carry | −₹63,284.45 |

These figures are separate evidence lenses and must not be summed into one accounting total.

## Heatmap

The new accessible heatmap provides:

- rolling-year daily cells;
- current trading week, or the previous completed week on Saturday/Sunday;
- intraday event history with All, Entries, Target hits and 15:30 EOD filters;
- metric switching between 15:30 EOD P/L, D0 maximum profit, D0 drawdown and intraday hits;
- keyboard-focusable cells with date, measure and trade-count labels;
- green/red meaning reinforced by signed values and text.

The referenced `reactjs-calendar-heatmap` interaction model was reviewed. Its package requires D3 and
Moment and does not provide the typed, financial-event semantics or accessibility needed here. The
same year/week/day drill-down was implemented as a repository-native React component without adding
a second chart runtime or new client dependency.

## Changed files

- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/api/src/routes/workspace.paper.test.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `tools/playwright/trade-quality-regression.mjs`
- OpenAPI generator/specification/change log under
  `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`

No database migration, paper execution worker, scheduler, webhook, OIIS calculation or notification
contract was changed.

## Validation

```text
API TypeScript typecheck: PASS
API tests: 94/94 PASS
Web TypeScript typecheck: PASS
Web tests: 21/21 PASS
Production image build: PASS
Live container health: healthy
Live Chromium regression: PASS
Canonical SmartAPI carry marks: 17/17
Complete 15:30 D0 marks: 17/17
Mobile horizontal overflow: none
CSRF negative test: PASS
OpenAPI: 18 specifications / 580 operation instances / 0 errors
OpenAPI ZIP: 61 entries / 0 duplicates / integrity PASS
```

## Evidence

- Desktop: `/home/novius2/trading-stack/output/playwright/paper-eod-heatmap-20260815/paper-complete-evidence-desktop.png`
- Mobile: `/home/novius2/trading-stack/output/playwright/paper-eod-heatmap-20260815/paper-complete-evidence-mobile.png`
- Week heatmap: `/home/novius2/trading-stack/output/playwright/paper-eod-heatmap-20260815/paper-performance-week.png`
- Intraday EOD events: `/home/novius2/trading-stack/output/playwright/paper-eod-heatmap-20260815/paper-performance-intraday-eod.png`
- OpenAPI ZIP: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-15.zip`
- Deployment backup: `/home/novius2/trading-stack/backups/paper-eod-heatmap-20260815T034625Z`

## Rollback

Restore the five backed-up API/UI/test files, rebuild only `n50-dashboard`, and retain all paper
ledger and observation records. No database, Paper worker, OIIS or webhook rollback is required.

## Visual correction — 2026-08-15 04:29 UTC

The initial heatmap presentation did not meet the requested chart behaviour: fixed-width year cells
used only part of the panel, month labels were absent, and the week/intraday views were card lists.
The deployed UI now provides:

- a full-width rolling 53-week calendar with `Aug` through `Aug` month labels and Mon–Sun axes;
- a true 4 × 5 weekly heatmap for EOD P/L, D0 maximum profit, D0 drawdown and target hits;
- a stock × 30-minute intraday heatmap from 09:15 through 15:30 IST;
- Entries, Target hits and 15:30 EOD filters that recolour the same stable intraday grid;
- internal mobile scrolling without page-level horizontal overflow.

The authenticated regression now fails if month/weekday labels disappear, the year grid uses less
than 90% of its panel, the weekly matrix is not 20 cells, or the intraday time axis/stock rows/EOD
cells are absent.

Final evidence:

- Year: `/home/novius2/trading-stack/output/playwright/paper-heatmap-chart-fix-20260815-final/paper-complete-evidence-desktop.png`
- Week: `/home/novius2/trading-stack/output/playwright/paper-heatmap-chart-fix-20260815-final/paper-performance-week.png`
- Intraday: `/home/novius2/trading-stack/output/playwright/paper-heatmap-chart-fix-20260815-final/paper-performance-intraday-eod.png`
- Mobile: `/home/novius2/trading-stack/output/playwright/paper-heatmap-chart-fix-20260815-final/paper-complete-evidence-mobile.png`
- Backup: `/home/novius2/trading-stack/backups/paper-heatmap-chart-fix-20260815T042220Z`

Final validation: web tests 21/21 PASS, TypeScript and production build PASS, live container healthy,
authenticated Chromium regression PASS. No API/schema/OpenAPI contract changed in this visual fix.

## Inclusive horizons and ₹6,000 stop simulation — 2026-08-15 04:40 UTC

The former cards separated completed and developing values in a way that made an immature 30D
portfolio appear to total zero. The corrected snapshot contract is:

- both 5D and 30D begin at the original entry timestamp;
- before the fifth-session outcome exists, both use the same current direction-normalised carry mark;
- at fifth-session maturity, 5D freezes at its canonical stored outcome;
- the inclusive 30D path continues from the same entry through session 30;
- at 30D maturity, the 30D value freezes at its canonical stored outcome.

The new separate ₹6,000 stop simulation calculates the direction-aware stop price from weighted
entry and original quantity, searches canonical `public.bars_1m` evidence through the inclusive 30D
window, and exits at the first breach. When a one-minute bar opens beyond the stop, the adverse open
is used instead of pretending the stop price was available. Trades without a breach retain their
current inclusive 30D mark or completed 30D result. This simulation does not alter Paper positions,
fills, ledgers, targets, horizons or notifications.

Live reconciliation:

| Measure | Value |
|---|---:|
| Trades valued | 17 / 17 |
| Current 5D path | −₹74,900.13 |
| Frozen completed 5D subset | −₹44,438.08 |
| Current inclusive D0–D30 path | −₹63,284.45 |
| Completed 30D subset | ₹0.00 (none matured) |
| Pre-5D snapshot divergences | 0 |
| ₹6,000 first breaches | 9 |
| Stop-simulation gross portfolio result | −₹53,948.35 |
| Improvement versus never-closed carry | +₹9,336.10 |

Validation: API 96/96, web 21/21, API/web TypeScript, production build, live health and authenticated
Chromium regression PASS. OpenAPI validates 18 specifications / 580 operation instances / zero
errors. Updated archive:
`/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-15.zip`.

Evidence:

- `/home/novius2/trading-stack/output/playwright/paper-inclusive-horizon-stoploss-20260815-final/paper-complete-evidence-desktop.png`
- `/home/novius2/trading-stack/output/playwright/paper-inclusive-horizon-stoploss-20260815-final/paper-complete-evidence-mobile.png`
- `/home/novius2/trading-stack/backups/paper-inclusive-horizon-stoploss-20260815T043634Z`
