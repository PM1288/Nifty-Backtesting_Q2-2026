# Positioning & Flow acceptance report v1.0

Date: 12 September 2026

Input: `/home/novius2/NIFTY50/Test/test/Positioning_Flow_Acceptance_20260912_v1_0.json` and its companion ZIP

Branch: `feat/positioning-flow-acceptance-v1-20260912`

## Outcome

This is an evidence report, not a blanket claim that all 82 requirements pass.
The repair enforces matched Price/OI windows, valid interval-volume counters,
versioned L0/L1 activity scores with exact fallback, spot-correct/gap-safe zones,
explicit dataset coverage, participant activity shares/residual caveats and
complete quality-aware exports. It adds no collector, order path or strategy
rule.

Retained production data at the audit cutoff:

| Family | Rows | Dates | Range |
|---|---:|---:|---|
| Participant OI | 125 | 25 | 2026-03-02 to 2026-09-11 |
| Participant volume | 120 | 24 | 2026-03-02 to 2026-09-11 |
| FII statistics | 229 | 25 | 2026-03-02 to 2026-09-11 |
| NIFTY chain snapshots | 1,534 | 4 | 2026-09-08 to 2026-09-11 |

The four-date chain history is insufficient for the requested 60-session pilot,
matched RVOL, durable persistence or leakage-safe historical level evaluation.
Those requirements remain BLOCKED rather than being filled with EOD or fixture
data.

## Requirement disposition

| Status | IDs | Evidence / blocker |
|---|---|---|
| PASS | PF-001, PF-002, PF-005, PF-011, PF-012, PF-013, PF-015–PF-018, PF-020–PF-022, PF-025–PF-036, PF-042–PF-044, PF-050–PF-052, PF-054–PF-059, PF-062, PF-066–PF-070, PF-073–PF-077, PF-079–PF-082 | Existing collector reused; parser rejects challenge/unknown labels; matched-window and counter fixtures; participant/market separation; L0/L1 rules; compact matrix/bubble/export implementation, full web/API gates, authenticated desktop/narrow browser checks and read-only guards. |
| BLOCKED | PF-003, PF-004, PF-006–PF-010, PF-014, PF-019, PF-023, PF-024, PF-037–PF-041, PF-045–PF-049, PF-053, PF-060, PF-061, PF-063–PF-065, PF-071, PF-072, PF-078 | Actual exchange-calendar backfill, immutable artifact/revision manifests, date-effective lots, fixed-cohort historical chain, availability timestamps, RVOL/persistence/delta files, frozen pre-session zones, censored outcomes and production performance evidence are absent or require more retained history. |
| NOT_RUN | None | Browser-dependent work is explicitly BLOCKED until the scoped release run rather than counted as passed by the build. |

No requirement is marked PASS solely because TypeScript compiled. The original
acceptance JSON is preserved unchanged with its source `NOT_RUN` labels.

## Deterministic evidence

- Reference package: 47/47 tests pass.
- Web focused Positioning & Flow tests: matched-window price arithmetic,
  missing-safe ratio, L0/L1 fallback, spot-side roles, actual spacing and outcome
  rules pass.
- API focused tests: same-snapshot price/OI baseline, `10650-10400=250`, counter
  reset and cross-session unavailability pass.
- NSE report service: 40/40 tests pass in an isolated built image; unexpected
  participant labels now generate a validation error while the raw artifact path
  remains in the backfill manifest.

## Rerun

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck && npm test && npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck && npm test && npm run build

cd /home/novius2/trading-stack
docker build -t nse-fii-reports-service-positioning-test services/nse_fii_reports_service
docker run --rm -v "$PWD/services/nse_fii_reports_service/tests:/app/tests:ro" \
  nse-fii-reports-service-positioning-test sh -lc \
  'pip install -q pytest httpx && pytest -q /app/tests'
bash scripts/verify/canonical-repository-gate.sh
```

## Deployment

Production deployment completed through the scoped service paths:

- dashboard container `bfb7cd43ef64...` is healthy on image
  `sha256:9023d28edc6...`; final entry asset is
  `/n50/assets/index-CeEP4k9n.js`;
- report-service container `7bab001a29a8...` runs image
  `sha256:641e97c5f9d...`; `/health` reports the scheduler running, latest report
  date 11 September 2026 and no last error;
- authenticated browser regression passes 23/23 at desktop and narrow
  viewports. Evidence is outside Git at
  `/tmp/positioning-flow-acceptance-v1-production-final2-20260912`.

Nothing was deployed to order, strategy, notification or broker-permission
services.
