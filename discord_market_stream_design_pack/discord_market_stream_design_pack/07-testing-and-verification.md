# 07 Testing and Verification

## Goal

Prove that the service:
- detects meaningful events
- suppresses noise
- formats Discord messages correctly
- behaves safely under stale / partial data
- can be trusted in production

## Test pyramid

## 1. Unit tests

Write deterministic unit tests for:

### Detector logic
- market regime shift
- breadth failure
- volatility shock
- stock leader
- false leader
- options wall shift
- max pain pin risk
- FII regime shift
- stale source
- missing bars

Test cases should include:
- positive case
- negative case
- threshold edge case
- contradictory-input case
- stale-data suppression case

### Novelty and cooldown
- same event within cooldown is suppressed
- larger severity bypasses cooldown
- follow-up allowed when metrics move materially
- dedupe key collision works as intended

### Trust gate
- stale quotes suppress live alerts
- stale options suppress options claims
- post-close-only FII is labeled correctly
- partial breadth causes downgrade

### Rendering
- no missing numbers in narrative
- no invented fields
- sections always present
- machine facts block parses
- Discord markdown remains valid

### Chart planning
- high-value event requests a chart
- low-value event does not
- repeated chart for unchanged event is suppressed

## 2. Contract tests

Validate schema compatibility for:
- root snapshot
- market event
- Discord payload preview
- audit event
- machine facts block parser

Reject:
- missing required fields
- wrong enum values
- invalid timestamps
- unbounded free-form objects

## 3. Replay tests

This is the most important test class.

Use stored minute-by-minute historical sessions and replay them through the system.

### Replay goals
- estimate alert precision
- estimate duplicate rate
- evaluate alert timeliness
- evaluate noise budget
- compare event quality across regimes

### Replay scenarios
- strong trend day
- narrow leadership day
- failed gap day
- volatile reversal day
- expiry day
- quiet range day
- data degradation day

### Replay outputs
For each session, record:
- total candidate events
- total sent events
- suppressed events by reason
- duplicates prevented
- average time from signal to send
- operator quality label if available

## 4. Synthetic stress tests

Generate synthetic inputs for:
- sudden 2–3 sigma volatility jump
- breadth collapsing in 3 minutes
- options walls shifting rapidly
- symbol entering and exiting leadership repeatedly
- stale data arriving mixed with fresh data
- dispatch 429 responses

Validate:
- the service does not panic-send
- the service respects suppression and rate-limit handling
- the service surfaces quality alerts

## 5. Discord integration tests

Use a staging/test webhook.

Checklist:
- preview payload renders cleanly
- event message sends successfully
- digest message sends successfully
- chart attachment appears
- content length remains within limits
- embeds remain within limits
- machine facts block is preserved
- `allowed_mentions.parse=[]` is honored
- `wait=true` returns message body in staging

## 6. Shadow mode

Before live rollout, run the full engine in shadow mode.

Shadow mode behavior:
- compute all candidate events
- render all messages
- do not send to Discord
- store what would have been sent

Duration recommendation:
- at least 5 market sessions
- include both quiet and volatile sessions

Shadow mode review questions:
- were the important moments detected?
- were too many low-value alerts proposed?
- did any event become obvious too late?
- were any charts unnecessary?
- were data-quality issues surfaced correctly?

## 7. Canary rollout

Phase 1:
- send only ops alerts and 1 digest to test webhook

Phase 2:
- send high-severity market events and close summary

Phase 3:
- enable stock, options, and FII events

Phase 4:
- enable full production routing

## 8. Manual operator QA checklist

For each message, review:
- Is the title clear?
- Are the numbers correct?
- Is the conclusion supported by the numbers?
- Is there at least one confirmation?
- Is there at least one contradiction or risk?
- Is the message educational?
- Was this alert useful?
- Was it too early, too late, or about right?
- Should it have included a chart?
- Did it feel redundant?

## 9. Acceptance metrics

Track at least:
- alert precision (operator-labeled useful / total sent)
- alert duplication rate
- average alerts per hour
- average high-severity alerts per day
- stale-data suppression rate
- dispatch success rate
- 429 rate
- chart attach success rate
- time-to-alert from source refresh
- percent of events with explicit confirmations
- percent of events with machine facts block

## 10. Failure criteria

Rollback or pause if:
- duplicate alerts spike
- stale data still produces “fresh” messages
- dispatch failure rate rises materially
- alerts exceed noise budget for multiple sessions
- root route is inconsistent with Discord stream
- messages exceed size constraints
- chart failures degrade operator usability
