# Permanent NIFTY 50 header quote and ticker

Date: 23 August 2026

## Implemented behaviour

- The authenticated application header now shows a fixed NIFTY 50 level and session percentage beside the environment and market-session state.
- Desktop label: `NIFTY 50`; mobile pinned label: `N50`.
- Positive, negative and neutral states retain arrow, sign, text and colour; colour is not the only encoding.
- The value uses the existing live NIFTY 50 quote first, then the authenticated overview index snapshot, then the ticker snapshot. Missing data renders `— / Pending`; it is never converted to zero.
- The ticker rail is mounted by the shared `AppShell` on every authenticated route, including Paper Trading, strategies, Stock 360, Backtesting, Data & Operations and Administration.
- Route transitions retain the shell and therefore do not intentionally remove or recreate the ticker component.
- Presentation mode continues to hide application chrome by explicit user request; ordinary dashboard navigation always retains it.

## Code

- Shared shell and data fallback: `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`.
- Responsive fixed-quote styling and sticky offsets: `neon-stock-terminal/apps/web/src/components/chrome/AppShell.module.css`.
- Compact ticker row: `neon-stock-terminal/apps/web/src/components/chrome/HeaderTicker.module.css`.
- Existing ticker implementation and pause-on-hover/focus behaviour were preserved.

No backend endpoint, WebSocket contract, quote calculation, trading workflow or database schema changed.

## Validation

- TypeScript: PASS.
- Frontend unit tests: 43/43 PASS.
- Production build: PASS (2,507 modules).
- Authenticated production route matrix: 18/18 checks passed across nine routes at 1440x900 and 390x844.
- Verified quote during the audit: `24,252.00`, `+0.08%`.
- Every audited route had a visible ticker rail and visible fixed NIFTY quote.
- Browser audit found no non-analytics console, request or HTTP 5xx errors.
- WCAG A/AA production sweep: 16 scans, zero violations and zero affected nodes.
- Accessibility evidence: `docs/uiux/accessibility/production-permanent-ticker/axe-results.json`.

## Deployment and rollback

- Container: `trading-stack-novius2-n50-dashboard-1`, running and healthy.
- Deployed image: `sha256:416544377d156907368ebef9aab2772f91ac86c25462acfc2d319f72d3db74cb`.
- Rollback image: `trading-stack-n50-dashboard:rollback-pre-permanent-ticker-20260823` (`sha256:6b9cd728fc2328cf61c2884770d16a39b83882465d8b184f2cb3bfe448a971af`).
