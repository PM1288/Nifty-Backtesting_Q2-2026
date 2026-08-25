# Repository-specific extension guides

## Add a chart

1. Establish a canonical source and as-of/freshness contract in the owning
   service or gateway route. Do not calculate the same metric independently in
   multiple components.
2. Add or extend the typed response in
   `neon-stock-terminal/apps/web/src/lib/types.ts` and client function in
   `apps/web/src/lib/api.ts`.
3. Build the series/view model in a tested pure helper. Preserve raw values;
   formatting belongs at the presentation boundary.
4. Reuse `components/visual/EChartSurface.tsx` and the semantic helpers where
   ECharts fits. Use custom SVG only when existing selection/accessibility
   contracts cannot express the visual.
5. Put component styles in the page/component CSS module and use existing
   tokens from `styles/tokens.css`/`trading-v2.css`.
6. Add null, stale, empty and eligibility tests plus exact two-decimal display
   tests where financial values are shown.
7. Add the route to `tests/documentation-audit/capture-all-pages.mjs` only when
   it is a new page; component charts are captured automatically on 1920px.
8. Regenerate this audit and add interpretation, limitation and lineage.

## Add a strategy

1. Create a stable strategy ID and version in its independent owning service.
2. Define point-in-time inputs, entry knowledge time, permitted fill time,
   exits, position sizing, missing-session rules, costs and hard-fail states.
3. Add deterministic unit and reconciliation fixtures before persistence.
4. Use additive SQL migrations in the strategy's schema; never reset existing
   results.
5. Register service endpoints through the authenticated Express gateway and
   update the applicable OpenAPI document.
6. Add typed web contracts, a Strategy workspace route, deep-link state and
   permission-aware actions. Do not couple it to OIIS or Paper Trading unless
   explicitly authorised.
7. Validate same-bar/next-bar timing, survivorship, corporate actions, maturity
   denominators and exports.

## Add a market-data provider

1. Implement the provider behind the closest existing adapter boundary under
   `internal/*` (Go collector) or `services/*` (service-specific Python/JS).
2. Normalize symbol lineage, exchange, timezone, session, OHLC/quote fields and
   price-adjustment basis before persistence.
3. Add rate limits, bounded retries, authentication through mounted/env secrets,
   and explicit unavailable/stale states. Never expose provider credentials to
   the web bundle.
4. Write to an additive canonical/staging schema with idempotency, uniqueness,
   provenance and availability timestamps.
5. Reconcile a sample against the provider response and an independent source.
6. Expose the provider only through an authenticated/versioned gateway contract.
7. Add health, missing-interval, duplicate, holiday and reconnect tests; update
   `03_DATA_SOURCE_CATALOG.md`, OpenAPI, lineage and screenshots.
