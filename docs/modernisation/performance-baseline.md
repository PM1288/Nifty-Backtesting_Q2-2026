# Performance baseline

Captured: 2026-08-23 UTC. Representative source: authenticated local production gateway at `127.0.0.1:19090/n50` with the existing production database.

| Path | Run | HTTP | Duration | Payload/result |
| --- | ---: | ---: | ---: | --- |
| `/v1/workspace/paper-trading` | 1 | 200 | 5,961 ms | 769,962 bytes |
| `/v1/workspace/paper-trading` | 2 | 200 | 3,461 ms | 769,962 bytes |
| `/v1/workspace/paper-trading` | 3 | 200 | 3,271 ms | 769,962 bytes |
| `/v1/workspace/futures` after repair | 1 | 200 | 212 ms | 379 contracts; 120 participant rows |

The Paper samples are sequential smoke measurements, not p95 evidence. The endpoint remains a synchronous aggregation of critical state, detailed ledger and heavy analytical simulations. Phase C must split snapshot/summary, ledger/detail and analytics, then load-test with three concurrent authenticated users.

Prior audit baseline remains available at `docs/trading-app-audit/evidence/runtime-audit.json` and `docs/trading-app-audit/evidence/calculation-validation.json`.
