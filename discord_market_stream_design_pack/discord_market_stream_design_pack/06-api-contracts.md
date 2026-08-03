# 06 API Contracts

## Design goals

The API surface should support:
- Discord preview and dispatch
- LLM-readable narrative routes
- operator inspection
- event replay and audit
- health and quality monitoring

## Common response envelope

Every route should return:

```json
{
  "ok": true,
  "as_of": "2026-04-05T10:15:00+05:30",
  "mode": "live",
  "freshness_status": "fresh",
  "data": {},
  "quality": {},
  "machine_facts": "",
  "llm_brief": ""
}
```

## 1. GET /

Returns the **market dossier**.

Required sections:
- decorated_header
- market_headline
- key_conclusions
- index_snapshot
- options_snapshot
- fii_snapshot
- sector_snapshot
- full_stock_snapshot
- best_entries
- risk_flags
- next_alerts
- how_to_read_today
- data_quality
- llm_brief
- machine_facts

### Query params
- `mode=live|latest_completed|date`
- `date=YYYY-MM-DD`
- `format=screen|json|both`
- `educational=true|false`

## 2. GET /api/stream/now

Returns the current streaming state for operators and other services.

Fields:
- current_market_state
- top_events_active
- top_leaders
- top_laggards
- options_state
- volatility_state
- trust_state
- pending_candidate_events

## 3. GET /api/events/recent

Returns recent sent and suppressed events.

Query params:
- `since`
- `severity`
- `event_type`
- `entity_id`
- `sent_only=true|false`

Fields per event:
- event_id
- event_type
- severity
- entity
- send_decision
- suppression_reason
- rendered_title
- rendered_summary
- discord_delivery_status

## 4. GET /api/events/{id}

Returns one event in full detail:
- raw metrics
- detector outputs
- confirmation logic
- novelty calculation
- rendered message
- chart metadata
- delivery audit

## 5. GET /api/quality

Returns trust/freshness detail:
- source freshness
- coverage
- missing bars
- stale modules
- parser health
- dispatch health

## 6. POST /api/dispatch/preview

Purpose:
- dry-run rendering without sending to Discord

Input:
- event_id or synthetic payload

Output:
- rendered markdown
- embed payload
- chart plan
- machine facts
- estimated size budget
- warnings

## 7. POST /api/dispatch/test

Purpose:
- send one preview event to the configured test webhook

Input:
- event_id or synthetic payload
- `send_chart=true|false`

Output:
- Discord response metadata
- delivery success / failure
- size metrics
- rate-limit headers if present

## 8. GET /health

Basic service health:
- database connectivity
- cache connectivity
- dispatcher readiness
- chart renderer readiness

## 9. GET /api/entities/{symbol}

Entity-centric view for a stock or index.

Fields:
- live snapshot
- daily context
- recent events
- current signal states
- risks
- next thresholds
- how_to_read

## Common event object

```json
{
  "event_id": "evt_20260405_101500_nifty_breadth_failure",
  "event_type": "breadth_failure",
  "event_family": "market_regime",
  "severity": "high",
  "entity_type": "index",
  "entity_id": "NIFTY",
  "as_of": "2026-04-05T10:15:00+05:30",
  "headline": "Breadth is failing while the index holds up",
  "metrics": {
    "index_ret_pct": 0.22,
    "breadth_up_pct": 38.0,
    "weighted_participation_pct": 35.0,
    "top10_concentration_pct": 71.0
  },
  "confirmations": [
    "breadth below vwap remains weak",
    "top 10 concentration elevated"
  ],
  "contradictions": [
    "index still above VWAP"
  ],
  "risk_flags": [
    "narrow leadership"
  ],
  "trust": {
    "overall": 0.92,
    "quotes": "fresh",
    "breadth": "fresh",
    "options": "fresh",
    "fii": "latest_official_daily"
  },
  "send_decision": "send"
}
```

## Full stock snapshot contract

Every stock row should include at least:
- symbol
- sector
- last
- chg_pct
- weight_pct
- contrib_pct
- daily_rsi14
- intraday_rsi14
- vwap_dev_pct
- volume_ratio
- signal_state
- entry_style
- risk_flag

## Machine facts format

Use line-oriented records for easy LLM parsing:

```text
META|as_of=...|mode=live|bias=mixed|confidence=74|freshness=fresh
INDEX|name=NIFTY50|last=...|chg_pct=...|breadth_up_pct=...|weighted_participation_pct=...
OPTION|name=NIFTY|weekly_pcr=...|weekly_max_pain=...|call_wall=...|put_wall=...
FII|report_date=...|fii_index_long_pct=...|client_index_long_pct=...|bias=contrarian
STOCK|symbol=RELIANCE|last=...|chg_pct=...|daily_rsi14=...|signal=continuation
QUALITY|module=options|freshness=fresh|trust=high
```
