# Data lineage

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Canonical UI path

`Route → React page → child component → hook/API client → authenticated gateway → route handler → service/query → PostgreSQL/provider → transformation/view model → chart/table/KPI`

## Evidence rules

- A frontend endpoint reference is matched to the backend declaration in `api-map.json`.
- SQL object names are matched to migrations in `storage-map.json`.
- External-source references are evidence of adapters, not proof of current freshness.
- Calculations performed directly in route handlers are catalogued as gateway-owned; Python/Go service calculations remain service-owned.
- Values crossing paper actual/observed/hypothetical/simulated lanes must never be combined without an explicit bridge.

See the page dossiers and [data-lineage.mmd](diagrams/data-lineage.mmd).
