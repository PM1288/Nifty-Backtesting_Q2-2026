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

Authenticated production Playwright passed **25/25** checks across the 13 URL-addressable lenses, 208-row radar, immutable 31-section contract, execution inspector, API history, JSON export and multi-sheet Excel export. Visual evidence is retained in the ignored runtime directory `output/playwright/oiss-v1-live-20260825-final/`.
