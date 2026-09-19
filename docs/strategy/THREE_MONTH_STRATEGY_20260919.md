# 3Month Strategy — implementation and evidence

Date: 19 September 2026  
Route: `/strategy/three-month`  
API: `GET /v1/strategy/three-month?intradayMode=completed|forming`  
Version: `three_month_recovery_v1`

## Scope

This is a new, read-only NIFTY 500 profile screener. It does not replace or
modify Monthly Strategy, MWHD, OIIS, paper trades, order permissions, alerts or
any entry/exit rule. It produces a candidate only; it does not invent an entry,
stop, target, position size, volume gate, exit or re-entry rule.

## Exact formula

All ten bullish gates must pass:

1. current month close/as-of value > current month open;
2. current month close/as-of value > previous month open;
3. current week close/as-of value > current week open;
4. current week close/as-of value > previous week open;
5. current day close/as-of value > previous day open;
6. current day close/as-of value > current day open;
7. selected current 1-hour close > its open;
8. selected current 1-hour close > the immediately previous 1-hour open;
9. selected current 15-minute close > its open;
10. selected current 15-minute close > the immediately previous 15-minute open.

In addition, at least one of M-1, M-2 or M-3 must have close < open. The three
historical checks use OR; missing history never becomes a pass or a zero.

`QUALIFIED` means all ten gates plus the historical OR passed. `REJECTED` means
at least one known gate failed. `INCOMPLETE` means evidence was unavailable or a
lower stage was intentionally not evaluated.

## Candle policy

The default is `completed`. Intraday buckets are anchored to the NSE cash
session at 09:15 IST. A bucket is complete only when every expected one-minute
observation is present through its final minute. The previous candle is the
immediately adjacent bucket; a gap is not replaced with a nearby candle.

`forming` is an explicit alternate inspection mode. It may use the latest
incomplete 1-hour and 15-minute buckets. Such gates carry a forming marker and
can reverse before candle close. The current month, week and day values are
as-of/current-period values rather than audited final-period closes.

Intraday data is queried only for rows whose six higher-timeframe gates and
historical weakness gate pass. Every available membership row remains in the
response; non-eligible lower gates are `SKIPPED`, not false or zero.

## Sources and current limitation

Daily source precedence is: same-session `instrument_state`,
`strategy_eval.stock_daily_regime`, NSE EOD prices, then retained daily bars.
Intraday uses retained NSE one-minute bars.

The database currently contains 268 `instrument_profiles` rows and all 268 are
flagged `is_nifty_500`, source date 23 August 2026. It does not currently contain
all 500 benchmark constituents. The UI therefore shows `Profile coverage
268/500` rather than claiming complete NIFTY 500 coverage. This source-universe
gap is visible evidence and is not repaired by inventing symbols or silently
mixing another universe.

## UI and export

The Strategy menu, workspace navigation and command palette expose the route.
The screen provides a dense row per available member, grouped two-column
Month/Week/Day/1H/15m gates, three separate weakness cells, search/status
filters, exact arithmetic in a side inspector, Stock 360 links and CSV export.
PASS, FAIL, unavailable and skipped are visually and semantically distinct.

## Release validation

- API typecheck, complete API test suite and API build.
- Web typecheck, complete web test suite and web build.
- Live read-only SQL execution for both intraday policies.
- Canonical repository preservation gate.
- Authenticated browser route, navigation, mode, arithmetic drawer, CSV and
  responsive layout checks after deployment.

All repository checks passed: API typecheck, 252 API tests and build; web
typecheck, 217 web tests and build; canonical repository gate. Live session
2026-09-18 produced 268 available members, 20 intraday-evaluated rows and 6
completed-candle qualifiers. Every qualified row was browser-checked to contain
exactly ten PASS gates plus a PASS historical-weakness OR.

The initial cold read measured about 24 seconds. The final set-based token map,
index-friendly exact-session query and post-computation per-mode cache measured
2.38 seconds daily plus 1.49 seconds intraday in the same live database check.
The final authenticated public desktop/mobile suite completed 23/23 checks in
7.75 seconds, covering the API, grouped gates, completed default, forming mode,
arithmetic drawer, CSV and responsive table. Screenshots and machine results:
`/home/novius2/NIFTY50/evidence/three-month-strategy-20260919`.

Release commits `735320b`, `a142d92` and `c05d0ef` are on `master` and
`feat/three-month-strategy-20260919`; rollback tag
`before-three-month-strategy-20260919` is pushed. The scoped dashboard deployment
recreated only `n50-dashboard`; container `62ff9d61d74c...` is healthy with entry
asset `/n50/assets/index-CUjDGsLd.js`. No database migration or data mutation was
performed.

## Light compact presentation repair — 19 September 2026

The existing route now follows the application's light workspace treatment.
The hero, summary, controls, table and arithmetic drawer use white/light
surfaces with dark readable text; strategy calculations, API data and state
colours are unchanged.

The primary table displays only the exchange symbol in the sticky stock column.
Company name, sector, qualification and score remain available in the row hover
description and accessible label, while exact gate arithmetic remains in each
gate tooltip and the click-open drawer. Body rows are capped at 30px in the
normal desktop presentation so the screener exposes substantially more stocks
without hiding evidence.

Browser acceptance additionally verifies the computed light background, row
height, absence of the redundant company-name line, hover metadata and the
existing arithmetic drawer at desktop and mobile sizes.
