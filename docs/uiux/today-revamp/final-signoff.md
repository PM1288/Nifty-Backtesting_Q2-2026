# Today revamp validation sign-off

## Implemented

- Existing `/` route with URL lenses `story` and `sector-matrix`.
- New `/full-board` route with URL filters, metric lens, sorting and `inspect=` quick view.
- Stable default order with live rank labels.
- Conditional active-lens mounting and contained sector-group virtualization.
- Seven legacy stock evidence lenses retained on Full Board.
- Stock and sector quick views; canonical Stock 360 and F&O links retained.
- Legacy Today retained behind `VITE_TODAY_SUMMARY_DETAIL_V1` rollback flag.

## Validation

- TypeScript: pass.
- Unit regression: 63/63 pass, including three new Today tests.
- Feature ESLint: no feature errors; one existing Fast Refresh advisory from mixed helper/component exports.
- Production build with feature enabled: pass (2,521 modules, 13.30s Vite bundle).
- Playwright: all four required viewports captured; desktop page-scroll assertions and virtualisation assertions pass; 8/8 axe scans have zero serious or critical violations.

## Conditional sign-off

UI implementation, production build, deterministic data-state and accessibility automation pass. Production cutover remains conditional on authenticated real-data UAT in the deployed environment. Do not remove the legacy page yet.
