# Backfill validation

Bootstrap range: 11–25 August 2026, the earliest interval with governed 30-minute OIIS snapshots and point-in-time derivative coverage. Expected and actual: 11 trading sessions × 12 official scans = **132 scans**.

| Measure | Result |
|---|---:|
| Stock observations | 27,456 |
| Distinct symbols | 208 |
| Actionable observations | 11 |
| Rejected/no-chase/data-insufficient | 27,439 |
| Developing watch/wait | 6 |
| Forward outcome rows | 27,456 |
| Outcomes not yet mature/available | 2,496 |
| Point-in-time option contracts selected | 5,782 |
| Leakage violations | 0 |
| Duplicate run/symbol rows | 0 |

Validation result: **PASS**. The low action rate is accepted; the framework is not tuned to force trades.

Validation gates: exact scan count, 208-stock source universe per governed scan, unique run/symbol, source timestamp not after scan, separate forward outcomes, option quote at/before scan and explicit insufficient states. Current-universe replay is marked `SURVIVORSHIP_BIAS_POSSIBLE` because point-in-time F&O membership cannot be reconstructed.
