# Crypto Scalper — 11 October 2026

## Scope and behavior

Canonical source: `/home/novius2/trading-stack`. Feature branch:
`feat/crypto-scalper-20261011`. Adds the **Crypto Scalper** tab beside Scalper V2
in Trading Analytics, public destination:
`https://n50.nifty50today.co.in/n50/strategy/trading-analytics?view=crypto`.

Six Binance spot pairs: BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT.
Each chart shows completed 5-minute OHLC candles, close-price EMA9, actual
base-asset volume or actual USDT quote volume, plus exact trade counts. Controls
select four-hour, 24-hour or available-history views and volume units. Crosshair
inspection exposes the exact source candle. CSV exports all returned candles;
an expandable pair table shows the latest 24. Prices use USDT and times use UTC.

The new authenticated `GET /v1/crypto-market` endpoint requests public Binance
klines using `interval=5m`, `limit=1000`, and an `endTime` excluding forming bars.
No Binance key, trading account, order flow, or notification is required. Six
upstream reads per five-minute boundary are shared across browser sessions using
in-process cache and single-flight requests. Three seconds after each UTC close,
visible tabs refresh automatically. Failed pairs return original cached bars and
timestamps with STALE, or empty UNAVAILABLE; gaps yield PARTIAL. Rate limits honor
Retry-After (minimum 60 seconds). Only fixed allowlisted symbols and a fixed
market-data hostname are requested. OHLC bounds, candle alignment, nonnegative
volume and integral trade counts are validated. Missing data never becomes zero.

Source: https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#klinecandlestick-data

## Practical limits

Volume is Binance spot trading in the named pair, not volume across exchanges.
Prices are completed five-minute closes, not streaming tick prices. Up to 1,000
candles (approximately 83 hours) are recovered from Binance on restart; no
permanent local archive or background collector is introduced. EMA9 is seeded
with the first returned close and restarts after gaps. Browser refresh pauses in
background tabs and refetches on focus. Existing NIFTY V2, option strategies,
notifications, authentication and trading permissions are retained.

## Source and verification

- API: `apps/api/src/services/cryptoMarket.ts`, its focused tests,
  `apps/api/src/routes/cryptoMarket.ts`, additive registration behind `/v1` guard.
- Web: `apps/web/src/pages/CryptoScalper.tsx` and CSS; additive navigation key
  and lazy-loaded branch in `TradingAnalyticsPage`. Crypto avoids NSE queries
  and ignores NSE replay/expiry state.
- Live Binance evidence initially returned READY and 1,000 completed candles
  for all six symbols. API tests: 294/294; web tests: 291/291. Both typechecks,
  production builds and canonical source gate pass.
- Evidence outside Git: `/home/novius2/NIFTY50/evidence/crypto-scalper-20261011*`.
  No passwords, session cookies or runtime market archives belong in Git.

## Reproduce

```bash
cd /home/novius2/trading-stack
npm run typecheck --prefix neon-stock-terminal/apps/web
npm test --prefix neon-stock-terminal/apps/web
npm run build --prefix neon-stock-terminal/apps/web
npm run typecheck --prefix neon-stock-terminal/apps/api
npm test --prefix neon-stock-terminal/apps/api
npm run build --prefix neon-stock-terminal/apps/api
bash scripts/verify/canonical-repository-gate.sh
node tools/playwright/crypto-scalper.mjs
```

The browser regression reads only DEV_LOCAL_AUTH_PASSWORD from protected `.env`,
authenticates at the public gateway, validates six live pairs, exports 6,000 exact
source candles, tests desktop/mobile overflow and simulated stale responses, and
returns to V2. Screenshots and snapshot evidence are written outside the repo.

Local preview uses the canonical Vite server plus a loopback-only instance of the
new route. `CRYPTO_API_ORIGIN` bridges only the new API during browser tests;
all other requests use the existing gateway. These commands introduce no changes
to production auth:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal
node_modules/.bin/tsx -e 'import express from "express"; import {registerCryptoMarket} from "./apps/api/src/routes/cryptoMarket"; const app=express();registerCryptoMarket(app);app.listen(18101,"127.0.0.1")'
# Separate terminal:
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run dev -- --host 127.0.0.1 --port 15174
# Separate terminal:
cd /home/novius2/trading-stack
CRYPTO_APP_ORIGIN=http://127.0.0.1:15174 CRYPTO_API_ORIGIN=http://127.0.0.1:18101 CRYPTO_OUTPUT=/home/novius2/NIFTY50/evidence/crypto-scalper-20261011-local node tools/playwright/crypto-scalper.mjs
```

Release only from pushed master after scoped merge and preservation checks:

```bash
PUBLIC_BASE_URL=https://n50.nifty50today.co.in ROUTE_PATH='/n50/strategy/trading-analytics?view=crypto' bash scripts/deploy_n50_dashboard.sh
```

Release receipt and final public acceptance results are recorded below after
cutover. The previous dashboard image is retained as
`trading-stack-n50-dashboard:pre-crypto-20261011`; rollback recreates only the
dashboard using that image through the canonical Compose project. No database
migration or volume change is required.

## Pre-release acceptance

- Local authenticated Crypto browser regression: 10/10 checks passed, including
  six-pair live candles, exact CSV reconciliation, controls, 1920px and 390px
  layouts, stale responses, navigation back to original V2, zero page exceptions.
- Existing public canonical feature regression: 9/9 checks passed (auth, ticker,
  cursor, high-legibility persistence and Paper alert launcher).
- One local Vite cold-import attempt failed to fetch the V2 module; the warmed
  rerun passed. One generic preservation harness pointed at an unsupported local
  `/n50/auth` proxy and returned 404; public-origin rerun passed. These were test
  harness/preview failures, not production acceptance results.
