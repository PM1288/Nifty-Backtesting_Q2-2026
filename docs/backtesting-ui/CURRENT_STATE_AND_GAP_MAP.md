# Backtesting UI current state and gap map

Date: 2026-08-03
Branch: `DEV_PM_CODE`
Input brief: `/home/novius2/NIFTY50/UI-CHnages-1`

## Product story required by the brief

The analytical reading order is:

1. Trust: identify the run, scope, coverage and validation state.
2. Money: distinguish final portfolio value, realized profit, unrealized P&L,
   tax reserve and transaction costs.
3. Risk: expose drawdown, open exposure and concentration before celebrating a
   win rate.
4. Explanation: show the immutable strategy rules and the journey from signal
   to closed and still-open positions.
5. Stability: compare regimes, stocks, capital constraints and peer strategies.
6. Action: state whether to reject, revise, compare or continue research.

## Current implementation

- React/Vite UI under `neon-stock-terminal/apps/web`.
- Express/Prisma API under `neon-stock-terminal/apps/api`.
- TanStack Query hooks under `apps/web/src/lib/hooks.ts`.
- ECharts canvas rendering through `components/visual/EChartSurface.tsx`.
- Backtesting routes are `/backtesting`, `/backtesting/strategies`,
  `/backtesting/strategies/:strategyId`, `/backtesting/results`,
  `/backtesting/regimes`, `/backtesting/stocks`, `/backtesting/daily-summary`,
  `/backtesting/compare` and `/backtesting/runs`.
- Canonical result DTOs come from published PostgreSQL batch snapshots; the
  browser formats and filters returned records.

## Material gaps

| Gap | Current consequence | This implementation |
| --- | --- | --- |
| Dark low-contrast analytical canvas | Cards and charts have equal weight and are difficult to scan | Introduce a backtesting-only light analytical theme with navy type, white surfaces and restrained semantic colours |
| Charts before conclusion | Reviewer must infer the result | Add a decision brief, formal state and Good / Bad / Watch evidence before charts |
| Realized and total outcome mixed | 100% closed-trade win rate can hide open losses | Present closed-book evidence separately from mark-to-market portfolio outcome |
| Weak run identity | Scope is spread across headers and filters | Add a reusable context strip for run date, data date, universe, capital, benchmark and research state |
| Generic navigation labels | Page sequence does not tell a research journey | Rename tabs and add numbered journey cues from decision brief to audit trail |
| Comparison has no explicit objective story | One row can look universally best | Add compatibility status and objective-based comparison explanations |
| Strategy detail begins with filters | Rules and conclusion are delayed | Lead with rule identity, verdict and lifecycle before detailed charts/tables |
| Canvas charts use dark-axis defaults | Light-page conversion would leave unreadable chart labels | Add an explicit light appearance to the shared ECharts surface |
| Mobile compresses the desktop hierarchy | Context and conclusions become hard to scan | Stack evidence cards, use scrollable tabs and preserve trust/economics above charts |

## Data boundaries

The existing published payload can support the vertical slice without inventing
financial calculations. It contains run timestamps, scenario identity, final
portfolio value, realized and unrealized P&L, taxes, costs, benchmark value,
equity, drawdown, deployment, trades, open positions, stocks and regimes.

The current database validation rows establish scenario computation readiness,
not full research acceptance. Therefore the UI must use `ENGINEERING PASS` or
`INCONCLUSIVE` language and must not claim `RESEARCH ACCEPTED`.

## Deferred contract gaps

The current data does not yet provide point-in-time universe hashes, calibrated
target probability, complete MFE/MAE, minute execution evidence for every
trade, walk-forward/OOS folds, parameter surfaces, sector taxonomy, capacity
curves or a complete historical P-Diagram. These remain visible limitations;
the UI must not fabricate them.
