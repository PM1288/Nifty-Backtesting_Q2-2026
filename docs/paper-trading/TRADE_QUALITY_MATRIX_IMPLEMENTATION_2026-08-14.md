# Paper Trading Trade Quality Matrix — implementation record

Date: 2026-08-14
Environment: production PAPER workspace
Policy: `n50-trade-quality@1.0.0`

## Outcome

The reference ZIP under `/home/novius2/NIFTY50/trade--quality` was integrity-tested and extracted to:

`/home/novius2/NIFTY50/trade--quality/trade_quality_matrix_ui_bundle`

Reviewed artefacts:

- `README_trade_quality_matrix.md`
- `trade_quality_matrix_ui.html`
- `trade_quality_matrix_preview.png`

The visual hierarchy was adapted into the authenticated Paper Trading `What good looks like` tab. The production implementation includes a trade selector, process/outcome matrix, score and evidence KPIs, criterion-level evidence, the complete cash/options factor policy, hard-risk overrides, and an admin-only durable evidence review.

Dashboard:

`https://n50.nifty50today.co.in/n50/paper-trading`

Open **What good looks like**.

## Critical package review

The prototype was useful as a visual reference but could not be deployed directly:

- It preloaded illustrative scores, which could make missing evidence look assessed.
- It stored reviews only in browser `localStorage`.
- Browser calculations were treated as authoritative.
- It had no authentication, CSRF, RBAC, audit, PostgreSQL persistence, trade linkage, or entry-time evidence gate.
- It did not distinguish a missing legacy process record from a rating of zero.

Production corrections:

- No demo rating is loaded.
- Blank evidence stays `NOT_ESTIMABLE`.
- The server is the scoring authority.
- Only administrators can save a review.
- Reviews are CSRF-protected, append-only, linked to a paper trade and written to `request_audit`.
- Retrospective process ratings count only when the reviewer explicitly confirms the evidence existed at or before entry.
- Outcome evidence can mature independently after execution closes.
- Confirmed hard-risk flags override profit with `BAD_RISK`.
- No Paper execution, broker-order, target, P&L, notification or observation-lifecycle semantics were changed.

## Scoring and governance

- Cash equity: 55 process + 45 outcome.
- Options: 60 process + 40 outcome.
- Rating: 0–5; weighted points = weight × rating / 5.
- Matrix process gates: 75% cash, 80% options.
- Matrix outcome gate: 65%.
- Complete total requires a closed trade, at least 80% process coverage, complete critical-risk evidence and at least 70% outcome coverage.
- Hard-risk catalogue: 12 cash and 16 options overrides.
- Process/outcome distinctions include valid loss, lucky winner, good high/medium/low, bad, bad-risk and data-invalid states.

## Additive database model

Migration: `services/paper_trading/migrations/010_trade_quality_reviews.sql`

- `paper_trading.trade_quality_reviews`: append-only administrator evidence revisions.
- `paper_trading.v_trade_quality_review_latest`: latest review per trade and policy version.
- `supersedes_review_id`: immutable revision chain.
- `ratings`: explicit factor ratings only; omitted factors stay unknown.
- `entry_evidence_confirmed`: leakage guard for process ratings.
- `hard_fail_flags`: validated against the asset-class policy.
- reviewer identity, evidence note and timestamp are retained.

The existing V1 audit tables remain canonical:

- `trade_quality_policies`
- `trade_quality_assessments`
- `trade_quality_criteria`
- `v_trade_quality_latest`

## API

- `GET /v1/trade-quality/policy`
- `GET /v1/workspace/paper-trading`
- `POST /v1/workspace/paper-trading/trades/{tradeGroupId}/quality-review`

The new POST route is authenticated, administrator-only, CSRF-protected, strict-schema validated and audited. Unknown criterion or hard-fail IDs are rejected.

OpenAPI was regenerated and validated. Archive:

`/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip`

The archive contains a strict `TradeQualityReviewRequest` schema and documents the entry-time evidence rule.

## Historical evaluation

Command:

```bash
docker exec trading-stack-novius2-n50-dashboard-1 node apps/api/dist/scripts/backfillTradeQuality.js
```

Result:

```json
{"policyVersion":"1.0.0","tradesRead":24,"assessmentsWritten":24}
```

Database reconciliation after the run:

- Paper trade groups: 24
- Durable assessment snapshots: 59
- Criterion rows: 1,003
- Latest classifications: 24 `NOT_ESTIMABLE`
- Manual quality reviews: 0
- Migration 010 rows: 1

Seventeen equity position rows are currently visible in the Paper workspace. All 17 remain `NOT_ESTIMABLE`, correctly, because their legacy entry-time decision evidence was not captured. They nevertheless show every criterion and its current evidence state. An administrator may review source evidence, but the system does not invent or infer missing process quality.

## Files changed

- `neon-stock-terminal/apps/api/src/lib/tradeQuality.ts`
- `neon-stock-terminal/apps/api/src/lib/tradeQuality.test.ts`
- `neon-stock-terminal/apps/api/src/routes/workspace.ts`
- `neon-stock-terminal/apps/api/src/scripts/backfillTradeQuality.ts`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.tsx`
- `neon-stock-terminal/apps/web/src/pages/PaperTradingCommandCenter.module.css`
- `services/paper_trading/migrations/010_trade_quality_reviews.sql`
- `services/paper_trading/tests/test_migration.py`
- `services/paper_trading/docs/database-schema.md`
- `tools/playwright/trade-quality-regression.mjs`
- `backend-openapi-documentation-2026-08-13/generate_openapi.py` and generated specifications

## Validation evidence

- API typecheck: pass.
- Web typecheck: pass.
- Production web build: pass (2,484 modules).
- API suite: 90/90 pass.
- Focused trade-quality and Paper projection tests: 11/11 pass.
- Migrations 001–010 executed twice in disposable schema `paper_trade_quality_test_20260814`: pass; three quality tables found; schema removed.
- Live migration 010: pass.
- Backfill: 24/24 trade groups assessed.
- Production `n50-dashboard`: healthy.
- Chromium authenticated desktop/mobile/backtesting regression: pass.
- CSRF-negative review test: pass (write rejected; no review inserted).
- Mobile horizontal overflow: none.
- OpenAPI: 18 specifications, 290 catalog operations, zero validation errors.
- ZIP integrity: pass; duplicate archive names: zero.

Screenshots:

- `docs/ui-ux-transformation/screenshots/trade-quality-2026-08-14/paper-trade-quality-desktop.png`
- `docs/ui-ux-transformation/screenshots/trade-quality-2026-08-14/paper-trade-quality-mobile.png`
- `docs/ui-ux-transformation/screenshots/trade-quality-2026-08-14/backtesting-trade-quality-desktop.png`

Known browser console noise is limited to eight blocked Microsoft Clarity analytics requests; application console errors were zero.

## Deployment and rollback

Targeted pre-deployment backup:

`/home/novius2/backups/trade-quality-matrix-20260814-125043`

Rollback:

1. Restore only the backed-up dashboard/API files.
2. Rebuild and recreate only `n50-dashboard`.
3. Leave migrations 009/010 and audit records intact; they are additive and inert for the previous UI.
4. Do not delete assessment or review records.

The first migration command accidentally used the default Compose project name and tried to create a second PostgreSQL container. Port binding failed before migration; the newly created stopped container was removed, then migration was run successfully against `trading-stack-novius2`. No production database was duplicated or replaced.

## Safety confirmation

- No live broker order was placed.
- No paper order, target or close was created during testing.
- No quality review was inserted during the browser test.
- No production record was deleted.
- Existing paper calculations and notifications remain unchanged.
