# Institutional and NSE intelligence lineage

Institutional Flow/Reports and NSE Intelligence pages → typed clients →
gateway proxy/aggregation routes → CDSL FII ingest, NSE reports service,
bhavcopy/intelligence ingestors and orchestration state → PostgreSQL/report
artifacts → readiness, freshness, movers, breadth, event and source-report
surfaces.

Transport success, report availability and analytical readiness are separate.
The route-specific page files list the successful endpoints observed during the
authenticated audit.
