# Monthly Strategy All-Stock Evaluation Ledger

Date: 2026-08-23

## Outcome

The canonical Monthly Strategy route (`/n50/strategy/monthly`) keeps `Selected only` as its default population. Users may switch to `All evaluated` or `Rejected / incomplete` for Absolute Monthly and Expiry methods, select a month, search a symbol, and open any row to see why it was or was not selected.

Rejected rows are audit evidence, not synthetic trades. They have no entry, P&L, MFE, MAE, or target-hit result. The UI displays `—` for those values and exposes the scanner's actual left operand, operator, right operand, pass/fail result, failed-condition codes, and rejection reasons.

## Universe and row semantics

- Universe: the point-in-time application profile union of NIFTY LargeMidcap 250 membership and NSE F&O membership.
- Current resolved universe: 268 symbols.
- Absolute Monthly: one bullish evaluation row per symbol and month (268 current rows).
- Expiry: long and short scanner evaluations are distinct; therefore 536 rows per month for the current 268-symbol universe.
- Selection states: `SELECTED`, `REJECTED`, and `INCOMPLETE`.
- Default UI population: `SELECTED`.

For Absolute Monthly, a selected row is the canonical signal candidate. For a rejected symbol/month, the ledger retains the complete in-month session with the greatest number of passed gates so the user can inspect the nearest qualifying evidence. This comparison rule does not inspect future outcomes and does not change the entry strategy.

## Data model

Migration: `db/sql/049_monthly_strategy_evaluation_ledger.sql`

Table: `rolling_monthly.evaluation_ledger`

Material fields include:

- evaluation variant, month, symbol, direction and signal date;
- selection status and selected candidate ID;
- passed, required and failed condition counts;
- failed condition codes;
- structured condition operands and results;
- rejection reasons and data-quality metadata;
- strategy and formula versions.

## API

Endpoint:

```text
GET /v1/rolling-monthly/evaluation-ledger
```

Parameters:

- `variant=absolute|expiry`
- `evaluationMonth=YYYY-MM`
- `scope=all|rejected`
- `side=ALL|LONG|SHORT`
- `search=<symbol>`

OpenAPI: `neon-stock-terminal/docs/openapi/monthly-and-rolling-strategy.openapi.yaml`, version 1.2.0.

## UI behaviour

Source: `neon-stock-terminal/apps/web/src/pages/MonthlyStrategiesPage.tsx`

- `Stock population` defaults to `Selected only`.
- `All evaluated` loads the complete month ledger.
- `Rejected / incomplete` loads only non-selected evidence.
- First-session remains selected-only because this change is scoped to Absolute and Expiry evaluation ledgers.
- Rejected and incomplete records use explicit status text and restrained row tinting.
- The inspector contains a `Selection decision` section and complete `Entry conditions` trace.
- CSV exports include selection status, side, failed-condition codes, and rejection reasons.
- The existing table header remains sticky inside its contained scroll viewport.

## Business-logic preservation

This addition does not alter:

- scanner conditions;
- selected candidate counts;
- entry or exit rules;
- target calculations;
- historical outcomes;
- paper-trading behaviour.

It adds a durable record for previously discarded non-selection decisions.

## Verification

- Rolling Monthly Python tests: 20 passed.
- API tests: 120 passed.
- Web tests: 45 passed.
- Web TypeScript and production Vite build: passed.
- OpenAPI YAML parse: passed, version 1.2.0 with five documented paths.
- Playwright regression: `tools/playwright/monthly-strategy-consolidation-regression.mjs` includes complete-ledger, rejected-row inspector, responsive layout, API-failure, and legacy-route checks.

Current persisted counts at implementation time:

- Absolute September 2023–August 2026: 36 months and 9,648 evaluation rows; the backfill exited successfully with code 0.
- Absolute August 2026: 268 evaluated, 40 selected, 228 rejected, 0 incomplete.
- Expiry February–August 2026: 536 direction-specific rows per month.
- Deployed dashboard image: `sha256:076b25cfde321983678fede2ca43b4d533993f146988a04faf680374cab38149` (healthy).

## Operations and rollback

- Migration 049 is additive and should be retained even if the UI is rolled back.
- Rolling service image: `trading-stack-rolling-monthly:2.3.0`.
- Rolling service rollback image: `trading-stack-rolling-monthly:rollback-pre-evaluation-ledger-20260823`.
- Dashboard rollback image: `trading-stack-n50-dashboard:rollback-pre-monthly-ledger-20260823`.
- Roll back the application container image without dropping the audit table.
