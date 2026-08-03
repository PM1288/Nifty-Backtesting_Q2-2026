# Architecture (Hot data flow)

This service intentionally separates:
- UI contract (Snapshot schema)
- transport (WebSocket + REST)
- data producer (mock now; replace with real intraday + EOD)

## Replace the producer
Swap the mock loop in `app/realtime.py` with:
- a consumer of your 1-minute stream
- a feature engine (breadth, residual strength, volatility pulse, anomalies)
- a publisher that sends `snapshot` payloads

The UI remains unchanged as long as the Snapshot schema is stable.
