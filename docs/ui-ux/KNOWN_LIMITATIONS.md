# Known Limitations

1. Paper Trading, Futures and Administration catalogue screens lack complete governed frontend/API vertical slices and are not exposed as placeholders.
2. Google-first identity and full RBAC require a separate backend-led migration; the existing explicit Firebase/session flow remains.
3. Several legacy page modules contain specialised dark visualisations. The V2 compatibility layer covers shared workspace surfaces; individual complex chart palettes require measured page-by-page migration.
4. Repository-wide lint has pre-existing failures outside this change. Type-check and production build are the blocking compile gates for this delivery; lint debt is recorded rather than suppressed.
5. Automated accessibility checks cannot certify screen-reader usability; manual audit is still required before claiming full WCAG conformance.
