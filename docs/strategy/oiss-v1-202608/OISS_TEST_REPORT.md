# Test report

Automated engine tests cover DQ grade floors, critical-source override, regime boundaries, extension/TQS boundaries, sector state, H4 thresholds, direction-specific carry, status hard-gate override and lot/risk/capital sizing.

Pre-deployment results on 25 August 2026:

| Gate | Result |
|---|---:|
| OISS Python unit tests | 6 passed |
| Ruff | passed |
| API tests | 128 passed |
| API TypeScript check | passed |
| API production build | passed |
| Web tests | 54 passed |
| Web TypeScript check | passed |
| Web production build | passed |
| Canonical repository preservation gate | passed |
| Point-in-time leakage violations | 0 |
| Duplicate run/symbol rows | 0 |

The authenticated production Playwright result and deployed commit/image are recorded in `AGENT_HANDOFF.md` after release verification.
