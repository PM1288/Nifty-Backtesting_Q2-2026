# Open Issues

## Release blockers found in Phase 0

| ID | Severity | Issue | Evidence | Required resolution |
|---|---|---|---|---|
| UIX-001 | Resolved harness issue | The Phase 0 HTTP API request context did not send the production Secure session cookie. | Public HTTPS browser `/v1/workspace/paper-trading` returns 200 after authenticated login. | Use the public HTTPS or a TLS test origin for authenticated evidence; do not weaken Secure cookie policy. |
| UIX-002 | Resolved | A broad idle prefetch burst hit unrelated heavy endpoints and amplified transient restart 500/502 responses. | Final canonical 24/24 and responsive 118/118 contain no first-party API/console errors. | Retain active-route/intent prefetch. |
| UIX-003 | Resolved for canonical workspaces | Transport health and analytical readiness were conflated. | Typed `ModuleQualityState`, stream lifecycle and module-specific displays separate all three layers. | Extend the same contract to any future specialist module. |
| UIX-004 | Resolved | Light deployed theme was layered over dark/neon root semantic tokens. | Canonical Phase 1A light tokens and screenshots. | Enforce token usage during remaining page consolidation. |
| UIX-005 | Medium | Backtesting evidence is semantically linked through OIIS Lab but still uses several physical legacy route components instead of one selected-run component. | Route matrix and implementation status. | Consolidate the remaining selected-run UI without changing result contracts. |
| UIX-006 | Medium | Some legacy specialist raw-data routes still require a dedicated virtualization/heap audit even though canonical pages are shortlist-first. | 186 F&O, 300 stock insight, 1,615 run historical datasets. | Complete the Phase 13 multi-hour/large-list audit. |
| UIX-007 | Medium | The production env file contains CRLF and unquoted values, so it cannot be safely sourced as a shell script. | Baseline harness setup. | Do not source it; configuration loader is authoritative. Document/normalise separately through operations. |
| UIX-008 | Security review | Existing client writes queued analytics actions to localStorage. No credential was observed, but the storage/security scope must be reviewed. | `AuthGateProvider.tsx`. | Verify only non-sensitive bounded analytics metadata is retained and clear it on sign-out/session expiry. |
| UIX-009 | Security | `npm` reports 13 inherited dependency findings during the production build: 8 moderate, 3 high and 2 critical. | Phase 1A Docker build. | Audit exact dependency paths and remediate without blind major-version upgrades. |
| UIX-010 | Release evidence | Manual screen-reader, forced-colours and critical-flow 400% zoom evidence is not complete. Automated axe is clean. | Phase 14A evidence. | Complete manual assistive-technology matrix before claiming full WCAG conformance. |
| UIX-011 | Performance evidence | Multi-hour browser soak and cross-engine p95 measurements are not complete. | Performance evidence. | Run session soak and Chromium/Firefox/WebKit timing matrix. |
| UIX-012 | Optional feature | Home historical replay and automated wallboard lens cycling are not implemented. | Phase 3 status. | Add only from real historical event/snapshot sources; do not interpolate financial values. |

## Repository preservation note

The working tree contained substantial pre-existing modified and untracked files before this assignment. They are user-owned and must not be reset, overwritten wholesale or attributed to this transformation. Initial HEAD: `6d69762bf0c6965517298b764c88c29c59cc35ae`.
# Navigation interaction lint baseline — 2026-08-12

The production build, typecheck and focused/new tests pass, but the repository-wide web ESLint command remains red because the pre-existing application contains a large backlog of `no-explicit-any`, unused legacy route imports and a conditional-hook error in legacy Backtesting Chrome. This was recorded rather than relabelled as a warning. The navigation upgrade removed the new unused imports it exposed; repairing the unrelated lint estate requires a separately scoped cleanup because broad mechanical edits across analytical pages would increase regression risk.
