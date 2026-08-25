# Paper Trading Fixed-Capital Recycling Simulation

## Delivery record

- Date/time: 2026-08-21 17:57 UTC
- Scope: additive analytical widget on `/n50/paper-trading`
- Environment: `PAPER`; no broker-order route is called
- Starting capital: ₹10,00,000 for every independent scenario
- Per-trade allocations and slot caps: ₹1,00,000/10, ₹2,00,000/5, ₹5,00,000/2 and ₹10,00,000/1
- Source order: every valid paper observation inside the selected `entry_strategy`, from that strategy's first stored `opened_at`, ordered by timestamp and then stable trade-group ID

## Governed simulation rules

1. Each entry strategy receives an independent ₹10 lakh ledger. Inter-strategy capital allocation is prohibited.
2. At each paper entry timestamp within that strategy, target exits already due are processed first and their deployed capital plus gross P&L returns to cash.
3. A new position is admitted only when a slot and enough cash for at least one whole cash-equity share are available.
4. Quantity is `floor(min(per-trade allocation, available cash) / cash-equity entry price)`.
5. BUY and SELL returns are direction normalised.
6. The capital exit is the earliest timestamp between the existing governed execution targets: D0 intraday `+1%` and swing `+3%`.
7. A trade without either hit remains open, retains its slot and deployed capital, and is marked using the canonical carry/current mark.
8. Missing current marks do not invent P&L; the position remains `OPEN_UNMARKED` and its capital remains locked.
9. This is a gross analytical simulation. It does not rewrite booked realised/unrealised P&L, costs, taxes, fills, target events, or production trade rows.

## Live results at validation time

### RSI + Williams entry — 16 source trades

| Allocation | Slots | Trades taken | Target exits | Open | Ending equity | Total gross P&L | Event drawdown |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ₹1,00,000 | 10 | 13 | 3 | 10 | ₹10,11,153.39 | +₹11,153.39 | ₹0.00 |
| ₹2,00,000 | 5 | 8 | 3 | 5 | ₹10,19,520.76 | +₹19,520.76 | ₹0.00 |
| ₹5,00,000 | 2 | 5 | 3 | 2 | ₹10,45,110.59 | +₹45,110.59 | ₹0.00 |
| ₹10,00,000 | 1 | 2 | 1 | 1 | ₹10,27,061.19 | +₹27,061.19 | ₹2,935.80 |

### Quality threshold entry — 19 source trades

| Allocation | Slots | Trades taken | Target exits | Open | Ending equity | Total gross P&L | Event drawdown |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ₹1,00,000 | 10 | 13 | 6 | 7 | ₹9,93,518.67 | −₹6,481.33 | ₹17,955.24 |
| ₹2,00,000 | 5 | 5 | 1 | 4 | ₹9,72,637.30 | −₹27,362.70 | ₹32,949.90 |
| ₹5,00,000 | 2 | 2 | 0 | 2 | ₹9,49,262.90 | −₹50,737.10 | ₹50,737.10 |
| ₹10,00,000 | 1 | 1 | 0 | 1 | ₹9,27,529.20 | −₹72,470.80 | ₹72,470.80 |

These results are as-of snapshots and will change automatically as target timestamps, new paper entries, and current marks change.

## UI

- A separate premium light-theme block is placed after the portfolio summary.
- Entry-strategy buttons sit at the top; switching one replaces the entire scenario comparison and Gantt. All four allocation selectors remain visible; no dropdown is required.
- Positive sets show `Highest benefit`; an all-negative set shows `Lowest loss` and never labels a losing allocation a winner.
- Each scenario shows allocation, slot cap, trades taken, return and gross result.
- The selected scenario shows ending equity, realised/open marked P&L, maximum drawdown, best/worst trade, trades till date, available cash and deployed open capital.
- The Gantt shows chronological allocation occupancy. Green bars are governed target exits, amber bars are still-open marked positions, and grey bars are open without a usable mark.
- Clicking a Gantt identity/bar opens the existing paper trade detail.
- Mobile retains all scenario cards and uses an internally scrollable allocation timeline without page-level horizontal overflow.

## Files

Created:

- `neon-stock-terminal/apps/api/src/lib/paperCapitalSimulation.ts`
- `neon-stock-terminal/apps/api/src/lib/paperCapitalSimulation.test.ts`
- `/home/novius2/trading-stack/tools/playwright/paper-fixed-capital-regression.mjs`

Changed:

- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `backend-openapi-documentation-2026-08-13/services/dashboard-api.openapi.yaml`
- `backend-openapi-documentation-2026-08-13/services/dashboard-api.openapi.json`

Deleted: none.

## API and schema impact

- `GET /v1/workspace/paper-trading` now includes required `fixedCapitalPortfolioStrategyComparisons`, grouping four scenario records, position timelines and event-equity records by entry strategy.
- Compatibility field `fixedCapitalPortfolioScenarios` contains only the first strategy group; it is never a pooled inter-strategy ledger.
- PostgreSQL schema impact: none.
- Production data mutations: none.
- SmartAPI/collector changes: none.

## Validation

- Full API suite: PASS, 113/113.
- Dedicated capital simulation: PASS, 6/6, including a no-inter-strategy assertion.
- API TypeScript: PASS.
- Web tests: PASS, 35/35.
- Web TypeScript: PASS.
- Production Vite build: PASS, 2,496 modules.
- OpenAPI validation: PASS, 18 specifications, 602 operations, zero errors.
- Docker build/recreate: PASS; `trading-stack-novius2-n50-dashboard-1` healthy.
- Authenticated public-origin Chromium: PASS; 35 live source trades split into RSI/Williams 16 and Quality Threshold 19, eight strategy/scenario reconciliations, no cross-strategy position IDs, strategy/scenario/Gantt interaction, 1920×1080 and 390×844, no body overflow or material console error.

An intermediate deployment attempt created a container in the wrong Compose project and failed closed because `redis` was not resolvable there. That accidental container was removed. The dashboard was then recreated in the correct `trading-stack-novius2` project and passed health and browser validation.

## Evidence

- Desktop full page: `screenshots/paper-fixed-capital-2026-08-21/paper-fixed-capital-desktop-1920x1080.png`
- Desktop widget: `screenshots/paper-fixed-capital-2026-08-21/paper-fixed-capital-widget-desktop.png`
- Mobile full page: `screenshots/paper-fixed-capital-2026-08-21/paper-fixed-capital-mobile-390x844.png`
- Mobile widget: `screenshots/paper-fixed-capital-2026-08-21/paper-fixed-capital-widget-mobile.png`

## Known limitations

- `maxEventDrawdown` is deliberately labelled as event-equity drawdown. It uses realised governed exits plus the latest mark of open positions; it is not a fabricated minute-by-minute portfolio equity curve.
- Scenario values are gross. Hypothetical scenario-specific costs and tax are not fabricated because no governed cost allocation exists for this simulated capital ledger.
- The image build reports 17 existing dependency vulnerabilities (13 moderate, 3 high, 1 critical). No dependency was added by this change; remediation requires a separate compatibility/security review.

## Rollback

- Source backup: `/home/novius2/trading-stack/backups/paper-fixed-capital-20260821T180000Z`
- Restore the three backed-up API/UI files, remove the additive simulator/test files, rebuild `n50-dashboard`, and recreate it with Compose project `trading-stack-novius2`.
- No database rollback is required.
