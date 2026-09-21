# Scalper V2 refresh stamps and live Fit Day

Date: 21 September 2026

## Outcome

Scalper V2 now exposes the last successful browser data-refresh time in IST beside every chart title. The three native price charts continue to use the existing 15-second React Query refresh and incremental series update path; no browser navigation, full-page reload, native chart remount, or unchanged-data hydration was added.

While the horizontal view is `Fit day`, the chart now anchors at the selected session's first displayed bar and reserves a small readable future buffer (15 minutes at 1m, 30 minutes at 5m, and 60 minutes at 15m/1h), capped by the canonical session length. New completed candles fill those reserved slots without moving or stretching the viewport. The budget extends only after the buffer is consumed, rather than on every candle. Identical polling responses do not reset the range. `Last 30`, `Last 60`, replay/as-of, drawings, measurements and locked cursor state retain their existing behavior.

The underlying's futures/cash volume series is filtered to the same selected
session as its candles before entering the shared native time scale. Retained
warm-up volume therefore cannot displace the current-day NIFTY candles.

The live session follows the newest canonical trading day when the first new-day candle is returned. It does not invent a 09:00 candle or switch based on the workstation clock alone: regular NSE chart evidence begins when the canonical source supplies the new session. A deliberately older historical day remains selected.

## Files

- `apps/web/src/lib/scalperV2LiveSession.ts`: pure candle-signature, new-session, auto-fit and IST refresh-label rules.
- `apps/web/src/pages/TradingAnalyticsScalperV2.tsx`: query-success stamps, day following and new-candle fit orchestration.
- `apps/web/src/pages/scalper-v2/ScalperV2Chart.tsx`: refresh timestamp in each native price-chart header.
- `apps/web/src/pages/scalper-v2/ScalperV2.module.css`: compact refresh status treatment.
- `apps/web/tests/scalperV2LiveSession.test.ts`: rollover, fit policy, signature and timezone coverage.
- `tools/playwright/capture-scalper-v2-fit-day.mjs`: authenticated pop-out capture of a readable full-page PNG and the matching workstation JSON.
- `scripts/systemd/n50-scalper-v2-capture.{service,timer}`: five-minute weekday-session capture schedule.

## Five-minute evidence archive

During the regular weekday capture window (09:15–15:35 IST), the timer opens the
authenticated NIFTY Scalper V2 pop-out at 5m, explicitly selects Fit Day, waits
for all three native charts and writes a timestamp-paired PNG and JSON to:

```text
/home/novius2/NIFTY50/00-Screnshots/YYYY-MM-DD/
```

The service reads the existing protected local authentication configuration;
no credential is stored in source or in the capture directory. Outside the
capture window it exits successfully without generating duplicate overnight
files. A failed capture writes a timestamped `.error.json` rather than passing
an old screenshot off as current.

## Preservation

No strategy, source values, query contract, collector, API, signal, OI arithmetic, order control or notification behavior changed. A successful HTTP refresh can update the displayed receipt time even when the source returns identical candles; the native series correctly performs no write in that case.

## Validation

- Web typecheck: PASS.
- Web unit tests: PASS, 252/252.
- Web build: PASS.
- API typecheck/build and 263/263 tests: PASS.
- Canonical repository gate: PASS.
- Authenticated deployed Chromium: PASS. Refresh advanced from `09:50:30`
  to `09:50:48 IST`; session `2026-09-21`; three native roots; nine visible
  chart refresh stamps; one initial document request and no subsequent page
  navigation; zero page errors.
- Production: dashboard-only deployment, healthy with zero restarts on image
  `sha256:fb9606674b3416b20a8a852a52b4a9ee41d3f57e275694b2ba9d2f3e055baf61`.

### Stable-range and archive follow-up

- Web typecheck, 254/254 web tests and production build: PASS.
- Canonical repository gate: PASS. API typecheck/build and 263/263 tests from
  the immediately preceding same-scope release remained PASS; no API changed.
- A persistent authenticated 1m browser session received one incremental update
  in each of NIFTY, CE and PE. All three logical bounds stayed exactly
  `[-0.5, 87.5]`; there was one document request and zero page errors.
- Final 5m screenshot visually confirms NIFTY, CE and PE all begin at 09:15,
  remain readable and share `[-0.5, 19.5]` at the captured point.
- The installed systemd timer is active. Its service-owned capture completed
  with status 0 and wrote both files as `novius2:novius2`.
- Final dashboard image:
  `sha256:ca6478905f22312c603d758cf4cbf73e386ec34e56ffb72ebf79b6d4607fb5a0`;
  healthy with zero restarts. Release commit: `6647837`.
