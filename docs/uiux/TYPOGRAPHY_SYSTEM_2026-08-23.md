# NIFTY 50 Trader typography system

Date: 23 August 2026

## Implemented decision

- Primary UI: self-hosted `Inter Variable` through `@fontsource-variable/inter`.
- Financial numbers: Inter Variable with lining and tabular numerals. Ordinary prices, P&L, quantities, percentages and timestamps no longer inherit IBM Plex Mono.
- Technical identifiers: IBM Plex Mono remains restricted to code, formulas, API fields, run IDs, log lines and provenance identifiers.
- Indian scripts: existing Hind and Noto Sans Devanagari fallbacks remain Unicode-ranged and are fetched only when matching glyphs are used.
- Accessibility preference: self-hosted `Atkinson Hyperlegible Next Variable`, selectable from the authenticated user menu and persisted in `localStorage` under `n50:accessibility:font-mode`.
- Browser fallback: system UI, Segoe UI and Arial/sans-serif.

## Implementation

- Shared tokens: `neon-stock-terminal/apps/web/src/styles/tokens.css`.
- Global numeric and technical roles: `neon-stock-terminal/apps/web/src/styles/global.css`.
- Persisted preference: `neon-stock-terminal/apps/web/src/lib/fontMode.ts`.
- User control: `neon-stock-terminal/apps/web/src/components/chrome/AuthStatus.tsx`.
- ECharts follows the selected font mode: `neon-stock-terminal/apps/web/src/components/visual/EChartSurface.tsx`.
- Legacy Home, Paper, ticker, stock-pill, heatmap-legend and analytics monetary surfaces now resolve through `--font-numeric` rather than the mono family.
- The custom Change/RSI/Williams heatmap canvases use Inter for English numeric labels.

## Readability correction

The shared workbench labels, evidence badges, chart labels, Home lenses, F&O anomaly strip and Home stock controls were raised to a 12 px practical minimum. Uppercase and heavy tracking were removed from the most frequently repeated compact workbench labels.

The collapsed Advanced Market Evidence region also received an explicit closed-state rule. Its grid children previously overrode the browser's native closed-details rule, leaving dense advanced evidence mounted visibly despite a collapsed summary.

## Licensing and loading

All font packages are production dependencies and self-hosted WOFF2 resources. No external font request is made. Inter, IBM Plex Mono, Hind, Noto Sans Devanagari and Atkinson Hyperlegible Next are OFL-1.1 packages. Exact installed versions and licences are recorded in `docs/uiux/open-source-licence-manifest.md`; package licences remain inside the deployed npm dependency tree.

## Verification

- TypeScript: PASS.
- Frontend tests: 43/43 PASS.
- Production Vite build: PASS.
- Phase A preservation: 56 routes, 198 backlog items, 37 Paper fields.
- Authenticated public-production typography verification: standard body resolves to Inter Variable; numeric token resolves to Inter and excludes IBM Plex Mono; high-legibility mode resolves to Atkinson and survives reload; external font requests: zero.
- Visible text below 11.5 px on the authenticated production Home default view: zero.
- Visible text below 11.5 px on the authenticated production Paper Trading default view: zero.
- Public-production WCAG A/AA sweep: 16 scans across eight primary workspaces at desktop and mobile sizes, zero violations and zero affected nodes.
- Evidence: `docs/uiux/typography/`.
- Accessibility evidence: `docs/uiux/accessibility/production-typography/axe-results.json`.

## Deployment

- Public application: `https://n50.nifty50today.co.in/n50`.
- Container: `trading-stack-novius2-n50-dashboard-1`, healthy after cutover.
- Deployed image: `sha256:6b9cd728fc2328cf61c2884770d16a39b83882465d8b184f2cb3bfe448a971af`.
- Only the dashboard container was recreated; canonical APIs, collectors, PostgreSQL and trading execution semantics were not changed.

## Rollback

Application rollback image: `trading-stack-n50-dashboard:rollback-pre-typography-20260823` (`sha256:f8b70a85e0de76ee0052a7b7583bd2541229d24ff9152a62551033adbca0d130`). Source-only rollback consists of removing the Atkinson dependency/control and restoring `--font-numeric: var(--font-mono)`; this is not recommended because it would reinstate the identified financial-number inconsistency.
