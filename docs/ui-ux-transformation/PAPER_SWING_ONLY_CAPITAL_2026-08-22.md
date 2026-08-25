# Paper Trading Swing-Only Fixed-Capital Simulation

## Delivery

- Date/time: 2026-08-22 16:42 UTC
- Live route: `/n50/paper-trading`
- Purpose: a second fixed-capital ledger that ignores intraday exits and closes/releases capital only at the existing governed swing `+3%` first-hit timestamp.
- This is additive. The existing earlier-of-intraday-1%-or-swing-3% ledger remains unchanged and visible above it.

## Rules

1. Start each entry strategy with its own ₹10,00,000 ledger.
2. Never allocate money between different entry strategies.
3. Evaluate ₹1L, ₹2L, ₹5L and ₹10L per-trade sizes, yielding maximum simultaneous slots of 10, 5, 2 and 1.
4. Ignore all intraday target events, including an earlier intraday +1% hit.
5. Release deployed capital only when the trade reaches the governed swing +3% target.
6. Admit the next eligible trade after that swing release timestamp.
7. Unhit trades remain open, keep their slot/capital, and use the canonical current mark where available.
8. BUY/SELL returns are direction normalised and quantities use whole cash-equity shares.
9. This gross analytical ledger does not alter fills, execution status, booked P&L, target events, costs, tax or production records.

## Live results

### RSI + Williams entry — 16 source trades

| Allocation | Slots | Trades | Swing exits | Open | Ending equity | Gross P&L | Event drawdown |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ₹1L | 10 | 12 | 2 | 10 | ₹10,10,780.76 | +₹10,780.76 | ₹0.00 |
| ₹2L | 5 | 7 | 2 | 5 | ₹10,13,874.33 | +₹13,874.33 | ₹0.00 |
| ₹5L | 2 | 4 | 2 | 2 | ₹10,30,979.62 | +₹30,979.62 | ₹0.00 |
| ₹10L | 1 | 2 | 1 | 1 | ₹10,27,061.19 | +₹27,061.19 | ₹2,935.80 |

### Quality Threshold entry — 19 source trades

| Allocation | Slots | Trades | Swing exits | Open | Ending equity | Gross P&L | Event drawdown |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ₹1L | 10 | 11 | 3 | 8 | ₹9,83,986.92 | −₹16,013.08 | ₹24,530.50 |
| ₹2L | 5 | 5 | 1 | 4 | ₹9,72,637.30 | −₹27,362.70 | ₹32,949.90 |
| ₹5L | 2 | 2 | 0 | 2 | ₹9,49,262.90 | −₹50,737.10 | ₹50,737.10 |
| ₹10L | 1 | 1 | 0 | 1 | ₹9,27,529.20 | −₹72,470.80 | ₹72,470.80 |

Values are live as-of snapshots and update as new paper entries, swing target events and current marks arrive.

## UI and API

- Separate violet-accented Swing-only widget and Gantt.
- Top strategy buttons currently show RSI + Williams and Quality Threshold. A future entry strategy appears automatically once it has trades.
- Four allocation cards remain visible without a dropdown.
- Switching the strategy or allocation updates benefits/lowest-loss wording, KPIs and the swing-only Gantt.
- API additions:
  - `fixedCapitalSwingOnlyScenarios`
  - `fixedCapitalSwingOnlyStrategyComparisons`
  - `PaperCapitalScenario.exitPolicy = SWING_ONLY`
- PostgreSQL migration: none.

## Validation

- API: PASS, 114/114.
- Deterministic swing test proves an intraday hit is ignored and the later swing +3% hit releases capital.
- Web tests: PASS, 35/35.
- API/web TypeScript and production Vite build: PASS.
- OpenAPI: PASS, 18 specifications, 602 operations, zero errors.
- Docker: PASS; `trading-stack-novius2-n50-dashboard-1` healthy.
- Authenticated production Chromium: PASS; both entry strategies, eight swing-only scenarios, no inter-strategy position, no intraday exit reason, separate desktop/mobile Gantt and no page-level horizontal overflow.

## Evidence

- Desktop swing widget: `screenshots/paper-fixed-capital-2026-08-22/paper-swing-capital-widget-desktop.png`
- Mobile swing widget: `screenshots/paper-fixed-capital-2026-08-22/paper-swing-capital-widget-mobile.png`
- Desktop full page: `screenshots/paper-fixed-capital-2026-08-22/paper-fixed-capital-desktop-1920x1080.png`
- Mobile full page: `screenshots/paper-fixed-capital-2026-08-22/paper-fixed-capital-mobile-390x844.png`

## Rollback

- Backup: `/home/novius2/trading-stack/backups/paper-swing-capital-20260822T164000Z`
- Restore the backed-up five source files, rebuild/recreate `n50-dashboard` under Compose project `trading-stack-novius2`.
- No database rollback is required.
