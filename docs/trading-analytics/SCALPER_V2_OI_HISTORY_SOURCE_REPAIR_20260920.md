# Scalper V2 OI history source repair — 20 September 2026

## Outcome

Scalper V2 now reads OI and change-in-OI history from two explicit sources:

1. Native `option_chain_snapshots` plus `option_chain_legs`, preferred whenever a session exists. Change in OI remains provider-reported.
2. `scalper_oi_history`, an additive derived table used only for sessions missing native option-chain snapshots. It is materialised from retained SmartAPI `quote_snapshots`; raw observations are never rewritten.

Both sources expose totals in **contracts**. SmartAPI `oi` is stored in underlying units and is divided by the exact instrument `lotsize`; a non-integral conversion remains unavailable. Derived change in OI is `current contracts - last captured pre-session contracts` for the same exact token. A side total is null unless every selected cohort leg is observed and comparable.

## Root cause and evidence

The option-chain watcher is present and healthy. It polls at two-minute cadence and stores full OI and provider `change_in_oi` in `option_chain_snapshots` and `option_chain_legs`. The database contains 2,302 snapshots and 59,852 populated legs at this repair point.

NIFTY native snapshots were complete on 16 September but absent on 17–18 September. The `trading_calendar` rows for those dates were loaded on 18 September after both sessions. The watcher correctly failed closed while its required calendar session was absent. Current collector code preloads the trading calendar 31 days ahead, so the forward condition is repaired without another broker connection or duplicate live collector.

Retained SmartAPI history was available for the missed sessions. A raw request-time fallback was rejected after measuring approximately 49 seconds for the chart endpoint and observing that raw collector timestamps contain repeated/stale batches. The materialiser instead uses:

- exchange session boundaries from `trading_calendar`;
- in-session collector and exchange-feed timestamps;
- one state per exact option token;
- the 13 nearest paired strikes around the observed NIFTY spot;
- five-minute bucket endpoints;
- exact instrument lot sizes;
- last captured pre-session exact-token baselines.

Backfill results for expiry `2026-09-22`:

| Session | Option observations | Spot observations | Points | Complete OI | Complete change OI |
|---|---:|---:|---:|---:|---:|
| 2026-09-17 | 4,132 | 375 | 75 | 75 | 75 |
| 2026-09-18 | 4,126 | 375 | 75 | 75 | 75 |

## Files

- `db/sql/060_scalper_oi_history.sql` — additive derived-history table and lookup indexes.
- `apps/api/src/services/scalperOiHistory.ts` — deterministic lot conversion, exact-token baseline and complete-cohort logic.
- `apps/api/src/scripts/materializeScalperOiHistory.ts` — auditable per-session materialiser; skips sessions already covered by native snapshots.
- `apps/api/src/routes/tradingAnalytics.ts` — fast union of native and materialised history, with native session precedence.
- `apps/web/src/pages/TradingAnalyticsScalperV2.tsx` — contract unit and baseline disclosure.

## Operations

Apply storage once:

```bash
docker exec -i trading-stack-novius2-postgres-1 sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < /home/novius2/trading-stack/db/sql/060_scalper_oi_history.sql
```

Materialise a genuinely missing session only:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env run --rm --no-deps \
  --entrypoint node n50-dashboard \
  apps/api/dist/scripts/materializeScalperOiHistory.js \
  --date=2026-09-18 --expiry=2026-09-22
```

The command refuses to derive a session when native snapshots exist. Re-running it is idempotent through the source key.

## Validation

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck
npm test
npm run build

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

No strategy formula, selected contract, paper/live order permission, raw quote, native option-chain observation or V1 route is changed by this repair.
