# API specification

Base URL (dev):
- `http://localhost:8080`

All endpoints are prefixed with `/v1`.

---

## 1) REST endpoints

### 1.1 Health

`GET /health`

Response:
```json
{ "ok": true }
```

---

### 1.2 Overview (landing page)

`GET /v1/overview`

Response:
```json
{
  "asOf": "2026-03-04T08:45:12.000Z",
  "nifty": {
    "symbol": "NIFTY50",
    "name": "Nifty 50",
    "last": 22450.15,
    "change": 112.55,
    "changePct": 0.50
  },
  "sectors": [
    {
      "sector": "IT",
      "stocks": [
        { "symbol": "STK001", "name": "Stock 1", "last": 123.45, "change": 2.1, "changePct": 1.73 }
      ]
    }
  ],
  "leaderboards": {
    "gainers": [ { "symbol": "STK010", "changePct": 5.12 } ],
    "losers":  [ { "symbol": "STK042", "changePct": -4.70 } ]
  },
  "tickerTape": [
    { "symbol": "NIFTY50", "last": 22450.15, "changePct": 0.50 },
    { "symbol": "STK001", "last": 123.45, "changePct": 1.73 }
  ]
}
```

---

### 1.3 Stock detail

`GET /v1/stocks/:symbol`

Query params:
- `range` (optional): `1D` (default)
- `limit` (optional): number of bars

Response:
```json
{
  "asOf": "2026-03-04T08:45:12.000Z",
  "stock": {
    "symbol": "STK001",
    "name": "Stock 1",
    "sector": "IT",
    "last": 123.45,
    "change": 2.1,
    "changePct": 1.73,
    "day": {
      "prevClose": 121.35,
      "open": 122.10,
      "high": 124.00,
      "low": 121.80,
      "volume": 12003400
    }
  },
  "intraday": [
    { "t": "2026-03-04T03:45:00.000Z", "o": 122.10, "h": 122.50, "l": 121.90, "c": 122.20, "v": 1200 }
  ]
}
```

---

## 2) WebSocket stream

URL (dev):
- `ws://localhost:8080/v1/stream?symbols=NIFTY50,STK001`

Messages:
- `type: "quote"`
```json
{
  "type": "quote",
  "data": {
    "symbol": "STK001",
    "last": 123.45,
    "change": 2.1,
    "changePct": 1.73,
    "ts": "2026-03-04T08:45:12.000Z"
  }
}
```

Notes:
- In this skeleton the stream polls the DB periodically.
- In production, you likely broadcast on writes or use a pub/sub.
