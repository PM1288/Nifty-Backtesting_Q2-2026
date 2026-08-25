# Paper Trading 0.4% Target and Newest-First Sort Fix

Date: 17 August 2026
Production route: `https://n50.nifty50today.co.in/n50/paper-trading`

## Outcome

The contradictory evidence was real and has been corrected. Older OIIS paper intents created an
intraday target ladder containing `0.3%, 0.5%, 1.0%`, while the UI consistently presented the
standard `0.3%, 0.4%, 0.5%, 1.0%` ladder. The absent 0.4% track therefore appeared pending even
after 0.5% had been hit.

The paper service now enforces the complete equity ladder at its own boundary, independently of an
upstream producer flag. The OIIS producer contract also emits 0.4% explicitly. Existing equity
trades received an additive, idempotent 0.4% target track. If a higher target was hit, the lower
target was finalised using monotonic evidence at the higher target's first-hit timestamp.

The complete-trade-evidence table now defaults to entry date descending (`NEWEST`), so the newest
trade is always the first row unless a user deliberately selects another sort.

## Live reconciliation for 17 August 2026

| Symbol | Entry IST | 0.3% | 0.4% | 0.5% | 1.0% |
|---|---:|---|---|---|---|
| APLAPOLLO | 15:05 | Not hit | Not hit | Not hit | Not hit |
| NAUKRI | 13:04 | Hit 13:04 | Not hit | Not hit | Not hit |
| BAJAJ-AUTO | 10:03 | Hit 11:30 | Hit 11:31, inferred monotonically | Hit 11:31 | Not hit |
| SHREECEM | 09:33 | Hit 10:46 | Hit 11:31, inferred monotonically | Hit 11:31 | Not hit |

This is mathematically consistent: a direction-normalised path that reaches +0.5% necessarily
crosses +0.4%. Inference does not invent a better timestamp; it uses the first known higher-target
timestamp as the conservative proof time.

## Changed implementation

- `services/paper_trading/src/papertrade/contracts.py`
  - Standard intraday defaults now include `0.004`.
- `services/paper_trading/src/papertrade/service.py`
  - Equity intent/group creation always expands the governed default ladder, even if an upstream
    payload incorrectly disables default expansion.
- `services/oiis_live/src/oiis_live/main.py`
  - OIIS paper payload explicitly includes `0.004`.
- `services/paper_trading/migrations/012_intraday_040_monotonic_backfill.sql`
  - Additive, idempotent target-definition/track backfill and monotonic repair.
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
  - Default sort changed to `NEWEST`; selector label is `Entry date · newest first`.
- Paper service OpenAPI and inbound JSON schemas
  - Default ladder documentation now includes `0.004`.
- Tests
  - Domain default, migration idempotency, producer contract and authenticated browser assertions.

Equivalent runtime files were deployed to `/home/novius2/trading-stack`. No execution fill, P&L,
cost, tax, close, paper-order or analytical-price formula was changed.

## Validation evidence

- Paper service focused tests: `16 passed`.
- OIIS producer contract: `4 passed`.
- Web component suite: `27 passed`.
- Web TypeScript check: passed.
- Web production build: passed.
- Migration applied twice in a disposable schema: one migration record, no duplicates.
- Production migration record: `012_intraday_040_monotonic_backfill` present once.
- Authenticated production Playwright: `105/105 passed` across desktop, laptop, tablet and mobile.
- OpenAPI: `18 specifications`, `596 operations`, zero validation errors.
- Production paper API and dashboard containers: healthy; restart count zero after deployment.

Browser screenshots and result JSON:

`/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/output/playwright/paper-target-040-sort-20260817`

Updated OpenAPI package:

`/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-17.zip`

## Backup and rollback

Pre-migration database backup:

`/home/novius2/trading-stack/backups/paper-target-040-20260817/paper_trading_before_012.dump`

Rollback of presentation is the prior dashboard image/source backup. The database migration is
intentionally additive: retain the audit/target evidence rather than destructively deleting it.
If application rollback is required, restore only the prior paper API/dashboard images. Existing
paper trades and all execution records remain valid.

## Useful reruns

```bash
cd /home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13
python3 generate_openapi.py
python3 validate_openapi.py

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
node tools/playwright/paper-trading-regression.mjs
```

The Playwright rerun requires `PLAYWRIGHT_ADMIN_PASSWORD` to be supplied through the deployment
secret environment; it must not be written into source or this report.
