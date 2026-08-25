# Paper Trading Evidence Workbench V2 known limitations

1. The canonical workspace API currently has a measured 2,524.3 ms median across five server-local production samples; backend profiling is required to meet the proposed 1.5-second target.
2. The current 35-row native semantic table does not require virtualisation. A virtualised implementation remains required before substantially larger populations are accepted.
3. Existing SVG reward/pain and factor surfaces remain preserved, but lasso/box selection and a complete colocated underlying-data grid are not yet implemented.
4. Saved-view support currently uses bounded browser-local state. A server-persisted multi-view catalogue is not implemented.
5. CSV export is implemented; a Paper-specific PDF/screen export is not.
6. Structural and keyboard accessibility checks pass, but axe, screen-reader, forced-colours, complete 400% zoom and cross-engine manual evidence remain incomplete.
7. The performance run is a five-sample check, not a full market-session soak.
8. The existing dependency tree still reports 17 findings during image build: 13 moderate, 3 high and 1 critical. V2 added no dependency.
9. The metric inventory maps the complete displayed product surface and grouped response fields; lower-level database columns not exposed by the canonical workspace contract remain documented in the wider PostgreSQL schema inventory rather than duplicated here.
