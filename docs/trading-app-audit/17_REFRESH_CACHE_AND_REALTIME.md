# Refresh, cache and realtime

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The web layer combines React Query polling, page-owned intervals, prefetch, and WebSocket streaming. The Express gateway applies `Cache-Control: no-store` to authenticated `/v1` responses, while server-side snapshot registry materialisation has its own freshness windows. Redis supports shared state/streaming infrastructure.

Poll cadence is not source cadence. Every page should expose the source `asOf`/trade timestamp and stale state independently of transport health. Browser backgrounding, WebSocket reconnect, missed sequence recovery, and duplicate snapshot suppression require feature-specific verification.
