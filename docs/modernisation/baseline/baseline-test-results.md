# Baseline test results

Captured: 2026-08-09 UTC

| Check | Result | Evidence |
|---|---|---|
| Protected SmartAPI Go package | PASS | `go test ./internal/smartapi ./internal/config`; SmartAPI package passed, config compiles with no test files |
| Current Compose rendering | PASS | `docker compose ... config -q` with base, paper and OIIS overlays |
| Host Nginx syntax | PASS | `nginx -t` |
| N50 health through Nginx | PASS | `/n50/health` returned ready |
| Gateway-root health | BASELINE FAIL | `/health` returned HTTP 404 |
| Paper API liveness | PASS | `environment=PAPER` |
| Paper API readiness | PASS/DEGRADED | ready; migration `002_target_lifecycle`; notification health degraded but allowed |
| Paper OpenAPI | PASS | `Universal Paper Trading API`, version 1.0.0 |
| Existing N50 API suite | PASS | 57/57 tests immediately before branch creation at the same source commit |
| N50 API TypeScript typecheck | PASS | 6.35 s, peak RSS 528,372 KiB |
| N50 web TypeScript typecheck | PASS | 11.01 s, peak RSS 463,720 KiB |
| N50 API test rerun | PASS | 57/57 in 2.49 s, peak RSS 148,324 KiB |
| N50 API production build | PASS | 6.40 s, peak RSS 537,256 KiB |
| N50 web production build | PASS | 19.76 s, Vite phase 8.73 s, peak RSS 738,084 KiB |
| N50 web build size | PASS/BASELINE | 4.4 MiB; largest JS chunks are Firebase 447.9 KiB and ECharts 437.5 KiB before gzip |
| Analytics-worker backtesting tests | PASS | 6 tests in 0.78 s using the existing StratLab Python environment |
| StratLab full test suite | PASS | 94 tests in 4.50 s, peak RSS 268,416 KiB |
| Independent exit/ladder/H30 subset | PASS | 31 tests; confirms existing governed diagnostic contracts before UI integration |
| Root package-manager scripts | BASELINE FAIL | root scripts require `corepack pnpm`; host Node 18 package lacks `corepack`, while the production Dockerfile actually uses Node 20 plus npm/package-lock |
| Stock Selection browser audit | PASS | desktop/laptop/tablet/mobile, zero console errors at the same source commit |

This is a safety/characterisation baseline, not the complete Phase 1 functional
or performance suite. No SmartAPI order endpoint was invoked.

The repository currently carries both `package-lock.json` and `pnpm-lock.yaml`.
The production Dockerfile proves npm/package-lock is authoritative today, but
the root scripts invoke pnpm. This is a reproducibility defect to correct in a
small isolated dependency-tooling batch; no package-manager switch was made
during baseline capture.
