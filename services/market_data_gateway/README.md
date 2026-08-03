# Market Data Gateway

A small self-hosted HTTP gateway for **fast delayed / EOD market data** across the exact items you asked for:

- Dow Jones
- Brent crude oil
- India gold
- India silver
- Europe natural gas
- USD/INR
- Major global indices

## What this service uses

### Primary / recommended
- **FRED** for daily Brent and daily USD/INR if you set `FRED_API_KEY`
- **IBJA public daily bullion PDF** for India benchmark gold/silver PM rates
- **yfinance / Yahoo Finance** for Dow, Europe gas proxy, and broad global indices
- **Frankfurter** as a no-key FX fallback for USD/INR

### Important reality check
There is **no single free, open-source, reliable API** that cleanly gives all of this with strong licensing and full global coverage.
This gateway solves that by normalizing several free / open components behind one API.

## Why this stack
- Fast enough for agent workflows
- Mostly no-key by default
- Better reliability than depending on one fragile free source
- Keeps units normalized
- Makes fallback behavior explicit in the response

## File list
- `app.py` — FastAPI service
- `requirements.txt` — Python dependencies
- `.env.example` — environment variables
- `Dockerfile` — container image
- `MarketDataClient.java` — Java client example
- `agentic_setup_prompt.md` — prompt for an autonomous setup agent

## Setup

### 1) Create venv and install
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) Configure env
```bash
cp .env.example .env
```

`FRED_API_KEY` is optional but recommended.
Without it, Brent falls back to Yahoo futures and USD/INR falls back to Frankfurter.

### 3) Run the API
```bash
export $(grep -v '^#' .env | xargs)
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Docker
```bash
docker build -t market-data-gateway .
docker run --rm -p 8000:8000 --env-file .env market-data-gateway
```

## Endpoints

### Health
```bash
curl "http://localhost:8000/health"
```

### Catalog
```bash
curl "http://localhost:8000/catalog"
```

### Default requested quotes
```bash
curl "http://localhost:8000/quotes"
```

### Specific quotes
```bash
curl "http://localhost:8000/quotes?codes=dow_jones,brent_crude,india_gold,india_silver,europe_natural_gas,usd_inr"
```

### One quote
```bash
curl "http://localhost:8000/quote/dow_jones"
```

### Global indices watchlist
```bash
curl "http://localhost:8000/global-indices"
```

### Any Yahoo symbol through the gateway
```bash
curl "http://localhost:8000/yahoo/quote?symbol=%5EDJI&currency=USD&unit=index_points"
```

## Example response
```json
{
  "code": "usd_inr",
  "label": "USD/INR",
  "value": 91.73,
  "currency": "INR",
  "unit": "INR_per_USD",
  "as_of": "2026-03-06T00:00:00+00:00",
  "source": "fred",
  "delayed": true,
  "provider_symbol": null,
  "quality": "daily_official",
  "notes": [
    "Daily official-style reference rate from FRED H.10 series."
  ],
  "meta": {
    "series_id": "DEXINUS"
  }
}
```

## Source behavior by instrument

### 1) Dow Jones
- Source: Yahoo Finance via `yfinance`
- Symbol: `^DJI`
- Output unit: `index_points`

### 2) Brent crude oil
- Preferred source: FRED `DCOILBRENTEU`
- Fallback: Yahoo `BZ=F`
- Output unit: `USD_per_barrel`

### 3) India gold
- Preferred source: IBJA public daily bulletin PDF
- Fallback: Yahoo `GC=F` converted to INR/10g using USD/INR
- Output unit: `INR_per_10g`

### 4) India silver
- Preferred source: IBJA public daily bulletin PDF
- Fallback: Yahoo `SI=F` converted to INR/kg using USD/INR
- Output unit: `INR_per_kg`

### 5) Europe natural gas
- Source: Yahoo `TTF=F`
- Output unit: `EUR_per_MWh`
- Note: proxy via TTF futures, not a direct pan-European physical spot feed

### 6) USD/INR
- Preferred source: FRED `DEXINUS`
- Fallback: Frankfurter latest USD base rate
- Output unit: `INR_per_USD`

### 7) Global indices
This service exposes a **curated major-index watchlist**, not every index on Earth.
You can extend `GLOBAL_INDICES` in `app.py` or call `/yahoo/quote` for arbitrary symbols.

## Production notes
- Cache is in-memory only. For multi-instance deployment, replace with Redis.
- If you need commercial redistribution or exchange-cleared real-time rights, buy a licensed feed.
- IBJA API itself is paid; this service uses the public bulletin PDF instead.
- MCX exchange data is a commercial feed, not a free public API.
- Yahoo data is convenient but should be treated carefully from a licensing perspective.

## Java example
Compile and run:
```bash
javac MarketDataClient.java
java MarketDataClient
```

## Recommended next hardening steps
1. Put Nginx in front for TLS and rate limiting.
2. Replace in-memory cache with Redis.
3. Persist the last good response per instrument.
4. Add structured logging.
5. Add a scheduled warm-up job for the most-used quotes.
