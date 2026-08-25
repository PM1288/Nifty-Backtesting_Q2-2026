# Trade Quality Scoring V1 — Paper Trading and Backtesting

Date: 14 August 2026
Policy: `n50-trade-quality@1.0.0`
UI: `/n50/paper-trading?tab=quality`

## Outcome

The prior Paper Trading `quality_score` was an outcome-only heuristic made from MFE, MAE and first-target speed. It has been renamed `analytical_evidence_score`; it is no longer presented as entry/process quality.

The new assessment keeps three separate outputs:

1. process score from evidence available at or before entry;
2. outcome score from evidence observed after entry;
3. total score only when evidence coverage and critical-risk gates are complete.

Cash retains the requested 55/45 split. Options retains the requested 60/40 split. Every criterion uses a 0–5 rating and `weight × rating ÷ 5` points. A confirmed critical risk failure produces `BAD_RISK` regardless of profit.

## Critical review decisions

### Missing legacy evidence is not proof of failure

Most existing historical paper trades do not record the complete entry plan, initial stop, expected value, portfolio heat, event check or liquidity evidence. Giving these records a zero would falsely assert that the check failed. V1 therefore uses:

- `SCORED` when source evidence exists;
- `NOT_ESTIMABLE` when historical evidence was not captured;
- `NOT_MATURE` while an outcome is still developing.

The UI shows coverage separately. A total score is withheld until process coverage is at least 80%, outcome coverage for a closed trade is at least 70%, and all critical-risk criteria are evidenced.

### Future data cannot improve an entry score

MFE, MAE, future return, target hits and realised P&L remain outcome evidence. They never populate a process criterion. This prevents look-ahead leakage in live selection and backtests.

### Hard fail requires confirmed evidence

Missing data yields `NOT_ESTIMABLE` or `DATA_INVALID`; it does not invent a risk violation. `BAD_RISK` is reserved for a stored hard-fail flag supported by an audit reference.

### Tax remains a provision

The engine retains exact trading charges and a versioned tax provision. Per-trade tax is not represented as final legal tax. Production tax profiles remain account, trade-type and financial-year dependent.

## Official-source verification

- NSE circular FATAX73524 confirms option-sale and exercised-option STT of 0.15% from 1 April 2026, while delivery equity remains 0.10% on buy and sale: <https://nsearchives.nseindia.com/content/circulars/FATAX73524.pdf>
- NSE contract specifications identify Tuesday expiry and last-Tuesday individual-security expiry rules: <https://www.nseindia.com/static/products-services/equity-derivatives-contract-specifications>
- NSE settlement documentation describes expiry exercise/final settlement for individual-security options: <https://www.nseindia.com/static/products-services/equity-derivatives-settlement-mechanism>
- SEBI's FY2024–25 study reports 91% loss-making individual equity-derivative traders and ₹1,05,603 crore aggregate net losses after transaction costs: <https://www.sebi.gov.in/sebi_data/attachdocs/jul-2025/1751900271726.pdf>
- Income Tax Department AY 2026–27 guidance remains the authoritative tax-profile source: <https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/file-itr-2-online>

These dated rules are configuration inputs, not permanent constants in React.

## Implementation

### Canonical scorer

`neon-stock-terminal/apps/api/src/lib/tradeQuality.ts`

- canonical criterion IDs, titles and weights;
- quantitative R, MAE, drawdown, capture and cost bands;
- coverage gates;
- hard-fail override;
- `VALID_LOSS`, `LUCKY_WIN`, `GOOD_HIGH`, `GOOD_MEDIUM`, `GOOD_LOW`, `WEAK`, `BAD`, `BAD_RISK`, `DATA_INVALID`, `NOT_ESTIMABLE` labels;
- Decimal-safe source fields from PostgreSQL are converted only at the JSON projection boundary.

### Paper Trading API projection

- `GET /v1/trade-quality/policy`
- `GET /v1/workspace/paper-trading`
- `GET /v1/workspace/paper-trading/trades/{tradeGroupId}`

Every paper row now exposes `trade_quality`, `quality_score`, `quality_label` and coverage. The previous score survives under `analytical_evidence_score` for backward interpretation.

### Forward entry capture

Manual Paper Trading entry now requires:

- initial risk-limit percentage;
- maximum holding sessions;
- entry thesis/reason.

These are stored in immutable trade metadata as entry-time `quality_evidence`. They do not place or modify a live order. They do not automatically change paper execution stop behaviour.

Automated producers can supply the same versioned `quality_evidence` object. They must timestamp source evidence no later than entry.

### Backtesting

Every trade returned through the selected-strategy scenario receives `tradeQuality`. Published snapshots with complete entry/outcome evidence can receive a total. Older snapshots remain `NOT_ESTIMABLE` rather than being falsely graded. Portfolio Results shows the score/label or the honest evidence gap.

### Persistence

Migration `009_trade_quality_assessments.sql` adds:

- `trade_quality_policies`;
- `trade_quality_assessments`;
- `trade_quality_criteria`;
- `v_trade_quality_latest`.

Assessments store immutable policy version, watermark, input/result snapshots, criterion evidence state, points, coverage and hard-fail flags. Audit records are retained on rollback.

Historical checkpoint command:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api
npm run trade-quality:backfill
```

The dashboard calculation remains current between durable checkpoints. Re-running the command is idempotent for the same source watermark.

## Data contract for complete scores

New producers should add `metadata.quality_evidence`:

```json
{
  "captured_at": "entry-time ISO timestamp",
  "evidence_scope": "ENTRY_TIME_ONLY",
  "effective_risk_rupees": "decimal",
  "drawdown_budget_share": "decimal ratio",
  "cost_drag_r": "decimal",
  "holding_efficiency_ratio": "decimal",
  "ratings": { "C01": 4, "C02": 3 },
  "hard_fail_flags": [],
  "data_valid": true
}
```

For options, use `O01`–`O16`; multi-leg evidence must represent the combined trade family. A leg-by-leg MFE/MAE score is prohibited.

## Tests

```text
Dashboard API tests: 89 passed
Dashboard API typecheck: passed
Web typecheck: passed
Web production build: passed
Disposable PostgreSQL migration: 1 passed
Authenticated deployed Playwright regression: passed
OpenAPI validation: 0 errors
```

Covered explicitly:

- 55/45 and 60/40 weight totals;
- missing legacy evidence does not become zero;
- hard-fail override;
- open outcome remains developing;
- paper execution economics remain separate from analytical evidence.

## Deployment evidence

- Additive migration `009_trade_quality_assessments` applied to the live stack on 14 August 2026.
- Historical checkpoint covered 21 trade groups. The append-only store currently contains 35 assessment snapshots and 595 criterion rows because open/current evidence changed between checkpoint runs; all 21 groups have at least one assessment.
- Current visible Paper Trading records: 14 of 14 correctly show `NOT_ESTIMABLE`; none received an invented zero or total score.
- `paper-api`, `paper-monitor-worker`, `paper-scheduler`, `paper-webhook-worker` and `n50-dashboard` were recreated independently and are healthy/running.
- Responsive evidence:
  - `/home/novius2/trading-stack/tools/playwright/output/playwright/trade-quality/paper-trade-quality-desktop.png`
  - `/home/novius2/trading-stack/tools/playwright/output/playwright/trade-quality/paper-trade-quality-mobile.png`
  - `/home/novius2/trading-stack/tools/playwright/output/playwright/trade-quality/backtesting-trade-quality-desktop.png`
- The deployed regression recorded eight existing Microsoft Clarity collector CSP/network warnings separately; no application console error was suppressed and no trade-quality assertion failed.
- Regenerated OpenAPI package: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip` (61 entries; archive integrity passed).

## Rollback

1. Roll back the dashboard image to remove the new projection and UI tab.
2. Stop running the backfill command.
3. Leave quality audit tables intact.
4. No paper trade, fill, target, observation, P&L or notification row needs reversal.
5. No live broker action is involved.

## Known limitation

Existing records cannot be reconstructed into complete process scores when the original plan was never captured. The correct historical result is `NOT_ESTIMABLE`. A future policy version should add governed market-regime, sector-strength, liquidity, event, portfolio-heat and options stress snapshots at the producer boundary before raising coverage to complete.
