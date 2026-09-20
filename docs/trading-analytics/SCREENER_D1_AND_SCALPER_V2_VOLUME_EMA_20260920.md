# Screener D−1 Close and Scalper V2 option-volume EMA

Date: 20 September 2026  
Branch: `fix/screener-d1-volume-ema-options-20260920`

## Scope

- Home MWHD Bull/Bear boards now show a compact `D−1 C` comparison immediately
  after `D0`. It compares the current retained value with the previous trading
  day's close using the board direction.
- D−1 Close is context only. It does not enter the MWHD gates, weighted score,
  readiness, funnel or rank. The exact current/reference values are preserved in
  the row tooltip, evidence drawer and CSV export; missing data stays unavailable.
- Every Scalper V2 native price chart now includes its own volume pane. The
  underlying retains the existing current-month future or NSE cash source;
  selected CE and PE use their exact contract candle volume.
- The volume pane overlays a standard EMA seeded with the first complete SMA:
  `EMA20` for 1m/5m and `EMA5` for 15m/1h. Missing volume breaks an EMA run and is
  never replaced with zero.

## Preservation

No chart query, collector, option contract selection, candle/EMA9 calculation,
MWHD rule, rank weight, alert, order permission or V1 route changed. The new
series reuse already retained `bars_1m.volume` observations.

## Verification

Run:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npx tsx --test tests/scalperV2Volume.test.ts tests/todayRevamp.test.ts
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

Deployment and browser evidence are recorded in `AGENT_HANDOFF.md` after the
production commit is validated.
