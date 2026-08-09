# Trading Workspace Design System V2

## Scope

V2 tokens apply only below `[data-ui-generation="trading-v2"]`. The Home route intentionally does not carry this attribute.

## Foundations

| Role | Value |
|---|---|
| Canvas | `#F6F8FC` |
| Surface | `#FFFFFF` |
| Primary text | `#0B1220` |
| Secondary text | `#5B6575` |
| Border | `#D9E0EA` |
| Navigation | `#0B1F3A` |
| Navigation selected | `#12315A` |
| Primary action | `#1E5EFF` |
| Positive | `#0A8F5A` |
| Negative | `#C9362B` |
| Warning | `#B7791F` |
| Options | `#6D4AFF` |
| Futures | `#008AA6` |
| Nifty reference | `#C49016` |

Inter is the UI typeface. IBM Plex Mono is restricted to identifiers, symbols, timestamps, prices and other tabular data. Desktop gutters are 24 px, tablet 20 px and mobile 16 px. The header is 64 px; the navigation rail is 216 px expanded and 72 px collapsed.

## Interaction and accessibility

- Focus is a visible 2 px blue ring with offset.
- State is communicated through label/icon plus colour.
- Mobile interactive controls are at least 44 px.
- Tables remain tables on wide screens and use contained horizontal scrolling on narrow screens.
- Motion is restrained and disabled when reduced motion is requested.
- Light mode is the default operational workspace; no decorative neon glows are used.

## Reusable product primitives

- `EnvironmentBadge` — PAPER/LIVE identity, with PAPER as the safe default.
- `FeedFreshnessBadge` — loading, current, stale, unavailable and error states.
- `StatusPill` — success, warning, danger, info and neutral states with icons.
- `ContextIdentityStrip` — environment, market, data timestamp, user state and page identity.
- `ValidationGateStrip` — explicit research validation state.
- `FailurePanel` — unavailable, partial, stale or failed data with retry guidance.

Charts must identify metric, unit, period, sample, economic assumptions and run/data identity when relevant. Analytical target paths and realised execution P&L must remain visibly distinct.
