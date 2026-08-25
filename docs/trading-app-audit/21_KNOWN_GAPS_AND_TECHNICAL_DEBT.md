# Known gaps and technical debt

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

This file is intentionally conservative. Automated keyword hits are leads, not defects. They are available in [mock-placeholder-map.json](evidence/mock-placeholder-map.json).

| Severity | Finding | Evidence | Impact | Recommended verification/correction |
| --- | --- | --- | --- | --- |
| P1 | Versioned source and live integration directory can drift | Repository rule and separate live Compose path | Documentation may describe code not currently deployed | Record image identity and runtime screenshots with every audit |
| P1 | Point-in-time universe membership is not proven for all retrospective strategy results | Existing strategy evidence/caveat | Survivorship bias can inflate or alter historical candidates | Add dated constituent membership and rerun cohorts |
| P1 | Source-price adjustment basis varies by feature | Yahoo adjusted research plus raw market/execution sources | Cross-feature price comparisons may be inconsistent | Expose price basis and corporate-action handling per metric |
| P2 | Endpoint response contracts are not uniformly represented in one OpenAPI source | Express, FastAPI, and service-local specs | Contract drift and incomplete client validation | Generate/validate a merged, versioned contract |
| P2 | Polling cadences are distributed across shared hooks and pages | Hook/page intervals | Inconsistent load and freshness semantics | Centralise cadence policy while retaining source timestamps |

Additional P0/P1 findings are appended only when runtime or independent calculations provide direct evidence.

<!-- RUNTIME_AUDIT_START -->
## Runtime findings

| Severity | Issue | Evidence | Impact | Recommended correction |
| --- | --- | --- | --- | --- |
| P1 | Futures workspace API returns HTTP 500 | 4/4 viewport captures; evidence/runtime-audit.json | Futures page cannot provide its intended canonical workspace data | Diagnose the route query/server error; add fixture and authenticated integration coverage |
| P1 | Paper workspace response exceeded the slow-loading threshold | 19338 ms in evidence/calculation-validation.json | Users can remain in the explicit slow-loading state before the ledger arrives | Profile the sequential query path and connection-pool wait; record p50/p95 under representative concurrency |
| P1 | Accessibility color-contrast violation in oiis-lab | 1 node(s), desktop; evidence/accessibility/axe-results.json | Elements must meet minimum color contrast ratio thresholds | Correct the affected semantic colour token/style and rerun Axe plus manual contrast review |
| P2 | Clarity collection generates repeated CSP console errors | Runtime console evidence | Monitoring noise may obscure application errors; telemetry delivery is incomplete | Align allowed collector hosts or constrain the integration |
| P2 | Some browser errors lack request URLs | Generic 400/network-change console records | Root cause cannot be attributed safely | Capture browser request URL/body correlation in a focused rerun |


No P0 issue was proven by this audit. All four current Paper Trading captures loaded the 35-trade ledger. No issue above was modified as part of this documentation task.
<!-- RUNTIME_AUDIT_END -->
