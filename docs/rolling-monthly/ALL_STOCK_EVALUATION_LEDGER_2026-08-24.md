# Monthly and Rolling Strategy — All-Stock Evaluation Ledger

Date: 24 August 2026
Deployment: `trading-stack-novius2`
Scope: Absolute Monthly Closure and Rolling 5/30/60 research only

## Outcome

The candidate-only presentation defect is fixed. Both strategy pages can now show the complete governed universe and explain why each non-selected stock failed.

- Absolute Monthly Closure exposes the existing historical `rolling_monthly.evaluation_ledger`.
- Rolling 5/30/60 now persists a latest-session all-stock decision ledger in `rolling_monthly.rolling_window_evaluation`.
- Candidate and performance calculations remain unchanged.
- No paper order, live order or backend execution contract was changed.

## Root cause

The dashboard APIs returned selected candidate tables only. The Absolute Monthly all-stock ledger already existed in PostgreSQL but was not included in the API response. Rolling 5/30/60 had no rejected-symbol persistence at all, so rejection explanations were lost after scanning.

## Live data evidence

### Absolute Monthly Closure

The historical ledger contains 9,648 evaluations across 36 monthly periods:

| State | Rows | Distinct symbols | Period |
|---|---:|---:|---|
| Selected | 1,114 | 267 | 2023-09 to 2026-08 |
| Rejected | 7,756 | 268 | 2023-09 to 2026-08 |
| Incomplete | 778 | 67 | 2023-09 to 2026-06 |

For August 2026 the ledger contains exactly 268 evaluated stocks: 40 selected and 228 rejected.

### Rolling 5/30/60

The rerun used daily data through `2026-08-24` and evaluated exactly 268 governed-universe stocks:

| State | Stocks |
|---|---:|
| Newly selected | 3 |
| Qualified continuation, no duplicate entry | 2 |
| Rejected | 263 |
| Incomplete | 0 |

The historical selected-opportunity table remains intact with 5,073 transition opportunities over the three-year run.

## User interface

Monthly Strategy now provides:

- `Selection`: Selected entries, Not selected, Incomplete data, All evaluated stocks.
- `Failure reason`: every persisted failed condition.
- `Entry method`, year, month, EMA9 and stock-universe filters.
- First rejection reason directly in the table row.
- Full condition-by-condition pass/fail evidence and all rejection reasons in the stock inspector.

Rolling Strategy now provides:

- `Population`: historical opportunities, latest all-stock review, newly selected, qualified continuation, not selected and incomplete.
- `Failure reason`: every failed rolling condition.
- First rejection reason directly in the row.
- Full seven-condition trace and rejection explanation in the stock inspector.

## Code and schema changes

- `db/sql/052_rolling_window_evaluation_ledger.sql`
- `services/rolling_monthly/src/rolling_monthly/rolling_window.py`
- `services/rolling_monthly/src/rolling_monthly/service.py`
- `services/rolling_monthly/tests/test_rolling_window.py`
- `neon-stock-terminal/apps/api/src/routes/rollingMonthly.ts`
- `neon-stock-terminal/apps/api/src/routes/rollingWindow.ts`
- `neon-stock-terminal/apps/api/src/routes/rollingMonthly.test.ts`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.tsx`
- `neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.module.css`
- `neon-stock-terminal/docs/openapi/monthly-and-rolling-strategy.openapi.yaml`
- `tools/playwright/monthly-all-stock-ledger-regression.mjs`

## Validation

- Rolling worker tests: 22 passed.
- Monthly API route tests: 8 passed.
- API and web TypeScript checks: passed.
- Production Docker builds: passed.
- OpenAPI YAML parse: passed.
- Authenticated Playwright regression: 12/12 checks passed.
- Browser validation confirmed 268 Absolute evaluations and 268 Rolling evaluations.
- Browser validation confirmed rejection filters, reason filters, drill-down explanations and no viewport-level overflow at 1920 px.

Evidence:

- `output/playwright/monthly-all-stock-ledger-20260824/results.json`
- `output/playwright/monthly-all-stock-ledger-20260824/monthly-rejected-with-reasons.png`
- `output/playwright/monthly-all-stock-ledger-20260824/rolling-rejected-with-reasons.png`

## Backfill and scheduled refresh

Executed:

```bash
docker compose --env-file .env -p trading-stack-novius2 \
  -f docker-compose.yml -f compose/compose.rolling-monthly.yml \
  run --rm --no-deps rolling-monthly backfill-rolling --months 36
```

Result:

```json
{"strategy_version":"rolling_5_30_60_bullish_long_v1","years":3,"candidate_count":5073,"evaluation_count":268,"source_end_date":"2026-08-24","universe_size":268}
```

The same ledger replacement is part of each normal rolling-worker transaction, so future scheduled refreshes update candidates and all-stock evaluations atomically.

## Backup and rollback

Pre-change backup:

`/home/novius2/trading-stack/backups/monthly-all-stock-ledger-20260824T1740Z`

Database dump SHA-256:

`1ee26356dafcc35f5caa639c634e1481d66d403de7adf8f46d30728a57e3a66c`

The previous dashboard image is tagged:

`trading-stack-n50-dashboard:pre-all-stock-ledger-20260824`

The previous rolling worker container is retained stopped as:

`trading-stack-novius2-rolling-monthly-pre-all-stock-20260824`

Rollback should restore the backed-up source files and image/container. The new table is additive and does not need to be dropped for application rollback.
