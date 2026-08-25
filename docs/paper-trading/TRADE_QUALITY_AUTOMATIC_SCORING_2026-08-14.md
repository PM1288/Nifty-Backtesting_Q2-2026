# Automatic Paper Trade Quality Scoring — implementation evidence

**Implemented:** 14 August 2026
**Policy:** `n50-trade-quality@1.1.0`
**Environment:** PAPER only
**Live route:** `https://n50.nifty50today.co.in/n50/paper-trading`

## Outcome

The Paper Trading dashboard no longer depends on manual completion of every criterion before it can show a score. Every opened cash-equity paper trade is evaluated from the best point-in-time evidence already retained by the stack. The score is a percentage, the grade is visible in the table, and the Reward-vs-Pain map renders the score inside each bubble.

This is additive analysis. It does not alter order simulation, fills, target exits, P&L ledgers, observation rules, paper notifications, OIIS selection, or any live-order path.

## Evidence sources and precedence

### Process evidence: only information available at or before entry

1. Exact `oiis_live.daily_candidate.run_id` recorded in the paper trade metadata.
2. Otherwise the newest same-symbol, same-direction candidate whose `available_at <= opened_at`.
3. Candidate `component_scores.xfactor`:
   setup integrity, instrument quality, reward path, trigger confirmation, entry location, session timing, stop/invalidation, liquidity/slippage, and market/sector synchronisation.
4. Candidate `component_scores.ofactor_long/ofactor_short`:
   trend, momentum, relative strength, liquidity/tradability, market regime, sector support, money flow, institutional and catalyst context.
5. Candidate technical snapshot:
   RSI14, Williams %R14, ATR14, volume/SMA20, reference price, buy/no-chase price, quality and data permission.
6. Risk fallback:
   structural risk/share first; otherwise entry-time ATR; only then 1% of entry price.
7. Position/account evidence:
   opened quantity, entry price, sizing policy, opening account cash and configured risk limits.

No after-entry price, MFE, MAE or P&L is used in C01-C10.

### Outcome evidence: after entry

- Actual realised net P&L.
- Current unrealised mark for open trades, less recorded charges/friction.
- `paper_trading.charge_ledger` and `paper_fills` spread/slippage cost.
- Observation MFE/MAE and horizon state.
- Current capture versus accessible MFE.
- Holding time versus the governed five-session horizon.
- Estimated trade-risk share of opening account equity.
- Execution workflow override/adherence evidence.

Open scores are `DEVELOPING` and change as the path evolves. Closed trades become `COMPLETE` when the outcome coverage gate passes. `scoreBasis` distinguishes `NORMALISED_AVAILABLE_EVIDENCE` from `FULL_100_POINT`.

## Criterion implementation

| Criterion | Automatic source |
|---|---|
| C01 Plan/data integrity | Candidate data quality + instrument quality |
| C02 NIFTY regime/volatility | Market-regime support + market/sector synchronisation |
| C03 Sector/relative strength | Relative strength + sector-industry support |
| C04 Technical setup | Setup/trigger/trend/momentum plus RSI, Williams %R and ATR |
| C05 Entry timing/location | Entry location + session timing, reference/no-chase levels |
| C06 Liquidity/friction | Liquidity/slippage quality + tradability + volume ratio |
| C07 Expected reward/risk | Reward-path quality and recorded reward/risk evidence |
| C08 Stop/invalidation | Stop quality, structural stop, risk/share; ATR fallback |
| C09 Sizing/portfolio heat | Effective risk divided by opening account cash |
| C10 Event/overnight context | Candidate catalyst/event context |
| C11 Profitability | Closed net result or evolving open after-cost mark, in R |
| C12 MAE/drawdown | MAE in R and drawdown-budget share |
| C13 Capture | Realised/current positive economics divided by accessible MFE |
| C14 Holding efficiency | Elapsed holding period versus governed horizon |
| C15 Cost drag | Charges + spread/slippage divided by effective risk |
| C16 Rule adherence | Versioned PAPER workflow and operator-override record |
| C17 Portfolio interaction | Initial risk share of opening account equity |

## Hard-risk behavior

The percentage remains visible even when a hard-risk rule overrides its classification. Current automatic hard-risk evidence includes:

- risk not calculable even after structural/ATR/price fallback;
- initial risk above 1% of opening account equity;
- data permission blocked, data quality below 70%, or an observation marked `DATA_INCOMPLETE`;
- expected value absent only when both recorded reward/risk and reward-path evidence are absent.

This prevents missing optional fields from turning every trade into BAD_RISK while preserving the user's governance rule that a real risk breach overrides profit.

## Live reconciliation at implementation time

- Opened paper trades read: **17**
- Trades with a numeric score: **17 / 17**
- Average process coverage: **100.00%**
- Average currently available outcome coverage: **100.00%**
- Average quality score: **67.81%**
- Grade/state distribution:
  - BAD_RISK COMPLETE: 5
  - GOOD_LOW COMPLETE: 1
  - GOOD_LOW DEVELOPING: 2
  - GOOD_MEDIUM COMPLETE: 2
  - GOOD_MEDIUM DEVELOPING: 3
  - LUCKY_WIN DEVELOPING: 1
  - WEAK COMPLETE: 2
  - WEAK DEVELOPING: 1

The five BAD_RISK records were caused by actual recorded data-quality incidents and/or estimated risk above 1% of opening account equity. They were not caused by absent display fields.

## UI changes

- Quality KPI and table use percentages with at most two decimals.
- Reward-vs-Pain bubbles use trade-quality grade colours.
- Each bubble displays its rounded quality percentage.
- Closed execution remains a separate green border state.
- Tooltip and accessible name include symbol, grade, score, MFE, MAE and execution state.
- “What good looks like” explains automatic evidence reconstruction and keeps administrator review as an optional append-only override.
- Desktop and 390px mobile layouts have no horizontal body overflow.

### Light-theme and all-trades follow-up

- Removed the dark isolated evaluator palette and aligned the complete quality view with the existing light white/blue/violet Paper Trading theme.
- Removed the Paper trade selector dropdown.
- All 17 trade-quality cards are visible by default with symbol, strategy, lifecycle, score, grade, process, outcome and a score rail.
- Added visible filters for All, Good, Developing and Needs attention, plus symbol/strategy search.
- Selecting a card updates the detailed matrix without hiding the portfolio overview.
- Playwright validates the complete card count, Good filter, symbol search and absence of the retired dropdown.
- Evidence: `/home/novius2/trading-stack/output/playwright/trade-quality-light-filtered/paper-trade-quality-desktop.png` and `paper-trade-quality-mobile.png`.

### Scalable bottom register follow-up

- Moved the complete trade register to the bottom of the quality tab so it does not displace the current assessment.
- Replaced the large card grid with a compact semantic table: trade, opened time, lifecycle, score, grade, process, outcome and 5D reward/pain.
- Added visible Last 7 days, Last 30 days, Last 90 days and All history filters; Last 30 days is the default.
- Retained All, Good, Developing and Needs attention filters plus symbol/strategy search.
- The table scrolls inside its own bounded surface on narrow screens, so it does not create page-level horizontal overflow.
- Playwright validates the default 30-day result count, Good filter, symbol search, All-history result count and bottom placement.
- Evidence: `/home/novius2/trading-stack/output/playwright/trade-quality-bottom-table/paper-trade-quality-desktop.png` and `paper-trade-quality-mobile.png`.

### Filtered multi-trade matrix and criterion colour rails

- The Process versus Outcome matrix now plots every trade in the active Last 7 days, Last 30 days, Last 90 days or All history scope.
- The All, Good, Developing, Needs attention and symbol/strategy search filters now drive both the matrix and the bottom register from one shared filtered set.
- Clicking a matrix stock selects it, changes that point to green and refreshes the selected trade KPIs, evidence and C01-C17 detail.
- Non-selected matrix points remain blue so selection is distinguishable from trade grade and execution state.
- Every scored C01-C17 row now has a proportional rating rail and matching left edge: 0 is red, intermediate values move through amber/yellow and 5 is green. Unavailable evidence remains neutral grey.
- The all-trades register remains at the bottom and reports the number of matching trades.
- Live Chromium regression validated 17 All-history points, default 30-day counts, Good/search synchronization, selected green state, rating-rail widths and no mobile page overflow.
- Evidence: `/home/novius2/trading-stack/output/playwright/trade-quality-matrix-all/paper-trade-quality-desktop.png` and `paper-trade-quality-mobile.png`.
- Deployment backup: `/home/novius2/trading-stack/backups/trade-quality-matrix-20260814T184550Z`.

## Database

- Existing tables remain intact.
- Migration `011_trade_quality_estimated_status.sql` adds `ESTIMATED` to the existing assessment status constraint.
- Policy V1.1.0 and 17 assessments were written without replacing V1.0.0 history.
- Backfill is idempotent by trade, policy version, stage and evidence watermark.

## Validation

```text
API TypeScript typecheck: PASS
Web TypeScript typecheck: PASS
Trade-quality unit tests: 6/6 PASS
Production image build: PASS
Migration 011: PASS
Backfill: 17 read / 17 written
Playwright live regression: PASS
Automatic scores: 17/17
Reward-vs-Pain scored bubbles: 17/17
CSRF negative test: PASS
Mobile horizontal overflow: none
OpenAPI validation: 18 specifications / 580 operation instances / 0 errors
```

Known console messages were 12 analytics/CSP warnings already allowlisted by the regression; no application console error was accepted.

## Evidence

- Desktop quality: `/home/novius2/trading-stack/output/playwright/trade-quality-automatic/paper-trade-quality-desktop.png`
- Mobile quality: `/home/novius2/trading-stack/output/playwright/trade-quality-automatic/paper-trade-quality-mobile.png`
- Main chart: `/home/novius2/trading-stack/output/playwright/trade-quality-automatic/paper-reward-pain-quality-desktop.png`
- Backtesting quality column: `/home/novius2/trading-stack/output/playwright/trade-quality-automatic/backtesting-trade-quality-desktop.png`
- Updated OpenAPI folder: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`
- Updated OpenAPI ZIP: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip`
- Deployment backup: `/home/novius2/trading-stack/backups/trade-quality-auto-20260814T170105`

## Rollback

1. Restore the six dashboard/API files from the backup directory.
2. Rebuild and recreate only `n50-dashboard`.
3. Keep policy V1.1.0 and assessments as immutable audit history.
4. No paper worker, scheduler, webhook worker, OIIS worker or trading table rollback is required.

## Complete trade evidence matrix — 14 August 2026

The All Paper Trades surface now presents execution economics and the full observation path in one
responsive register without treating execution `OPEN` or `CLOSED` as the quality conclusion.

- Nine compact evidence columns cover Intraday +0.3%, +0.4%, +0.5%, +1.0%; Swing +1%, +3%,
  +5%; and the 5-session and 30-session horizons. Desktop headings are vertical; mobile uses a
  nine-cell evidence grid.
- `HIT` is green, a final `NOT HIT` is red, and an unfinished observation remains amber/open. The
  implementation does not turn an unfinished target into a false failure.
- Each row reports calendar age, observed trading sessions, `TIME UP` after a completed 30-session
  horizon, maximum favourable profit, maximum drawdown and the never-closed hypothetical carry.
- Row tint is derived from the finalized/hit evidence: all hit is green, all finalized misses is red,
  and intermediate completion uses a continuous red-to-green scale. Pending-only rows remain amber.
- Portfolio rollups separately show Intraday and Swing realised/open economics, 5D matured versus
  developing evidence, 30D time-up versus developing evidence, and the never-closed carry total.
  Horizon buckets overlap by design and are not added into execution accounting.

### Canonical carry mark

The API now resolves the latest cash-equity quote through `public.instruments` and
`public.quote_snapshots`. `SMARTAPI_QUOTE_CACHE` is the preferred source; the existing position mark
is an explicit fallback. Carry P&L uses the original opened quantity and direction. It remains an
analytical counterfactual and never changes realised P&L, unrealised P&L, tax, costs or position state.

### Validation and evidence

```text
Web TypeScript typecheck: PASS
Web tests: 21/21 PASS
API TypeScript typecheck: PASS
API tests: 91/91 PASS
Production build and healthy container: PASS
Live Chromium regression: PASS
Trades rendered: 17
Canonical SmartAPI carry marks: 17/17
Desktop target cells: 7 x 17 plus 5D/30D horizon cells
Mobile evidence cells: 9 x 17
Mobile horizontal page overflow: none
OpenAPI validation: 18 specifications / 580 operation instances / 0 errors
```

- Desktop screenshot: `/home/novius2/trading-stack/output/playwright/paper-complete-evidence-final/paper-complete-evidence-desktop.png`
- Mobile screenshot: `/home/novius2/trading-stack/output/playwright/paper-complete-evidence-final/paper-complete-evidence-mobile.png`
- Deployment backup: `/home/novius2/trading-stack/backups/paper-complete-evidence-20260814T192527Z`
- OpenAPI folder: `/home/novius2/NIFTY50/backend-openapi-documentation-2026-08-13`
- OpenAPI ZIP: `/home/novius2/NIFTY50/NIFTY50-backend-openapi-documentation-2026-08-14.zip`

Rollback restores only the four Paper workspace API/UI files from the deployment backup and rebuilds
`n50-dashboard`. No Paper worker, scheduler, webhook, OIIS calculation or database record changes are
required.
