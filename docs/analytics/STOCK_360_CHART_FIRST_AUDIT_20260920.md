# Stock 360 chart-first audit and repair

Date: 20 September 2026  
Route: `/n50/analytics/stock/:symbol`  
Example inspected: `PNB`

## Cause found

The page treated the stock-explanation and market-summary requests as mandatory
for the entire first render. In the production baseline the PNB stock analytics
request took about 12.96 seconds, while the route deliberately returned no UI
until that request and the summary had both completed. The same component also
started monthly, yearly, OIIS, strategy-comparison, overview and MWHD requests at
once and placed the large OIIS evidence block before the price chart.

## Repair

- The canonical 1D OHLCV response now owns first paint. Secondary explanation,
  summary, overview and MWHD context start only after the chart payload arrives.
- OIIS, option-contract and backtesting evidence is fetched only when the user
  expands Full evidence. It remains available and no source value is changed.
- Removed the redundant 1M request. The 1M return is calculated from the last 22
  completed daily bars already present in the 1Y payload.
- Reordered the page to compact identity/KPIs, intraday chart, daily chart,
  one-line stock signals and then optional evidence.
- The intraday chart now has a dedicated lower pane for actual volume and
  per-bar traded value. The price pane remains fit only to observed session OHLC.
- Level labels are shortened to `15m`, `1H`, `Day`, `Week`, `Month`, `3M` and
  `Year`; `PDC` remains explicit. Their exact values and bases stay inspectable.
- Added a daily candlestick chart with daily volume, traded value and delivery
  percentage. Exchange-reported turnover is used when present; otherwise the
  displayed traded-value series falls back to `close × volume / 1 crore`.
  Missing delivery remains null and is never rendered as zero.
- Added `turnover_lacs` and `deliverable_pct` to non-1D stock bar responses using
  the existing indexed NSE daily-feature table. The join uses the exact
  `(symbol, series, trade_date)` key so chart enrichment does not defeat the
  existing index. No collector or strategy changed.
- No authorised TradingView recommendation source exists in the inspected app.
  The signal row says `Not connected`; no external recommendation is fabricated.

## Baseline evidence

Protected runtime evidence is stored outside Git at:

`/home/novius2/NIFTY50/evidence/stock-360-audit-20260920/`

Baseline production timings recorded there include:

- DOMContentLoaded: 277 ms
- `/n50/api/v1/intraday/stocks/PNB`: 12,959 ms
- cold `/n50/v1/stocks/PNB?range=1D`: 3,657 ms
- repeated 1D history request: 278 ms

## Validation contract

- Web typecheck, 225 tests and production build.
- API typecheck, 254 tests (including the added turnover/delivery missingness
  test) and production build.
- Canonical repository gate.
- Authenticated production browser check after deployment: chart-first layout,
  canvas count, daily delivery/traded-value presence, no page-level failure, and
  request timing captured again.

The page remains analytical and read-only. Paper/live order controls,
authentication, strategy formulas, collectors and stored market data are not
modified.
