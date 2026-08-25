# NSE Intelligence implementation report

**Implemented:** 13 August 2026
**Canonical route:** `/institutional/nse-intelligence`
**Compatibility route:** `/nse-intelligence`

## Outcome

The prior planning-only deliverable is now integrated into the authenticated NIFTY 50 Trader application. NSE Intelligence is visible as a Data & Operations secondary header tab and is searchable through Search & Commands.

No hard-coded market arrays from the supplied HTML prototype were copied. The dashboard reads the existing PostgreSQL `nse` schema and separates scheduler outcome from dataset readiness.

## Delivered views

- Command Centre: current official breadth, turnover, breadth trend and top gainers/losers.
- Deals & Events: normalized `fact_text_events` records with source date and source file.
- Reports & Health: exact scheduler timestamps, job state, notification state and all 17 configured report attempts.
- Sector Activity: explicit blocked state until effective-dated sector membership is complete.
- F&O Positioning: explicit blocked state until official contract, MWPL and ban datasets are complete.

Unsupported report widgets are omitted rather than rendered as zero.

## API

```text
GET /v1/nse-intelligence/overview
GET /v1/nse-intelligence/reports
GET /v1/nse-intelligence/health
```

All routes use the existing authenticated `/v1` guard. The response exposes trade date, generated/data timestamps, feature version, readiness, ingestion, cash breadth, trend, movers, events, report lineage, unavailable modules and sources.

## Reconciled production state

- Source date: 12 August 2026.
- Daily job: `PARTIAL`.
- Analytical readiness: `DEGRADED`.
- Core cash reports: 5/5 ready.
- All configured reports: 5/17 loaded.
- Rows loaded: 46,057.
- Official EQ breadth: 976 advancers, 1,451 decliners, 32 unchanged across 2,459 securities.
- Report attempts visible: 17.
- Missing official-file reasons remain visible.

## Validation

- API TypeScript: pass.
- Web TypeScript: pass.
- API tests: 74/74 pass, including two new NSE Intelligence integrity tests.
- Web tests: 18/18 pass.
- Production build: pass.
- Authenticated production Playwright: 21/21 pass at 1920x1080 and 390x844.
- Canonical route, compatibility redirect, header tab, real breadth, report counts, missing reasons, console and body overflow verified.
- Evidence: `output/playwright/nse-intelligence/`.

## Safety and rollback

No database migration, ingestion mutation, SmartAPI connection, Paper Trading action or broker order was introduced. Rollback requires reverting the API/UI files and rebuilding only `n50-dashboard`; the existing NSE ingestor remains independent.
