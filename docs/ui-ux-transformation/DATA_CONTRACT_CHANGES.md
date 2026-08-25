# Data Contract Changes

## Baseline — 2026-08-11

No application contract or database schema was changed during Phase 0.

Current client architecture uses React Query for most HTTP resources, a custom live-quote WebSocket hook for quote updates, and a small number of direct page fetches. The API is Express/TypeScript with Prisma plus direct PostgreSQL integrations to the normalised trading schemas. Existing durable collectors remain outside the UI service.

### Contracts requiring additive normalisation

1. `ModuleQualityState`: transport, freshness and readiness are currently conflated by `FeedFreshnessBadge`.
2. Canonical workspace tab metadata: current route matching exists, but tab state is not one central typed contract.
3. Paper workspace authentication: `/v1/workspace/paper-trading` returns 401 through an otherwise authenticated n50 browser session.
4. Stock 360 aggregation: the UI currently composes intraday, daily, OIIS, SmartAPI and backtest queries client-side.
5. Canonical selected-run model: backtest pages bind to scenario-specific APIs rather than one immutable run context.

Any added contract will preserve current endpoints and be versioned or backward-compatible. Missing values remain nullable and must not be serialised as financial zero.

## Additive implementation changes — 2026-08-11

- `ModuleQualityState` now models transport, freshness and analytical readiness independently in the client.
- The market WebSocket envelope adds a connection-local monotonic `sequence`; older/duplicate events are ignored and gaps force recovery/snapshot replacement.
- `/v1/overview` aggregates the effective all-F&O cash-underlying canvas, sector classification, live price/depth context, indicators, OIIS state and 30-day opportunity without replacing the collectors.
- `/v1/workspace/futures` provides current-contract summary fields (spot/future, basis, annualised basis, OI/volume, expiry and readiness) while legacy raw routes remain compatible.
- OIIS dashboard contracts expose run identity/time, direction, factors, qualification state, rejection evidence and historical-run context.
- Paper workspace contracts preserve execution accounting while adding independent observation/horizon/detail surfaces. LONG/SHORT direction and one-lot quantity remain backend-derived.
- Backtesting acceptance semantics are centralised client-side for presentation: finite positive return and declared minimum sample are required before success language. Stored engine results are not changed.
- Startup snapshot work is scheduled serially and de-duplicated; this changes execution cadence, not response schemas.

No destructive database migration was introduced by the UI transformation, and no existing SmartAPI ingestion table or collector contract was replaced.

## Admin-only paper-trade comments — 2026-08-12

- Added the append-only `paper_trading.trade_comments` persistence surface through migration `008_admin_trade_comments`.
- Paper summary/detail responses expose comment metadata/content only when the authenticated session role is `admin`.
- Added administrator-only GET/POST comment endpoints; POST additionally requires CSRF and writes a request-audit record.
- Existing paper execution, calculation, observation, target and notification contracts remain unchanged.
