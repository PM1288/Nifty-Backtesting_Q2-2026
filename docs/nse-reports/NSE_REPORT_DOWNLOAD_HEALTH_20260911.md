# NSE India report download health — 11 September 2026

## Outcome

The existing authenticated NSE Intelligence `Reports & Health` route now acts as
the dedicated NSE India report-download health page:

`/institutional/nse-intelligence/reports`

Compatibility shortcuts `/nse-report-health` and
`/institutional/nse-report-health` redirect to that canonical route. The More
menu and command search provide direct access. No second downloader, database,
collector or report dashboard was created.

## Evidence shown

- Daily scheduler state and scheduled/start/finish/notification timestamps.
- Download-health state with expected, downloaded, loaded/reused, missing,
  failed and byte totals.
- Every latest-run report with core/ancillary scope, download state, source
  date, exact file name, byte size, row count, duration, load time, SHA-256
  evidence and recorded failure reason.
- Attempted official source URLs when the ingestor recorded them.
- Last 30 retained scheduled runs with coverage, missing/error counts, rows,
  duration and finish time.
- All/Core/Ancillary/Issues filters.
- Full latest-run CSV evidence and complete health JSON, including recent-run
  history and source metadata.

`LOADED`, `REUSED` and `SKIPPED` are accepted as available load evidence. A
`SKIPPED` report is labelled `ALREADY LOADED`; it is not presented as a new
download. `UNAVAILABLE`, `FAILED`, true zero and missing values remain distinct.
An HTTP response or successful scheduler notification is not presented as proof
of file freshness or complete coverage.

## Current retained-data observation

The isolated candidate read the existing database and showed the source session
10 September 2026 with 5/17 available reports, 12 recorded source-unavailable
reports, zero parse failures and 2.61 MB downloaded. These are runtime
observations, not hardcoded UI defaults. The recent history shows persistent
partial archive coverage, which remains visible.

## Files

- `neon-stock-terminal/apps/api/src/routes/nseIntelligence.ts`
- `neon-stock-terminal/apps/api/src/routes/nseIntelligence.test.ts`
- `neon-stock-terminal/apps/web/src/pages/NseIntelligencePage.tsx`
- `neon-stock-terminal/apps/web/src/pages/NseIntelligencePage.module.css`
- `neon-stock-terminal/apps/web/src/lib/api.ts`
- `neon-stock-terminal/apps/web/src/lib/nseReportHealth.ts`
- `neon-stock-terminal/apps/web/tests/nseReportHealth.test.ts`
- `neon-stock-terminal/apps/web/src/App.tsx`
- `neon-stock-terminal/apps/web/src/components/chrome/workspaceRoutes.ts`
- `neon-stock-terminal/apps/web/src/interaction/routeCatalog.ts`
- `tools/playwright/nse-intelligence-regression.mjs`

## Verification

- Web typecheck: PASS.
- Web tests: PASS, including missing/reused filtering and exact CSV evidence.
- Web production build: PASS.
- API typecheck: PASS.
- API tests: PASS, 200/200.
- API build: PASS.
- Isolated production-image build: PASS.
- Authenticated isolated browser regression: PASS, 29/29 at 1920x1080 and
  390x844.
- Desktop and mobile screenshots were visually inspected from
  `/tmp/nse-report-health-browser/`; no application screenshot is committed.
- Production deployment: NOT PERFORMED. The running production container was
  not restarted or changed.

The candidate container and temporary local gateway were removed after the
checks. Runtime data, credentials and screenshots remain outside Git.
