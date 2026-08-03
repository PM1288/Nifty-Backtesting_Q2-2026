# Curl examples

```bash
curl http://localhost:8091/health
curl http://localhost:8091/api/v1/dashboard/summary
curl http://localhost:8091/api/v1/dashboard/sections/momentum-breakouts
curl http://localhost:8091/api/v1/watchlists
curl http://localhost:8091/api/v1/watchlists/breakouts
curl "http://localhost:8091/api/v1/exports/dashboard/summary?format=csv"
curl -X POST http://localhost:8091/api/v1/ops/run/refresh_summaries
```
