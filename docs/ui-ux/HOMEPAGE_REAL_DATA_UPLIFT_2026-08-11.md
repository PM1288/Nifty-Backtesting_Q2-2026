# Homepage real-data uplift — 11 August 2026

## Outcome

The production homepage was upgraded against `homepage-upflit/REAL_DATA_WIRING.md` without replacing the established sector-canvas layout. The homepage now uses the complete active NSE F&O contract master for coverage and anomaly counts, presents all 208 mapped F&O stock underlyings in the sector canvas, preserves the supporting global/commodity panel, and makes OIIS selections and urgent derivative anomalies visually explicit.

This is a monitoring and research surface. It does not place broker orders and does not add a live-order code path.

## Critical review findings

1. The previous stock canvas queried `nifty100_equity`, so it could not represent the full F&O stock universe.
2. The supporting-metrics section already carried Dow Jones, Brent crude, USD/INR and other global series, but CSS suppressed the entire section.
3. The overview response lacked bid/ask, spread, session range, five-day change, relative volume, 30-day opportunity and OIIS selection fields.
4. No homepage contract-level surface exposed large asks, large bids, excess moves or wide spreads.
5. The sector layout was useful and familiar, so it was retained rather than replaced.
6. Ranking every anomaly solely by raw bid/ask imbalance caused expiring index strikes to monopolise the list. Promotion is now diversified to at most two contracts per underlying while the aggregate counts still cover every contract.
7. Live SmartAPI capacity cannot observe all 36,343 active contracts simultaneously. The UI therefore separates the complete master universe from observed-today coverage and never converts an unobserved contract to zero.

## Real-data sources

| UI value | PostgreSQL source | Rule |
| --- | --- | --- |
| F&O stock universe | `public.instruments` plus mapped NSE cash instruments | Active `FUTSTK`/`OPTSTK`, expiry from today through one year, test symbols excluded |
| Live stock quote and depth | `public.instrument_state` | NSE cash token for each F&O underlying |
| Daily indicators | `public.bars_1d` | RSI 14, Williams %R 14, five-session change and 20-session average volume |
| OIIS purple selection | latest completed `oiis_live.selection_run` joined to `oiis_live.daily_candidate` | `recommended`, `auto_paper_eligible` or `auto_paper_selected` |
| 30-day opportunity lens | `strategy_eval.long_horizon_observation` | latest governed result by symbol where available |
| Contract universe and anomalies | `public.instruments` joined to `public.instrument_state` | All genuine active `FUTIDX`, `FUTSTK`, `OPTIDX`, `OPTSTK` contracts |
| Global and commodity strip | existing supporting-metrics API | Dow Jones, Brent crude, USD/INR, gold, silver and available global indices |

## Current verified production snapshot

Captured after deployment on 11 August 2026:

| Measure | Verified value |
| --- | ---: |
| F&O stock underlyings rendered | 208 |
| Unique stock symbols rendered | 208 |
| OIIS-selected stocks highlighted | 15 |
| Active genuine NSE F&O contracts | 36,343 |
| Stock and index underlyings in contract master | 213 |
| Contracts observed today | 3,898 |
| Contracts meeting at least one anomaly rule | 2,158 |
| Big-ask anomalies | 246 |
| Big-bid anomalies | 158 |
| Excess-price-move anomalies | 1,412 |
| Wide-spread anomalies | 895 |
| Promoted detailed anomaly rows | 36 across 25 underlyings |

These values are a time-specific observation and will change with the instrument master and live collector state.

## Anomaly rules

Only contracts observed on the current IST date may be classified as a live anomaly.

- Excess price move: absolute option change at least 20%, or absolute future change at least 3%.
- Big ask: ask quantity is at least five lots or 100 units, whichever is greater, and at least five times the bid quantity.
- Big bid: the symmetric bid-side rule.
- Wide spread: at least 8% for options or 1% for futures, using valid positive bid and ask values.
- Severity inputs are capped before sorting so an opposing quantity of zero cannot generate an unbounded rank.
- Detailed promotion is limited to two contracts per underlying to keep the alert board diverse. Aggregate counters are not capped.

## Homepage behaviour

- The sector canvas defaults to stable sector/alphabetical order; live ticks do not make tiles jump.
- An explicit strength sort remains available.
- Lenses: 1-day price, 5-day price, relative volume, RSI, Williams %R, OIIS and governed 30-day opportunity.
- OIIS-selected stocks have a persistent 2px purple border and `OIIS` badge across every lens.
- Stock-level excess moves, large asks/bids and wide spreads show an alert marker.
- A compact above-fold F&O strip guarantees that a big-ask and an excess-move candidate are promoted when available.
- The complete radar shows coverage counters and up to 36 diversified detailed anomaly cards.
- Missing indicator, depth or opportunity data is displayed as unavailable, not zero.
- Dow Jones, Brent crude and other available supporting metrics are visible again.

## Verification

Commands executed:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal
npm run typecheck --workspace=@app/api
npm run typecheck --workspace=@app/web
npm test --workspace=@app/api

cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
PLAYWRIGHT_ADMIN_PASSWORD='<mounted runtime secret>' \
PLAYWRIGHT_BASE_URL='http://127.0.0.1:19090/n50' \
node tools/playwright/homepage-real-data-regression.mjs
```

Results:

- API TypeScript typecheck: pass.
- Web TypeScript typecheck: pass.
- API tests: 60 passed, 0 failed.
- Playwright homepage regression: 20 passed, 0 failed.
- Production dashboard container: healthy, zero restarts after final deployment.
- Browser assertions cover all 208 unique F&O stocks, 36,343 contract count, OIIS purple border, above-fold anomaly flash, big ask/excess move, full radar, Dow, Brent, lens switching, search, no horizontal overflow, no application request failures and no console errors.

## Evidence

- 16:9 screenshot: `output/playwright/homepage-real-data/homepage-all-fno-1920x1080.png`
- Full-page screenshot: `output/playwright/homepage-real-data/homepage-all-fno-full-page.png`
- Machine-readable test results: `output/playwright/homepage-real-data/results.json`
- Regression script: `tools/playwright/homepage-real-data-regression.mjs`

## Known operational boundary

The contract master is complete, but live observation is intentionally rate-safe and rotating. At the verified snapshot, 3,898 of 36,343 active contracts had a current-session observation. The homepage reports both numbers and does not imply that all active contracts were simultaneously subscribed. Expanding instantaneous live coverage beyond SmartAPI subscription capacity requires a licensed higher-capacity market-data source or a deliberately broader rotation interval; it must not be achieved by violating broker rate or socket limits.
