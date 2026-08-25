# Executive overview

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The application is a polyglot, containerised trading-research platform. The user-facing React/Vite workstation and Express gateway sit in `neon-stock-terminal`; Go commands and collectors provide SmartAPI/market ingestion and legacy calculations; Python services implement paper trading, OIIS, rolling-monthly, derivatives, institutional-flow, and NSE report workflows; PostgreSQL is the durable analytical and trading store; Redis and WebSocket/polling paths support refresh and realtime delivery.

The running deployment is separate at `/home/novius2/trading-stack`; this versioned repository is its source mirror. Runtime state must therefore be checked against image/container identity before treating source inspection as deployment proof.

## Audit boundaries

- Production business logic, CSS, schemas, and data were not modified.
- Static evidence is reproducible with `node scripts/audit/generate_trading_app_audit.mjs`.
- Runtime evidence is captured by the documentation Playwright harness.
- Secrets are never copied into this documentation.
- A rendered page is not evidence that its calculation is correct.
