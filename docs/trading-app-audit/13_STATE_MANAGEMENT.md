# State management

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

- TanStack React Query owns most server-state fetch, refresh, cache, and invalidation behaviour.
- React context owns cross-cutting locale, shortcut, shell/auth, and navigation concerns.
- Component-local React state owns filters, selected rows, chart modes, drawers, and forms unless URL-synchronised.
- WebSocket state is maintained by hooks in `apps/web/src/lib/hooks.ts`.
- Saved view/local storage use must be confirmed from each feature; absence of a persistence call means state is session-only.

The default hook refresh intervals range from 10 seconds to five minutes, with page-specific 20/30/60-second polling and 4-second polling for active backtest runs. This creates independent freshness clocks; the displayed source timestamp is more authoritative than request cadence.
