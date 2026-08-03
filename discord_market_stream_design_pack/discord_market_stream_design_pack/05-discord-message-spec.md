# 05 Discord Message Specification

## Why this spec matters

Discord should receive messages that are:

- short enough to read in-channel
- rich enough to be actionable
- structured enough for operators
- machine-readable enough for downstream LLM analysis

## Discord constraints to design around

Design the service around these constraints:
- visible `content` should stay well under the 2000-character limit
- up to 10 rich embeds can be sent
- total embed text should remain comfortably below the 6000-character aggregate limit
- attachments and files can be sent when needed
- use `allowed_mentions.parse=[]` to avoid accidental pings
- use `wait=true` in staging or test-dispatch flows so the service receives the created message body
- do not hardcode rate limits; respect rate-limit headers and `Retry-After`

## Message classes

## 1. Event message
Use for:
- market shock
- breadth failure
- stock leader
- stock breakdown
- options wall shift
- data-quality incident

Recommended shape:
- content: compact headline + key numbers
- 1 embed: explanation and watch list
- optional chart image

### Suggested content layout

```text
╔════════ MARKET EVENT ════════╗
║ <title>                      ║
║ <severity> • <as_of>         ║
╚══════════════════════════════╝

<one-line statement with numbers>

Confirms: <1 line>
Risk: <1 line>
Next: <1 line>

```facts
EVENT|type=...
MARKET|...
STOCK|...
OPTION|...
QUALITY|...
```
```

## 2. Scheduled digest
Use for:
- open + 15m
- mid-session
- pre-close

Recommended shape:
- content: compact decorated summary
- 1–2 embeds: market and leaders
- optional mini chart if market state changed materially

Suggested sections:
- market snapshot
- top leaders
- top laggards
- options context
- volatility
- risk / next watch

## 3. Close summary
Use for:
- market close
- post-close FII / participant context
- next-session watch

Recommended shape:
- one compact summary message
- 1 embed for market / leaders / laggards
- 1 embed for FII / options / watch list
- optional close chart

## 4. Ops alert
Use for:
- stale source
- missing bars
- dispatch failures
- partial coverage

Recommended shape:
- plain and direct
- no chart unless it is a coverage heatmap or missing-bars graph

## Chart usage policy

Charts should be attached only if they add context.

### Recommended chart types by event
- market shock -> index vs breadth timeline
- narrow leadership -> index vs breadth vs concentration
- stock leader -> intraday price vs VWAP + volume surprise
- options wall shift -> strike ladder snapshot
- close summary -> multi-panel summary is okay if pre-rendered as one image
- data quality -> freshness / coverage heatmap

### Chart rules
- chart must have a title
- chart must have labeled axes or clear captions
- chart should be readable on mobile
- chart should not be required to understand the event
- chart filename should include event_id and timestamp for auditability

## Routing policy

Support at least:
- one test webhook
- one production webhook
- optional thread routing by event family

Example routing logic:
- market regime -> main stream thread
- stock leaders -> stocks thread
- options / max pain / PCR -> derivatives thread
- FII / post-close -> close-summary thread
- ops -> ops thread

## Color / emphasis policy

Use consistent semantic colors:
- positive / confirmation
- caution
- high risk
- ops degraded

Do not use colors to imply certainty when the trust score is low.

## Machine facts block

Every message should end with a small facts block that another service or LLM can parse.

Example:
```text
META|as_of=2026-04-05T10:12:00+05:30|severity=high|trust=0.93
EVENT|type=market_vol_shock|entity=NIFTY
MARKET|ret_pct=-1.42|breadth_up_pct=22|weighted_participation_pct=31|top10_concentration_pct=69
OPTION|weekly_pcr=0.81|max_pain=22400|call_wall=22500|put_wall=22300
QUALITY|quotes=fresh|options=fresh|fii=latest_official_daily
```

## Payload safety

Always set:
```json
{
  "allowed_mentions": {
    "parse": []
  }
}
```

Never allow free-form user-generated strings to pass through without sanitization.

## Delivery behavior

### In staging / test dispatch
- use `wait=true`
- capture the returned Discord message object
- store the response for audit

### In production
- you may choose async send for throughput
- still record response headers and delivery status
- obey `Retry-After` and rate-limit headers
- do not retry 404 webhook errors indefinitely

## Message budget guidance

Target budgets:
- compact event: 450–900 chars visible content
- digest: 800–1600 chars visible content
- close summary: 1000–1800 chars visible content
- machine facts block: <= 700 chars when possible
- embeds: 1 or 2 in most cases

If content grows too large:
1. trim adjectives
2. keep only highest-value metrics
3. move less important data into machine facts
4. collapse repeated sections
