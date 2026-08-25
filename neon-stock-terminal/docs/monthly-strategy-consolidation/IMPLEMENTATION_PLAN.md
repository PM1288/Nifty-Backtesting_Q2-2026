# Monthly and Rolling Strategy Consolidation

Date: 2026-08-23

## Product decision

The former “Rolling Monthly” page mixed four different clocks. It is replaced by two independent research workspaces:

1. **Monthly Strategy** (`/n50/strategy/monthly`) compares three calendar/expiry anchors in one ledger:
   - last-Tuesday expiry;
   - calendar-month signal/closure;
   - first exchange session with 0.5% and 1.0% gap scenarios.
2. **Rolling Strategy** (`/n50/strategy/rolling-monthly`) is calendar-independent and evaluates rolling 5/30/60-session conditions.

Neither strategy is OIIS and neither is connected to Paper Trading or broker-order endpoints.

## Calculation contract

### Monthly Strategy

- Entry method is an explicit dimension, not a tab-specific hidden assumption.
- Expiry results preserve the existing last-Tuesday signal and next-session entry rule.
- Calendar-month results preserve the existing first qualifying signal and post-signal evidence path.
- First-session comparisons use the anchor session open against the previous completed-week open. They do not use the future close of a partial new week.
- Monthly EMA9 is computed from completed monthly closes with `span=9`, `adjust=false`, and a nine-month minimum history.
- `monthly_candle_above_ema9_pct` is the share of a bullish candle body above EMA9, clamped to 0–100. It is informational and never a hard gate.
- Significant gap-up scenarios are 0.5% and 1.0%.

### Rolling Strategy

- Older rolling block: sessions T-59 through T-30.
- Recent rolling block: sessions T-29 through T.
- Weekly proxies: current close versus T-4 and T-9 opens.
- Daily confirmations: current close versus previous-session open and current-session open.
- A signal is emitted only on a false-to-true qualification transition, preventing duplicate consecutive rows.
- Entry is the next exchange-session open.
- Outcome window is the next 30 exchange sessions; incomplete windows remain `DEVELOPING`.

## Universe and data sources

- Universe: `is_nse_fno OR is_nifty_largemidcap_250` from `public.instrument_profiles`.
- Current profile count at implementation: 268 unique symbols (208 F&O, 250 LargeMidcap 250).
- Daily source precedence:
  1. Yahoo split-adjusted OHLC;
  2. NSE EOD bhavcopy;
  3. SmartAPI daily bars for latest-session fallback in the persisted monthly worker.
- The governed history lookback is 1,300 calendar days so three full years of
  expiry and rolling signals have enough pre-signal candle history.
- Point-in-time historical constituent membership is not yet available. Historical results therefore disclose current-universe survivorship bias.

## UI implementation

- One sticky analysis/filter bar.
- Stock universe, index membership, market-cap and sector filters.
- Entry-method, year, month and EMA9-context filters.
- Target conversion at +1%, +3% and +5%.
- One-share-compatible source values and a uniform ₹10,000-per-entry comparison basis.
- Sortable columns, internally scrolling ledger, frozen stock identity column and sticky header.
- Stock logos/company names via the canonical profile registry.
- Trade-style detail inspector with conditions, EMA context, outcome economics and Stock 360 link.
- Filtered CSV export.
- Paper Trading’s complete evidence table now uses a bounded scroll viewport so its header remains visible.

## Migration and rollback

- Migrations `db/050_monthly_strategy_consolidation.sql` and
  `db/051_rolling_window_strategy.sql` are additive.
- No existing columns or records are deleted.
- Pre-change schema/data backup: `/home/novius2/trading-stack/backups/monthly-strategy-consolidation-20260823T0938Z/rolling_monthly_before.dump`.
- The prior page remains available temporarily at `/n50/strategy/rolling-monthly/legacy`.
- Rollback UI with image `trading-stack-n50-dashboard:pre-monthly-strategy-20260823`
  or the verified source archive. Rollback data by dropping only the additive
  columns/tables/indexes or restoring the verified dump.

## Acceptance checks

- Worker unit suite passes.
- API and web TypeScript checks pass.
- Production builds pass.
- Additive migration passes against a disposable database before live application.
- Live backfill covers 36 months and 268 profiles.
- Direct authenticated navigation, legacy redirect, filters, sorting, drawer, exports and responsive header containment are verified in Chromium.
