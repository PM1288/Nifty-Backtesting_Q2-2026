# Scalper V2 OI differences, PCR history and underlying volume — 19 September 2026

## Outcome

The existing Scalper V2 Total OI dock now presents three timestamp-aligned views:

1. CE and PE total OI across every strike retained in each snapshot.
2. `PE total OI - CE total OI` together with `PE reported change in OI - CE reported change in OI` on independent Y axes and the same time axis.
3. OI PCR over time, calculated as `PE total OI / CE total OI`.

The underlying native chart also has a lower volume pane. NIFTY and other indices
use the nearest active current-month `FUTIDX` contract with retained bars. Stocks
use retained NSE cash-market volume. The exact source contract and expiry are
shown in the chart header.

## Truth and missing-data rules

- "Total OI" is a cross-sectional sum per captured timestamp; snapshots are not
  cumulatively added through the day.
- Reported change in OI is the stored provider `change_in_oi` value summed by
  option side. It is not inferred by subtracting arbitrary adjacent snapshots.
- A side is complete only when every retained contract in that snapshot has the
  relevant OI field. Incomplete sides and their difference remain null, never zero.
- PCR requires complete CE and PE totals and non-zero CE OI.
- Volume intervals sum complete constituent one-minute volumes. An interval with
  a missing constituent volume stays unavailable.
- A latest price session without a same-day chain snapshot displays OI history as
  unavailable; it does not borrow an older snapshot and label it current.
- The chart request retains 15 calendar days for indicator warm-up and sparse
  snapshot capture, while the visible price chart remains sliced to one selected
  session.

## Files

- `neon-stock-terminal/apps/api/src/routes/tradingAnalytics.ts`
- `neon-stock-terminal/apps/api/src/services/tradingAnalytics.ts`
- `neon-stock-terminal/apps/web/src/lib/scalperV2OiTime.ts`
- `neon-stock-terminal/apps/web/src/pages/TradingAnalyticsScalperV2.tsx`
- `neon-stock-terminal/apps/web/src/pages/scalper-v2/ScalperV2Chart.tsx`
- `neon-stock-terminal/apps/web/src/pages/scalper-v2/ScalperV2.module.css`
- focused API/web tests and `tools/playwright/scalper-v2-popout-structure.mjs`

No strategy, signal, order, paper-trade, notification, database schema or
collector behavior was changed.

## Verification

- Web typecheck, 215 tests and production build: PASS.
- API typecheck, 247 tests and production build: PASS.
- Focused OI option tests: 9/9 PASS.
- Focused analytics route tests: 10/10 PASS.
- Authenticated isolated candidate browser run: 14/14 PASS using retained
  16 September evidence, including both difference lines, PCR history, NIFTY
  current-month future volume, RELIANCE cash volume, pop-out and linked cursor.
- Candidate screenshot and result JSON:
  `/tmp/scalper-v2-oi-time-candidate-20260919/` (not committed).

## Retained-data evidence and limitation

At validation time the current NIFTY future resolved to `NIFTY29SEP26FUT`
(expiry 2026-09-29). Retained NIFTY option-chain history ended on 16 September,
while underlying candles extended later. Therefore newer unmatched sessions
correctly show the snapshot-dependent charts as unavailable. This is a source
coverage limitation, not filled or interpolated by the UI.

## Rerun

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
SCALPER_V2_APP_ORIGIN=https://n50.nifty50today.co.in \
SCALPER_V2_AUTH_ORIGIN=https://n50.nifty50today.co.in \
SCALPER_V2_TEST_DAY=2026-09-16 \
SCALPER_V2_OUTPUT=/tmp/scalper-v2-oi-time-production-20260919 \
node tools/playwright/scalper-v2-popout-structure.mjs
bash scripts/verify/canonical-repository-gate.sh
```
