# ADR-001: Backtesting visual vertical slice

## Decision

Implement the supplied light analytical design as a scoped backtesting
experience inside the existing routes and data contracts. Do not replace the
application shell, router, query layer or canonical backtest engine.

The first vertical slice prioritises the three journeys explicitly requested by
the owner:

- portfolio/result story on `/backtesting` and `/backtesting/results`;
- objective-led strategy comparison on `/backtesting/compare` and the
  leaderboard;
- individual strategy journey on `/backtesting/strategies/:strategyId`.

All existing backtesting pages inherit the new visual tokens so navigation
between those journeys remains coherent.

## Reasons

- The supplied prototype is an information-hierarchy reference, not a drop-in
  component library.
- Existing PostgreSQL snapshots already contain authoritative values required
  for the first story.
- A separate browser-side calculation model would create reconciliation risk.
- Replacing global analytics styling would unnecessarily affect unrelated live
  market pages.

## Consequences

- New narrative components accept canonical DTO values and only derive display
  state and wording.
- ECharts receives an explicit light appearance for readable canvas labels.
- Advanced routes and data contracts from the full specification remain a
  governed follow-on rather than being represented with mock values.
