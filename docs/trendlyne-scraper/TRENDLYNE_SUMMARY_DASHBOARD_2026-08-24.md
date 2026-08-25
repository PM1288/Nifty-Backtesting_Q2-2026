# Trendlyne Summary Strategy Dashboard

## Outcome

The authenticated Strategy menu now includes **Trendlyne Summary** at:

`/n50/strategy/trendlyne-summary`

The dashboard evaluates the trailing six months of stored Trendlyne research reports and exposes:

- report/open date;
- NSE symbol and company name, including the shared stock identity/logo component;
- research house;
- Buy, Accumulate, Sell, Hold or Neutral recommendation;
- recommendation price and published target;
- first target-hit date and observed-session number;
- direction-normalised 5-session and 30-session closing return, maximum favourable excursion and maximum adverse excursion;
- latest return while a target remains open;
- data-quality state and explicit exclusion reasons;
- research-house, stock and monthly-cohort summaries;
- CSV export and a row inspector linked to Stock 360 and the source report.

This is third-party research evidence. It is not an application-generated recommendation and it is not mixed with OIIS, Monthly or Rolling strategy results.

## Current validated population

Refreshed after the production startup run on 24 August 2026:

| Measure | Value |
|---|---:|
| Named six-month recommendation records | 2,613 |
| Directional Buy/Accumulate/Sell records | 2,100 |
| Buy | 1,821 |
| Accumulate | 184 |
| Sell | 95 |
| Hold retained for review | 328 |
| Neutral retained for review | 185 |
| Target hits | 494 |
| Mature 5-session paths | 2,044 |
| Mature 30-session paths | 1,285 |
| Fully valid records | 2,572 |

Hold and Neutral records remain available through the **All recommendations** filter but do not enter directional return or target-hit rankings.

## Calculation policy

### Entry and path start

The published Trendlyne recommendation price is the evidence entry price. If it is unavailable, the next NSE session open is used and labelled `NEXT_SESSION_OPEN_FALLBACK`.

The observable market path starts on the first NSE trading session strictly after `report_date`. Trendlyne report publication time is not available in the stored source, so using the report-date high or low could create same-day look-ahead.

### Direction normalisation

For Buy and Accumulate:

`return = 100 × (observed price / entry price − 1)`

For Sell:

`return = 100 × (1 − observed price / entry price)`

Thus favourable values are positive and adverse values are negative for both directions.

### Target hit

- Long target: first daily high greater than or equal to the target.
- Short target: first daily low less than or equal to the target.
- A missing target or a target on the wrong side of the entry remains visible but is not target-eligible.
- Research-house target-hit rate uses resolved targets only: a target is resolved when it hit or the 30-session window matured.
- The ranking chart requires at least ten resolved targets; the table always retains the denominator.

Daily OHLC proves that the target traded during a session, but cannot establish intraday ordering relative to another event.

### Price-source priority

1. `public.bars_1d` joined to `public.instruments` — SmartAPI daily bars.
2. `nse.fact_eod_prices` with `series = 'EQ'` — NSE EOD bhavcopy fallback.

One price row per symbol/session is retained, preferring SmartAPI. Point-in-time `LTIM` is normalised to current symbol `LTM` for lineage compatibility.

## Morning automation

The existing Docker scheduler runs on container startup and every weekday at **07:00 Asia/Kolkata**. After each successful collection cycle, including a zero-insert run, `refresh_recommendation_analysis()` rebuilds the six-month evaluation. This allows developing 5D and 30D paths to mature as new daily prices arrive.

The production startup proof completed successfully:

```text
run_id: 69a05f55-a9ee-4e43-964d-13c743507ced
status: SUCCESS
new reports inserted: 0
evaluations rebuilt: 2,613
next scheduled run: 2026-08-25 07:00 IST
```

The run remains idempotent. Existing reports are retained, only unseen report IDs are inserted, and the evaluation table is rebuilt transactionally.

## Implementation map

| Layer | File / object |
|---|---|
| Database migration | `db/sql/053_trendlyne_recommendation_evaluation.sql` |
| Evaluation engine | `services/trendlyne_scraper/analysis.py` |
| Morning integration | `services/trendlyne_scraper/incremental.py` |
| API | `neon-stock-terminal/apps/api/src/routes/trendlyneSummary.ts` |
| API registration | `neon-stock-terminal/apps/api/src/routes/index.ts` |
| OpenAPI | `neon-stock-terminal/docs/openapi/trendlyne-summary.openapi.yaml` |
| Web API client | `neon-stock-terminal/apps/web/src/lib/api.ts` |
| Dashboard | `neon-stock-terminal/apps/web/src/pages/TrendlyneSummaryPage.tsx` |
| Dashboard styles | `neon-stock-terminal/apps/web/src/pages/TrendlyneSummaryPage.module.css` |
| Route | `neon-stock-terminal/apps/web/src/App.tsx` |
| Strategy dropdown | `neon-stock-terminal/apps/web/src/components/chrome/workspaceRoutes.ts` |
| Command search | `neon-stock-terminal/apps/web/src/interaction/routeCatalog.ts` |
| API contract test | `neon-stock-terminal/apps/api/src/routes/trendlyneSummary.test.ts` |
| Browser regression | `tools/playwright/trendlyne-summary-regression.mjs` |

## Independent calculation sample

PAYTM report `5745486`, issued 22 July 2026 by ICICI Securities Limited:

| Input / result | Value |
|---|---:|
| Recommendation entry | ₹1,267.00 |
| First five observed sessions | 23–29 July 2026 |
| Five-session closing price | ₹1,330.00 |
| Five-session high | ₹1,335.30 |
| Five-session low | ₹1,236.50 |
| Independently calculated 5D close return | +4.9724% |
| Dashboard 5D close return | +4.9724% |
| Independently calculated 5D maximum profit | +5.3907% |
| Dashboard 5D maximum profit | +5.3907% |
| Independently calculated 5D maximum drawdown | −2.4073% |
| Dashboard 5D maximum drawdown | −2.4073% |
| Target ₹1,498 first hit | 10 August 2026 |

Result: **PASS**.

## Verification performed

- API TypeScript typecheck: pass.
- Web TypeScript typecheck: pass.
- Production Vite build: pass.
- Trendlyne API contract test: pass.
- Scraper unit suite in its Docker runtime: 3/3 pass.
- Production dashboard and scraper containers: healthy.
- Production startup scrape and full evidence rebuild: success.
- Playwright desktop regression: 16/16 checks passed, including the Strategy dropdown entry.
- Verified authentication, API population, stock symbol/name completeness, two charts, recommendation filter, stock filter, inspector, Stock 360 link, contained page overflow, console and request health.

Evidence:

- `tools/playwright/output/playwright/trendlyne-summary-20260824/results.json`
- `tools/playwright/output/playwright/trendlyne-summary-20260824/trendlyne-summary-desktop.png`

## Data-quality disclosures

- Trendlyne has no stored report publication time, so the first post-report session is deliberately used.
- Missing and directionally inconsistent targets are never converted to zero and never improve or reduce the target-hit denominator.
- A recommendation is not a broker fill. The published recommendation price is analysed as research evidence.
- “Open” means target not observed as hit within the available path; Trendlyne does not provide a canonical position-close ledger in this dataset.
- Sixteen directional records currently lack enough matching price data for a complete evaluation. They remain visible rather than disappearing.
- Existing source defects are disclosed in `data_quality_reasons` and the dashboard inspector.

## Backup and rollback

Pre-change backup directory:

`/home/novius2/trading-stack/backups/trendlyne-summary-20260824T1830Z`

Database dump:

`trendlyne_before_summary.dump`

SHA-256:

`c4cb38d0de401c60aa0d9f4f179fa4448af7af640847385bdaef9d2e6e167dda`

Rollback is additive and does not require deleting source reports:

1. Redeploy the prior dashboard image.
2. Redeploy the prior scraper image.
3. Remove route/menu registrations if reverting source.
4. The derived `research.trendlyne_recommendation_evaluation` table may remain unused; never delete `research.trendlyne_reports`.

## Operator commands

Run a bounded manual collection and evidence refresh:

```bash
docker exec trading-stack-novius2-trendlyne-scraper-1 python incremental.py --trigger manual --max-pages 25
```

Inspect the latest durable run:

```bash
docker logs --tail 200 trading-stack-novius2-trendlyne-scraper-1
```

Run browser verification:

```bash
cd /home/novius2/trading-stack/tools/playwright
PLAYWRIGHT_ADMIN_PASSWORD="<local-admin-password>" node trendlyne-summary-regression.mjs
```
