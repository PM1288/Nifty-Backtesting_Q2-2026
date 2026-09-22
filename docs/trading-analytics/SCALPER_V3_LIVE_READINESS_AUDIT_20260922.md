# Scalper V3 live-readiness audit — 22 September 2026

## Outcome

Scalper V3 passed the recorded-data browser refresh and layout gates. The page polls without a document reload, keeps the same three Lightweight Charts roots, and applies a changed latest candle through incremental `series.update` operations rather than chart rehydration.

One collector defect was found and repaired: live-only SmartAPI aggregate jobs continued after the NSE session and generated repeated `No Data Available` responses. Option Greeks, gainers/losers, OI buildup and PCR now retain their final observation and suppress REST polling outside the configured weekday session. This protects the bounded broker request budget for the next open session.

## Production data evidence

The 22 September 2026 session contained:

- 148 distinct NIFTY expiry-day option tokens and 52,809 NFO minute bars from 09:15 through 15:31 IST.
- 187 NSE chain snapshots for the 22 September expiry and 187 for the 29 September expiry, each with 4,862 retained legs, through 15:28 IST.
- 152 active NIFTY 29 September option subscriptions after rollover, spanning strikes 21,600–25,350.
- Three WebSocket shards with 3,000 total admitted subscriptions and zero archive drops at audit time.
- An exchange-session-aware option-chain watcher in healthy state. Its last successful session poll was 15:28 IST, followed by intentional outside-session suppression.

The default pre-open V3 context rolls to the next valid expiry. Its CE/PE price panes remain honestly empty until those newly active contracts receive session minute bars; retained chain OI is not converted into synthetic candles.

## Browser evidence

Command:

```bash
cd /home/novius2/trading-stack
node tools/playwright/scalper-v3-live-readiness.mjs
```

Result:

- PASS, one document navigation.
- Two chart requests across hydration and the 15-second refresh interval.
- Three native chart roots before and after the refresh.
- `setData`: remained `1` for NIFTY, CE and PE.
- `update`: advanced from `0` to `1` for NIFTY, CE and PE.
- No browser page errors.
- Recorded API response times in this after-hours run: 2,647 ms and 3,623 ms.
- Browser correctly reported `closed`; this audit did not falsify the exchange state.

Artifacts:

- `/home/novius2/NIFTY50/evidence/scalper-v3-live-readiness-20260922/results.json`
- `/home/novius2/NIFTY50/evidence/scalper-v3-live-readiness-20260922/scalper-v3-recorded-live-update.png`

The compact-layout audit also passed 11/11 checks at 1920×1080 and 1440×900:

- `/home/novius2/NIFTY50/evidence/scalper-v3-compact-20260922/results.json`
- `/home/novius2/NIFTY50/evidence/scalper-v3-compact-20260922/desktop-1920-scalper-v3.png`
- `/home/novius2/NIFTY50/evidence/scalper-v3-compact-20260922/desktop-1440-scalper-v3.png`

## Validation contract

The live-readiness script uses actual retained 22 September NIFTY, CE and PE candles. It modifies only the latest HTTP response in the browser to deterministically exercise the next live update. It makes no database writes and does not claim that a synthetic response is a live exchange tick.

True open-market acceptance remains a separate observation: during the next NSE session, confirm that Sep-29 CE/PE minute bars advance and that the V3 header moves from `LIVE` to `DELAYED`/`STALE` at the configured thresholds without reloading the page.

## Operational verification

```bash
# Collector health
curl -fsS http://127.0.0.1:19090/option-chain/healthz | jq .

# V3 browser refresh regression
cd /home/novius2/trading-stack
node tools/playwright/scalper-v3-live-readiness.mjs

# Required repository gates
go test ./...
cd neon-stock-terminal/apps/web && npm run typecheck && npm test && npm run build
cd ../api && npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack && bash scripts/verify/canonical-repository-gate.sh
```

## Limits

- The audit ran after market close, so a real next-session exchange tick was not observable.
- The WebSocket health table reports `STALE` outside exchange hours by design; this is not treated as a live-session failure.
- API response times were measured locally against the deployed stack and include database aggregation of the retained 15-day chart payload.
