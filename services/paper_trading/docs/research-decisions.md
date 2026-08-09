# Research decisions

- PostgreSQL is both source of truth and queue to preserve replay without extra infrastructure.
- Diagnostic targets never cause execution exits unless explicitly configured.
- Analytical tracks remain active after actual closure.
- Alternative target profits are not additive.
- Same-bar sequence is ambiguous and defaults to conservative execution.
- Thirty-session horizons are trading-session observations, not calendar-day promises.
- The 35% amount is a configurable management provision, not legal advice.
