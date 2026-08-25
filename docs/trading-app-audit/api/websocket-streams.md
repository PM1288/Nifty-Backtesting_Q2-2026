# WebSocket and stream evidence

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

The canonical browser WebSocket hook is in `neon-stock-terminal/apps/web/src/lib/hooks.ts`; the gateway server is `apps/api/src/ws/stream.ts`. Authentication, origin validation, subscription parsing, snapshot delivery, heartbeats, and reconnect logic must be read together. Additional Discord and market-provider streams are separate operational channels.
