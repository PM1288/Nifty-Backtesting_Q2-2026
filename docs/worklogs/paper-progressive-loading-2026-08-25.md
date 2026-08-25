# Paper Trading progressive loading and end-to-end speed repair — 2026-08-25

## Outcome

Paper Trading no longer aborts its canonical evidence request after 60 seconds or replaces the page with a terminal error. The workspace obtains authoritative portfolio counts and accounting totals from a lightweight bootstrap endpoint, renders those immediately, and continues hydrating trade paths, targets, quality evidence and simulations in the background for as long as required.

## Verified blockers

1. `usePaperData` issued one monolithic request and aborted it after 60 seconds. A slow-but-valid response was discarded and the user lost all useful context.
2. `GET /v1/workspace/paper-trading` waited for eight datasets before sending any JSON.
3. Its complete trade projection performs entry-session and 30-session one-minute-bar lookups, target/horizon aggregation, OIIS entry-evidence matching and capital simulations.
4. `pg_stat_statements` recorded the complete projection at a 6.4-second mean and 54.4-second maximum for one statement generation; older variants reached 109 seconds under contention.
5. The entry-time OIIS lookup lacked a symbol/direction/time index and scanned/sorted candidate history for every durable trade.

## Implementation

- Added authenticated `GET /v1/workspace/paper-trading/bootstrap`.
- Bootstrap returns canonical trade counts, open/closed counts, realised/open P&L, mark time, active target/data-incident counts, the latest five trade summaries, policy version and permissions.
- The browser paints the complete Paper workspace header and an explicit hydration state after bootstrap.
- The detailed request continues in the background. There is no arbitrary client deadline.
- A detailed-load failure retains the valid summary and exposes a retry action; it no longer turns the whole page into “Paper evaluation unavailable”.
- The empty-state wording cannot claim there are no trades while detailed evidence is still loading.
- Added additive migration `db/sql/054_paper_workspace_read_indexes.sql` for OIIS entry evidence and correlated cost/fill/P&L lookups.
- Updated the Paper OpenAPI contract to version 1.1.0.

## Data and safety

- No paper trade, fill, position, target, observation or P&L value was modified.
- No calculation, entry/exit rule, permission, confirmation or paper/live boundary changed.
- Index migration is additive and was applied to the existing authoritative PostgreSQL database.

## Validation

- Entry-time OIIS lookup: approximately 1.35 seconds before the index and 0.19 seconds after it for the current 41-trade projection.
- API unit tests: 122/122.
- Web unit tests: 45/45.
- API and web typechecks/builds: pass.
- Canonical repository preservation gate: pass.

## Rollback

Revert the application commit and recreate only `n50-dashboard`. The indexes may safely remain because they do not alter values. If removal is explicitly required, drop only the four indexes named in migration 054; do not modify their tables or data.
