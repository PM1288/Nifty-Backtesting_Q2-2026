# 08 Rollout, Ops, and Security

## Deployment phases

### Phase 0: Local / dev
- use local fixtures
- use mock Discord endpoint or preview mode
- verify chart rendering and schema contracts

### Phase 1: Staging / test webhook
- configure test webhook via env var
- enable `wait=true`
- send only manual previews and a single scheduled digest
- store all dispatch responses

### Phase 2: Shadow production
- connect to real backend data
- compute events live
- send nothing
- compare shadow output with actual market sessions

### Phase 3: Canary
- enable:
  - ops alerts
  - high-severity market events
  - one close summary
- route to test thread or test channel

### Phase 4: Full stream
- enable stock, options, FII, and digest routes
- keep noise budget and suppression dashboards visible
- review first week manually

## Operational dashboards

At minimum, monitor:
- events generated per minute
- events sent per minute
- suppression reasons
- dispatch success / retry / failure
- rate-limit hits
- freshness by source
- missing bars
- chart rendering time
- root route generation time
- per-module trust score

## Secret handling

Required:
- webhook URLs stored in env or secret manager
- no secrets committed to source control
- no webhook URLs in logs
- separate test and production webhook secrets
- rotate test webhook before production use if it has been shared in chat or docs

## Rate-limit handling

Dispatcher must:
- parse response headers
- respect `Retry-After`
- queue retries
- stop hard failures on terminal errors such as invalid webhook
- maintain per-webhook backoff state

## Circuit breakers

Implement:
- if dispatch failure rate exceeds threshold -> pause non-critical sends
- if quote freshness fails -> suppress live market alerts
- if options stale -> suppress options commentary
- if breadth coverage falls -> suppress broad-market claims
- if chart renderer is degraded -> send text-only alerts
- if duplicate rate spikes -> temporarily raise novelty threshold

## Observability fields to log

For each event:
- event_id
- detector
- severity
- novelty
- send_decision
- suppression_reason
- dedupe_key
- trust_score
- chart_requested
- discord_status
- latency_ms from source refresh to send

## On-call / runbook actions

### If Discord dispatch fails
1. inspect webhook validity
2. inspect rate-limit responses
3. inspect payload size
4. switch to preview-only mode if repeated failures continue
5. emit ops alert to backup channel if available

### If data freshness degrades
1. mark affected modules stale
2. suppress dependent alerts
3. send one ops alert
4. avoid repeating the same stale-source alert unless severity changes

### If duplicate spam appears
1. inspect cooldown state store
2. inspect novelty deltas
3. inspect event key generation
4. raise thresholds until corrected

## Compliance / source handling

For NSE-based market data:
- keep live scraping light and cache aggressively where applicable
- prefer your persisted backend data over repeated external fetches
- treat daily FII/participant reports as latest official daily context, not intraday live signals

## Production readiness checklist

- [ ] all schemas versioned
- [ ] all routes documented
- [ ] replay tests passing
- [ ] shadow mode reviewed
- [ ] dispatch retries verified
- [ ] webhook secrets stored securely
- [ ] rate-limit handling verified
- [ ] alert-to-noise baseline approved
- [ ] data-quality alerts tested
- [ ] rollback switch present
