# OIIS Live V1 review — 9 August 2026

## Decision summary

- The corrected daily-screen regression exactly reproduces the supplied 3–6
  August evidence: 18 candidates — 1 HIGH, 11 MEDIUM and 6 LOW.
- INTELLECT on 3 August and OLAELEC on 5 August are the only two rows that also
  met canonical O/X permission on their signal date.
- Neither can be replayed as a recent live minute trade: every inspected minute
  source, including `public.bars_1m` and `nse_intraday`, has zero bars for those
  two symbols on those dates.  They are explicit `ENTRY_DATE_AFTER_SOURCE_END`
  skips, not assumed wins or losses.
- The fresh 7 August daily evaluation covered 500 stocks and produced zero
  valid daily candidates after enforcing unresolved hard gates.  Therefore the
  10 August generated watchlist is correctly empty; no trade has been invented.
  The UI remains able to add a monitor-only stock or a clearly audited manual
  paper-entry override.

## Three-year path study

Requested range: 1 August 2023 through 7 August 2026.

| Metric | Result |
|---|---:|
| Governed daily candidates | 2,485 |
| Canonically qualified candidates | 130 |
| Triggered trades | 115 |
| Distinct traded symbols | 97 |
| Intraday +0.30% actual exits | 106 (92.17%) |
| Later +1% swing actual exits | 9 (7.83%) |
| Open at data end | 0 |
| Gross path P&L | ₹83,142.02 |
| Current-profile estimated charges | ₹33,611.03 |
| Net before tax provision | ₹49,530.99 |
| 35% management tax provision | ₹17,335.85 |
| Net after provision | ₹32,195.14 |
| Median after-provision trade | ₹199.51 |
| Median actual holding time | 10 minutes |
| Maximum actual holding | 41 trading sessions |

These are unconstrained signal-path economics with a ₹2 lakh maximum ticket per
signal, not a finite-capital portfolio return.  Overlapping trades are not
capital-allocated in this report.  The unusually high closure rate is a direct
consequence of the authoritative no-stop/no-timeout rule: an unresolved D0
trade waits for an eventual +1% target.  The 41-session maximum holding period
is therefore a risk finding, not a defect to hide.

The cost scenario uses `india-equity-current:v1` for comparability across the
study.  It is a current-profile scenario, not a reconstruction of every
historical tariff version.  The 35% amount is a management provision, not tax
advice.

## Independent opportunity ladders

| Diagnostic | Hit rate |
|---|---:|
| Intraday +0.30% | 92.17% |
| Intraday +0.50% | 87.83% |
| Intraday +0.70% | 79.13% |
| D+5 +1% | 93.91% |
| D+5 +2% | 84.35% |
| D+5 +5% | 57.39% |

All levels were observed independently.  An I030 hit did not stop I050/I070 or
D+5/H30 diagnostics.  These alternative target outcomes must not be added
together as profit.

Median H30 maximum upside was 11.13%; the observed maximum was 57.86%.  Median
H30 adverse excursion was −6.76% and the worst was −33.79%.  That downside is
the key risk evidence created by a target-only strategy even though all 115
actual paths eventually closed positively in the available data.

## Regime context

| Nifty regime | Trades | I030 rate | Median H30 upside | Median H30 adverse | After-provision P&L |
|---|---:|---:|---:|---:|---:|
| SIDEWAYS | 58 | 91.4% | 9.10% | −7.86% | ₹16,093.83 |
| TRANSITION | 37 | 91.9% | 13.17% | −6.32% | ₹11,214.44 |
| UPWARD | 20 | 95.0% | 14.28% | −7.61% | ₹4,886.87 |

India VIX context was LOW for 88 trades, NORMAL for 24 and HIGH for only 3.
The HIGH-VIX sample is far too small for a robust conclusion.  Stock-regime
coverage is also incomplete: 93 of 115 trades lack a point-in-time stock-regime
label in the captured historical master.  Nifty conclusions are descriptive;
stock-regime comparison is explicitly not estimable from this run.

## Operational status

- The OIIS Live container is separate, paper-only, restart-safe and scheduled
  for 08:40 Asia/Kolkata.
- Selection, watchlist edits, every evaluated minute, entry claims, request and
  response evidence, heartbeats and errors are durable in `oiis_live.*`.
- The SmartAPI collector dynamically prioritises every active OIIS watchlist
  symbol.  The current count is zero because the corrected 10 August list is
  empty, not because collection failed.
- The protected UI route is `/strategy/oiis-live`.  It includes editing,
  readiness, source freshness, paper states and durable queue diagnostics.
- The OIIS error outbox delivered its synthetic end-to-end verification event
  successfully in one attempt.
- Paper API liveness and readiness pass.  Target lifecycle migration 002 is
  active, so S100 cannot execute on D0.

## Evidence

- `full-history/OIIS_V1_HISTORICAL_REVIEW.xlsx`: executive, candidates, trades
  and skips in one workbook.
- `full-history/OIIS_V1_TRADES.csv`: consolidated event-level paths with daily
  and entry indicators, Nifty/stock/VIX context, independent ladders, charges,
  tax provision and holding time.
- `recent-week/OIIS_V1_DAILY_CANDIDATES.csv`: exact 18-row regression set.
- `recent-week/OIIS_V1_SKIPPED_SIGNALS.csv`: explicit source-coverage failures.
- PostgreSQL historical run `49657e90-ba0e-4cfa-b295-da96a3d2949b` contains the
  final enriched 115-trade evidence.  Result hash:
  `80f588ab1763d2aa666ba75e0f0c8eea1bdcc56ce4a4e8394b2a4a08a8c4f267`.

## Known limitations

- Minute coverage, not daily selection, is the binding recent-week gap.
- The historical study is not a chronological finite-capital portfolio replay.
- Current charges are used as a common scenario across historical dates.
- True bid/ask and order-book impact are unavailable for the CSV history.
- The web build reports 13 dependency advisories (8 moderate, 3 high, 2
  critical).  The application builds and runs, but dependency remediation must
  be handled as a separate reviewed upgrade because an automatic major-version
  fix could break the existing dashboard.
