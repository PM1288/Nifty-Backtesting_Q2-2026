# OIIS dual intraday entry and 30-minute alert audit

**Implemented:** 17 August 2026
**Environment:** production PAPER stack
**Policy:** `OIIS_DAILY_SELECTION_INTRADAY_ENTRY_V1.0` version `3.9`

## Outcome

OIIS daily selection now arms the paper-entry monitor. It no longer creates a new immediate paper trade merely because the run-level quality sum exceeds 185. Each selected stock is evaluated independently by two entry methods:

1. `RSI_WILLR` — the existing live rule: RSI(14) `< 30` and Williams %R(14) `< -80`.
2. `PRICE_MOMENTUM_1D_1H_15M` — the new LONG rule:
   - latest completed one-minute close is greater than the previous official NSE daily close;
   - latest completed NSE-session-anchored hourly close is greater than the preceding completed hourly close;
   - latest completed NSE-session-anchored 15-minute close is greater than the preceding completed 15-minute close.

Only completed candles with full minute coverage are eligible. Hourly and 15-minute candles are anchored to the NSE 09:15 IST session open. Therefore the new method cannot qualify before two full hourly candles exist. Missing previous-close or incomplete candle evidence remains waiting; it is not converted to zero or a pass.

If both methods qualify for the same symbol and trade date, they create two independent PAPER trade groups. Idempotency is now `(policy, trade date, symbol, entry method)`. Fill handling remains `NEXT_AVAILABLE_BAR_OPEN`, current F&O lot quantity remains the sizing source, and all intraday/swing/5D/30D exit and observation rules remain unchanged.

Historical immediate-at-run trades were not rewritten. They are explicitly projected as `QUALITY_SUM_THRESHOLD`.

## Important source-code clarification

The preserved production entry method was RSI plus Williams %R. It was not using Bollinger Bands or relative volume in the live entry predicate. No undocumented Bollinger/RVOL rule was invented during this change.

## 30-minute WhatsApp audit for 17 August 2026

The scheduled route did run. Database reconciliation found:

- 12 completed `ALL_FNO` runs: 09:30, then every 30 minutes through 15:00 IST;
- zero candidates satisfying the WhatsApp membership rule `XFactor > 70 AND OFactor > 70`;
- maximum XFactor observed: `60.9980`;
- maximum OFactor observed: `80.6385`;
- all 12 OIIS notification jobs were intentionally suppressed as `OIIS_NO_QUALIFYING_CANDIDATES`;
- market open, movers and close WhatsApp events were each `SENT` once.

The paper-monitor eligibility formula (`OFactor + XFactor + Data Quality > 185`) is intentionally different from the strict WhatsApp membership rule. It had eligible observations, but those are not valid substitutes for the notification rule.

No empty OIIS WhatsApp message was sent because the existing product rule suppresses a message when both LONG and SHORT membership lists are empty.

One reliability defect was fixed: the notification worker previously selected the newest completed run after its watermark. A delayed or restarted worker could skip intermediate 30-minute runs. It now drains completed runs oldest-first. Suppression records also retain candidate count and both strict thresholds for audit.

## Database change

Migration: `db/sql/048_oiis_dual_entry_methods.sql`

- Adds `entry_method` to `oiis_live.entry_claim` and `oiis_live.intraday_evaluation`.
- Adds daily/hourly/15-minute comparison evidence to `intraday_evaluation`.
- Replaces symbol/day uniqueness with symbol/day/method uniqueness.
- Appends `entry_method_statuses` to `oiis_live.v_current_watchlist` without changing existing column positions.
- Adds `MONITORING` to the run-level auto-paper state.
- Retains all prior rows; production row counts remained `21 entry claims`, `45 evaluations`, and `239 watchlist rows` across the migration.

Legacy claims were classified from their immutable request metadata:

- `QUALITY_SUM_THRESHOLD`: 19
- `RSI_WILLR`: 2

Duplicate method claims after migration: 0.

## UI and API

The Paper Trading complete-evidence table now contains an **Entry strategy** column. A visible filter supports:

- all entry strategies;
- RSI / Williams %R;
- Price momentum 1D / 1H / 15M;
- legacy run-quality entry;
- manual / unspecified.

The same method is visible on mobile trade cards and in trade detail. `/v1/workspace/paper-trading` now exposes `entry_strategy` for every stock trade. OIIS run history aggregates method statuses in one stock/run row so two claims cannot duplicate a candidate row.

## Validation evidence

- OIIS unit/contract tests: **30 passed**.
- Market-status tests: **28 passed**.
- Dashboard API tests: **102 passed**.
- Dashboard web tests: **27 passed**.
- API and web TypeScript checks: passed.
- Production dashboard build: passed.
- Disposable PostgreSQL upgrade: passed.
- Same migration rerun on the disposable database: passed.
- OpenAPI: 18 specifications, 602 operation entries, zero validation errors.
- Live Playwright desktop/mobile/API regression: passed with 21 paper trades and 24 OIIS history runs; no duplicate run-history stock rows and no page-level overflow.
- Live services `oiis-live`, `market-status-worker`, and `n50-dashboard`: healthy.
- `oiis-live verify-config`: PASS, PAPER only.

Screenshots and machine-readable browser result:

- `tools/playwright/output/playwright/paper-dual-entry/paper-entry-strategy-1366x768.png`
- `tools/playwright/output/playwright/paper-dual-entry/paper-entry-strategy-390x844.png`
- `tools/playwright/output/playwright/paper-dual-entry/results.json`

## Backups and rollback

Validated pre-change backup:

`/home/novius2/trading-stack/backups/oiis-dual-entry-20260817T180500Z`

The safest application rollback is to restore `pre-change-files.tar.gz`, rebuild/recreate only `oiis-live`, `market-status-worker`, and `n50-dashboard`, and leave the additive columns in place. Before restoring the old OIIS binary, confirm that no symbol/day has multiple entry methods; the old binary expects symbol/day uniqueness. If new dual-method trades already exist, disable/forward-fix the new subsystem rather than deleting evidence.

No production data was deleted. No live broker endpoint was added or called.

## OpenAPI

- Source folder: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`
- Validated ZIP: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-17-oiis-dual-entry.zip`
- ZIP entries: 61
- ZIP SHA-256: `8556b211a58a9442a206d329a19b6f6b6697218bc34903409a839ff6ad739e17`
