# Integration Contract

This project exposes a stable UI data contract (Snapshot schema) so you can swap the mock generator with real bhavcopy/EOD + 1-minute feeds.

## WebSocket contract

Endpoint: `WS /ws/live`

Server → client messages:

```json
{
  "type": "snapshot",
  "payload": { "...": "Snapshot schema from app/schemas.py" }
}
```

Notes:
- Push at least once per minute (or faster for smoother motion).
- Do not send misleading zeros for missing data; omit/gap or include a missing marker.

## REST contract (optional)

- `GET /api/snapshot` → `Snapshot`
- `GET /api/stock/{symbol}?minutes=240` → `StockDetail`

## Mapping requirements (production)
- Consistent symbols across intraday, EOD, and master.
- `ts` must be ISO8601 (UTC recommended).
- Index symbol: `"NIFTY50"` for consistency.
