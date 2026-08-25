# Accuracy and data quality

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Confidence rubric

- **HIGH CONFIDENCE**: canonical source, explicit timestamp, deterministic formula, independent sample reconciliation, and tested missing/stale handling.
- **MEDIUM CONFIDENCE**: source and formula traced, but independent reconciliation or point-in-time completeness is incomplete.
- **LOW CONFIDENCE**: fallback/interpolation/current-universe bias/material missing history may affect results.
- **UNVERIFIED**: a required source, timestamp, formula, or runtime state could not be proven.

## Known evidence-backed risks

1. Historical current-universe strategy analyses can contain survivorship bias without point-in-time universe membership.
2. Yahoo split-adjusted research OHLC and raw broker/exchange execution values have different price bases.
3. Multiple refresh intervals mean request freshness and data freshness are not equivalent.
4. Any UI fallback that converts null/missing to zero can misstate neutrality; occurrences require manual review.
5. MFE is an observed extreme, not necessarily an executable fill.
6. Same-bar conditions must not be paired with an earlier open fill; strategy-specific timing tests are required.

## Sample validation table

Runtime calculation samples are written by the audit to `evidence/calculation-validation.json`. Until populated, the result is **UNVERIFIED**, not PASS.

<!-- RUNTIME_AUDIT_START -->
## Independent runtime calculation samples

Source timestamps: overview `2026-08-23T11:09:56.423Z`; heatmap `2026-08-23T11:09:29.119Z`; paper `2026-08-23T11:11:03.153Z`.

| Check | Page | API/UI value | Independent value | Difference | Tolerance | Result | Scope note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| overview-change-UNOMINDA | Home / Overview | 0.36 | 0.3570011900039667 | 0.00299881 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-BHARATFORG | Home / Overview | 0.05 | 0.04849660523763337 | 0.00150339 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-TVSMOTOR | Home / Overview | 0 | 0 | 0 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-HEROMOTOCO | Home / Overview | -0.1 | -0.09581046947130041 | -0.00418953 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-MOTHERSON | Home / Overview | -0.12 | -0.11793843613634687 | -0.00206156 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-HYUNDAI | Home / Overview | -0.37 | -0.36820835204309915 | -0.00179165 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-M&M | Home / Overview | -0.37 | -0.36790469516469176 | -0.0020953 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-EICHERMOT | Home / Overview | -0.4 | -0.39791096742103954 | -0.00208903 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-TMPV | Home / Overview | -0.73 | -0.7338017174082819 | 0.00380172 | 0.011 | PASS | Percentage change from API last and previousClose. |
| overview-change-BAJAJ-AUTO | Home / Overview | -0.79 | -0.7886034088018317 | -0.00139659 | 0.011 | PASS | Percentage change from API last and previousClose. |
| paper-combined-gross | Paper Trading | 86077.74999999999 | 86077.74999999999 | 0 | 0.011 | PASS | Backend declares REALISED_GROSS_PLUS_OPEN_UNREALISED_GROSS. |
| paper-quality-average | Paper Trading | 66 | 66.38399999999999 | -0.384 | 0.51 | PASS | Summary rounds the mean to an integer. |
| paper-analytical-upside | Paper Trading | 1104749.2501189194 | 1104749.2501189194 | 0 | 0.02 | PASS | Observed 30-session MFE opportunity; not executable/booked P&L. |
| paper-current-return-165d8bd1-e7aa-4986-a46b-08dc0e763204 | Paper Trading | 0.008568368439842914 | 0.008568368439842832 | 0 | 0.000001 | PASS | SWIGGY; direction-normalised current return ratio. |
| paper-entry-notional-165d8bd1-e7aa-4986-a46b-08dc0e763204 | Paper Trading | 511182.50000000006 | 511182.50000000006 | 0 | 0.02 | PASS | SWIGGY; entry price × opened quantity. |
| paper-current-return-e855748e-3f25-4fc1-8a42-aa4f2b9af492 | Paper Trading | 0.004901960784313725 | 0.004901960784313796 | 0 | 0.000001 | PASS | ETERNAL; direction-normalised current return ratio. |
| paper-entry-notional-e855748e-3f25-4fc1-8a42-aa4f2b9af492 | Paper Trading | 791520 | 791520 | 0 | 0.02 | PASS | ETERNAL; entry price × opened quantity. |
| paper-current-return-071e7b0f-bb8b-4fb5-8d41-8c680c4c1823 | Paper Trading | -0.005614527590139486 | -0.005614527590139486 | 0 | 0.000001 | PASS | PERSISTENT; direction-normalised current return ratio. |
| paper-entry-notional-071e7b0f-bb8b-4fb5-8d41-8c680c4c1823 | Paper Trading | 712437.5 | 712437.5 | 0 | 0.02 | PASS | PERSISTENT; entry price × opened quantity. |
| paper-current-return-82399a8f-fa3f-41fd-918b-a607cfd50027 | Paper Trading | -0.0012277749988631713 | -0.0012277749988632955 | 0 | 0.000001 | PASS | LUPIN; direction-normalised current return ratio. |
| paper-entry-notional-82399a8f-fa3f-41fd-918b-a607cfd50027 | Paper Trading | 934617.5 | 934617.5 | 0 | 0.02 | PASS | LUPIN; entry price × opened quantity. |
| paper-current-return-fa89ac92-a75c-4f63-b884-799ace5af9d5 | Paper Trading | 0.0004042037186742118 | 0.0004042037186742118 | 0 | 0.000001 | PASS | DIXON; direction-normalised current return ratio. |
| paper-entry-notional-fa89ac92-a75c-4f63-b884-799ace5af9d5 | Paper Trading | 742200 | 742200 | 0 | 0.02 | PASS | DIXON; entry price × opened quantity. |
| paper-current-return-b2c3e5d8-e4d1-446c-a469-2e774457f067 | Paper Trading | 0.004695304695304695 | 0.0046953046953046845 | 0 | 0.000001 | PASS | GMRAIRPORT; direction-normalised current return ratio. |
| paper-entry-notional-b2c3e5d8-e4d1-446c-a469-2e774457f067 | Paper Trading | 698197.5 | 698197.5 | 0 | 0.02 | PASS | GMRAIRPORT; entry price × opened quantity. |
| paper-current-return-4645192e-7054-4c64-a304-311fc196842f | Paper Trading | 0.004440361353544633 | 0.004440361353544598 | 0 | 0.000001 | PASS | ETERNAL; direction-normalised current return ratio. |
| paper-entry-notional-4645192e-7054-4c64-a304-311fc196842f | Paper Trading | 791883.75 | 791883.75 | 0 | 0.02 | PASS | ETERNAL; entry price × opened quantity. |
| paper-current-return-0360a59c-de22-40d5-912e-94c09e2f5d30 | Paper Trading | 0.005875022253872174 | 0.005875022253872092 | 0 | 0.000001 | PASS | SWIGGY; direction-normalised current return ratio. |
| paper-entry-notional-0360a59c-de22-40d5-912e-94c09e2f5d30 | Paper Trading | 512551.25000000006 | 512551.25000000006 | 0 | 0.02 | PASS | SWIGGY; entry price × opened quantity. |
| paper-current-return-ccda56c8-6eac-4878-9f3b-be855d77deda | Paper Trading | -0.0029366522164732205 | -0.002936652216473305 | 0 | 0.000001 | PASS | APLAPOLLO; direction-normalised current return ratio. |
| paper-entry-notional-ccda56c8-6eac-4878-9f3b-be855d77deda | Paper Trading | 750855.0000000001 | 750855.0000000001 | 0 | 0.02 | PASS | APLAPOLLO; entry price × opened quantity. |
| paper-current-return-87112a80-4e69-4fa4-92cb-ea6056e0ab50 | Paper Trading | 0.02322332809498865 | 0.02322332809498857 | 0 | 0.000001 | PASS | PETRONET; direction-normalised current return ratio. |
| paper-entry-notional-87112a80-4e69-4fa4-92cb-ea6056e0ab50 | Paper Trading | 544065 | 544065 | 0 | 0.02 | PASS | PETRONET; entry price × opened quantity. |
| heatmap-latest-TVSMOTOR | Change Heatmap | 0.11 | 0.11 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-MOTHERSON | Change Heatmap | -0.21 | -0.21 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-BOSCHLTD | Change Heatmap | -0.32 | -0.32 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-HYUNDAI | Change Heatmap | -0.45 | -0.45 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-BAJAJ-AUTO | Change Heatmap | -0.68 | -0.68 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-EICHERMOT | Change Heatmap | -1.11 | -1.11 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-TMPV | Change Heatmap | -1.12 | -1.12 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-M&M | Change Heatmap | -1.16 | -1.16 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-TMCV | Change Heatmap | -1.37 | -1.37 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |
| heatmap-latest-MARUTI | Change Heatmap | -1.57 | -1.57 | 0 | 0.011 | PASS | Latest row change must reconcile to the last non-null time-series cell. |


All 43 sampled checks passed. This supports only the sampled values and formulas; unsampled trades, corporate-action handling, historical cohorts, backtest fills, and provider accuracy remain subject to their own evidence.
<!-- RUNTIME_AUDIT_END -->
