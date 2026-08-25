# Home and heatmap lineage

## Home

`/` → `LandingPage.tsx` → overview/summary hooks and visual children →
`GET /v1/overview`, `GET /api/v1/dashboard/summary`, section payloads →
`overview.ts` plus BFF routes → PostgreSQL market snapshots/instruments and
collector outputs → sector canvas, ticker, indices, breadth, leaders and
derivatives status.

## Heatmaps

`/heatmap/change|rsi|will` → page component → `ChangeHeatmap`, `RsiHeatmap`, or
`WillHeatmap` → typed API client → dedicated Express route → time-series SQL
and semantic scale helpers → ECharts/custom cells.

Do not infer “live” from a successful response: use `asOf`, session, source
timestamp, and missing-value state. Sample latest-series reconciliation is in
`../evidence/calculation-validation.json`.
