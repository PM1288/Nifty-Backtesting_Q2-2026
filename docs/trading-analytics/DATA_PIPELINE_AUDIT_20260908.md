# Trading Analytics data-pipeline audit — 8 September 2026

## Verdict

The application does pull canonical SmartAPI ticks and persist one-minute OHLCV
bars before constructing the 5/15/60-minute chart evidence. EMA9, RSI14 and
MACD(12,26,9) are calculated from completed aggregated candles, not from daily
bars. Missing source minutes remain partial and do not silently confirm a rule.

Coverage is not complete for every instrument present in the current master.
The live WebSocket subscription set is capped at 3,000. At the audited refresh,
3,755 instruments were planned, 3,000 were activated and 755 were explicitly
dropped. All 208 subscribed stock-option underlyings retained at least one option
contract with minute evidence, but BANKNIFTY, FINNIFTY and MIDCPNIFTY option
contracts are not active because `universe.options.index_underlyings` currently
contains only `NIFTY50`.

## Source-to-calculation chain

| Evidence | Authoritative source | Persistence | Derived use | Audit state |
|---|---|---|---|---|
| Equity/index ticks | SmartAPI WebSocket, LTP mode | `instrument_state`, sampled ticks, `bars_1m` | 5/15/60m OHLC; EMA9; RSI14; MACD; price path | Working for subscribed instruments |
| Option ticks | SmartAPI WebSocket, SNAPQUOTE mode | `instrument_state`, `quote_snapshots`, `bars_1m` | Exact CE/PE candles and same-time delta/P&L measurement | Working for subscribed contracts; not every master contract |
| Option OI | SNAPQUOTE plus retained quote snapshots | `quote_snapshots`, OI snapshot tables | OI timeline, observed-window PCR and indicative observed-window max-pain minimum | Working where the selected cohort is complete; not full-chain certified |
| Bid/ask and depth | SmartAPI FULL/SNAPQUOTE | quote/depth tables | Liquidity and market-book evidence | Working; quote-time/freshness remains independent of candle completeness |
| Greeks | SmartAPI Greeks endpoint | `option_greeks` | Delta display when an exact contract/time match exists | Degraded: repeated provider `No Data Available` and occasional 403 responses |
| Cash FII/FPI/DII | Official NSE cash report | `institutional_flow.normalized_nse_fii_dii` | Morning Cash Mkt row and same-date matrix input | Latest completed report 2026-09-07 loaded successfully |
| FII derivative activity | NSE daily report | `market_data.nse_fii_derivatives_stats` | Morning futures/options activity | Daily report, not minute-derived |
| Participant OI/volume | NSE participant reports | participant OI/volume tables | Participant positioning panels | Daily report, not cash FII/FPI and not minute-derived |
| Daily price history | SmartAPI daily bars | `bars_1d` | Daily/weekly/monthly context and resistance previews | Latest stored trade date 2026-09-07, 277 rows |

## Live database evidence

Audit time was before the 8 September regular session. Therefore 7 September is
the latest completed-session coverage basis. Premarket/current quote activity must
not be described as a completed intraday candle set.

### Completed-session minute coverage

| Scope | Result |
|---|---:|
| Current master stock-option underlyings | 210 |
| Underlyings with NSE minute bars | 208 |
| Missing NSE minute underlyings | ATHERENERG, SAGILITY |
| Mean NSE minutes per covered underlying | 274.2 |
| Active subscribed stock-option underlyings | 208 |
| Active stock-option contracts | 2,155 |
| Active stock-option contracts with minutes | 2,148 (99.68%) |
| Stock-option underlyings with any option minutes | 208/208 |
| Active index-option contracts | 148, all NIFTY50 |
| Active NIFTY option contracts with minutes | 148/148 |
| Active WebSocket subscriptions | 3,000 |
| Planned instruments dropped at cap | 755 |

Minute counts below the theoretical session maximum do not automatically mean a
database outage: the store records observed ticks and does not synthesize a bar
for a minute with no qualifying observation. The chart aggregator records exact
coverage and marks a 5-minute candle complete only when all five source minutes
exist with valid OHLC.

### Real API replay at 5-minute interval

| Underlying / exact pair | Source minutes | Aggregated bars | Complete bars | Finding |
|---|---:|---:|---:|---|
| NIFTY | 3,021 | 449 | 426 | Indicator warm-up available |
| NIFTY 23,800 CE / PE, 8 Sep | 1,440 / 1,442 | 292 / 292 | 272 / 272 | Exact option path available |
| BANKNIFTY | 3,021 | 449 | 424 | Underlying indicators available |
| BANKNIFTY 57,100 CE / PE, 29 Sep | 0 / 0 | 0 / 0 | 0 / 0 | Index option subscription missing |
| RELIANCE | 2,912 | 449 | 422 | Indicator warm-up available |
| RELIANCE 1,310 CE / PE, 29 Sep | 1,967 / 1,957 | 418 / 415 | 347 / 344 | Exact option path available |
| SBIN | 2,900 | 449 | 416 | Indicator warm-up available |
| SBIN 1,010 CE / PE, 29 Sep | 1,375 / 1,366 | 299 / 297 | 237 / 232 | Exact option path available |

## Calculation correctness

1. `/v1/trading-analytics/charts` reads `bars_1m` with event time and
   `created_at <= asOf`, bounded to the trading calendar.
2. `sessionBars` aggregates only observed source minutes into 5/15/60-minute
   OHLC and records `coverage`, `expectedMinutes`, `partialSessionBar` and
   `closed` for every result.
3. EMA9 uses nine completed closes with an SMA seed and alpha 0.2.
4. RSI14 and MACD are display-only calculations over completed selected-interval
   closes. A partial candle resets warm-up; missing values remain null.
5. Exact CE/PE measurement uses matching completed bar end-times. Combined
   CE+PE delta and P&L are not produced when either leg is missing.
6. OI/PCR/max-pain inputs come from quote/OI snapshots. They are not derived
   from price candles and must retain their own timestamps and coverage labels.
7. Cash FII/FPI and participant reports are official daily publications. It
   would be incorrect to attempt to derive them from minute price bars.

## Material gaps

### P0 — coverage semantics

- The master-backed selector exposes instruments for which no option-minute
  subscription exists. The UI correctly shows missing data, but a separate
  `subscribed / minute-covered / quote-covered` state should be first-class.
- The 3,000 WebSocket ceiling drops 755 planned instruments. The current result
  retains some option coverage for all 208 subscribed F&O stocks, but does not
  retain every planned strike.
- ATHERENERG and SAGILITY appear eligible from the current master but had no NSE
  minute record in the completed-session window and are not active option
  underlyings. Their current eligibility/master reconciliation needs correction.

### P0 — index options

- Only NIFTY50 is configured under `universe.options.index_underlyings`.
  BANKNIFTY, FINNIFTY and MIDCPNIFTY underlying minutes exist, but their exact
  CE/PE minute series are not collected. Adding them without a capacity plan
  could displace stock-option contracts at the hard subscription ceiling.

### P1 — data quality and indicators

- The chart endpoint currently selects OHLC but omits the persisted minute
  `volume`; therefore future VWAP/relative-volume calculations must add volume
  to the aggregation contract rather than infer it from quote counts.
- RSI/MACD are calculated in the browser. The implementation is deterministic
  and tested, but the values are not persisted as an immutable server-side
  decision snapshot. They must not be described as historical strategy inputs.
- Provider Greeks are degraded outside normal availability windows and have
  exact-contract coverage gaps. A Greek must remain unavailable rather than be
  substituted from a different strike.
- The observed-window max-pain minimum is not a certified full-chain max-pain
  value. PCR and max pain must carry strike-window denominator and source time.

## Required next engineering changes

1. Add an explicit capacity/prioritisation plan before subscribing additional
   index option families: preserve all 208 F&O underlyings, reserve a documented
   near-ATM band for NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY, and expose dropped
   counts by family.
2. Add `volume` to the minute query and aggregated candle contract, with tests
   for sum semantics and missing source volume. Only then implement interval
   VWAP and relative-volume calculations.
3. Add a coverage object to the chart API: requested instrument, subscribed,
   source-minute count, complete-bar ratio, latest event time and latest known
   time. Gate indicator state independently for each underlying/CE/PE pane.
4. Reconcile ATHERENERG and SAGILITY against the date-effective subscription
   universe; do not create synthetic bars.
5. Materialise server-side indicator snapshots only if they will affect a
   decision or audit record. Until then the existing browser indicators remain
   clearly display-only.
6. Alert when planned subscriptions exceed capacity or any required underlying
   lacks fresh minute coverage. A healthy process alone is not sufficient.

## Operational state

- SmartAPI collector container: healthy.
- Collector health endpoint: `status=ok`.
- Active broker subscriptions: 3,000.
- Cash NSE ingestion was manually refreshed on 8 September and loaded the
  official 7 September FII/FPI and DII report.
- No paper or broker order was submitted during this audit.

