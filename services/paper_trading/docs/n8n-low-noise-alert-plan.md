# Paper-Trading n8n Low-Noise Alert Plan and Deployment Record

**Reviewed and deployed:** 11 August 2026
**Environment:** PAPER only
**Production workflow ID:** `LRFbVccpU3w0B03S`
**Production path:** `/webhook/codex-paper-trade`

## 1. Outcome

The production workflow is now `Paper-Trade-Outgoing-Low-Noise-v3`. It retains the existing Basic-authenticated webhook and WhatsApp gateway, but replaces arbitrary recursive JSON rendering with an allow-listed event policy and event-specific messages.

The policy intentionally keeps every business and operational event in PostgreSQL while sending WhatsApp only when a person can act on, or needs to know about, a meaningful state transition.

## 2. Material evidence from the audit

The audit covered the active n8n workflow, its last 40 executions, all paper-trading events from the previous 24 hours, the PostgreSQL outbox, the paper monitor, event factory and webhook worker, and every file in `/home/novius2/NIFTY50/n8n` including the ZIP package.

| Finding | Evidence | Impact |
|---|---:|---|
| Recursive formatter | Active Code node walked every nested key/value | Messages repeated labels, notification text, summary data and implementation fields |
| Data-feed flapping | 34 stale and 34 recovered events in 24 hours | 68 noisy messages for two monitored instruments |
| Gateway overload | 5 errors in the previous 40 n8n executions | Some messages failed after n8n had already acknowledged the backend |
| Early acknowledgement | Webhook used the default/on-received behaviour | Backend could record delivery before the WhatsApp gateway succeeded |
| Duplicate close path | Execution target, leg close and group close were all independently formatted | One economic close could produce several messages |
| Unsafe secret placement | Outbound token was in HTTP-node parameters | Workflow exports could expose the gateway credential |
| Durable backend | PostgreSQL event ledger, outbox, attempts, retry and dead-letter tables already exist | Notification failures do not roll back or lose a paper trade |

Replay of the 83 actual events from 11 August under the new policy produced:

```text
83 stored events
 9 decision-relevant notifications
74 suppressed chat notifications
68 of the suppressed events were transient stale/recovered flips
```

Suppression affects only WhatsApp. Events and data-quality incidents remain queryable in PostgreSQL and the UI.

## 3. Notification policy

### Immediate messages

| Event family | Policy | WhatsApp content |
|---|---|---|
| Equity/OIIS selection | Send only selected/actionable ideas | Symbol, direction, entry, stop, R:R, O, X, DQ, total score and setup |
| F&O suggestion | Send only actionable `BUY_STRADDLE`, `BUY_STRANGLE` or equivalent decisions | Underlying, structure, expiry/DTE, legs, premium, implied move, forecast move, expected return, PoP and spread |
| Trade intent accepted/rejected | Send once per submitted intent | Acceptance is explicitly distinguished from a fill; rejection includes the concise reason |
| Actual paper fill | Send once | Symbol/side/strategy, simulated fill, quantity and monitoring statement |
| Analytical target | Send once per target level | Target and MFE/MAE, explicitly labelled analytical—not an execution close |
| Partial close | Send once per partial transition | Close fill, quantity closed, remaining quantity and available realised result |
| Full group close | Send once | Entry/exit, quantity, gross, costs, tax provision and actual net P&L |
| 5/30-session completion | Send once per horizon | Closing return, MFE and MAE |
| Daily/weekly summary | Send once after reconciliation | Activity, actual P&L, win/loss counts and unresolved data incident count |
| Critical processing failure | Send only at `CRITICAL` | Component, stable error code and short safe message |

### Stored but silent by default

| Event family | Reason |
|---|---|
| Per-instrument transient stale/recovered flips | Operational flaps remain visible in PostgreSQL/UI; they do not justify chat interruption |
| Market-data stale below 10 instruments and below 10 minutes | Not a sustained/material outage |
| Ordinary processing warnings | Operations telemetry, not a trading decision |
| Worker heartbeat, poll, mark, MFE and MAE updates | High-frequency state, no decision transition |
| F&O `NO_TRADE`, `WATCH`, `BLOCKED` per candidate | Avoid one rejection message for every contract; use a digest/UI table |
| `pending_entry` | Intent acceptance already covers this phase |
| `execution_target.hit` | Actual partial/full close that follows is the authoritative economic event |
| Full single-leg close | Full group close is the one user-facing close; the leg event stays in the ledger |
| Single-leg `trade_group.opened` | The leg fill is the one user-facing fill |
| Unknown event types | Fail silent for chat instead of printing arbitrary payloads |

### Material warning thresholds

- Adverse WhatsApp thresholds: `-1%`, `-2%`, and `-5%` only.
- Other adverse ladder values remain persisted for analysis.
- Market-data incident notification: `CRITICAL`, at least 10 affected instruments, or at least 10 minutes sustained.
- Duplicate cache: 48 hours, keyed by semantic `dedupe_key` or immutable event ID.

## 4. Production workflow

```text
Authenticated Webhook
  -> Low-Noise Policy and Format
  -> Send Actionable?
       true  -> credential-backed WhatsApp HTTP request
       false -> explicit suppressed/no-outbound node
```

The webhook now responds after the selected branch finishes. This provides two guarantees:

1. rapid duplicate submissions do not race before static dedupe state is persisted;
2. an actionable gateway failure is returned to the backend webhook worker, allowing the PostgreSQL outbox retry policy to work.

Suppressed events still return HTTP 200 through the no-operation branch, so the backend does not retry intentionally silent events.

## 5. Stock and F&O payload expectations

### Equity/OIIS suggestion

Recommended event types include:

```text
com.papertrading.equity.suggestion.selected.v1
com.papertrading.oiis.signal.selected.v1
paper_trade.equity.suggestion.v2
```

Recommended data:

```json
{
  "symbol": "TITAN",
  "direction": "LONG",
  "strategy_id": "OIIS_LIVE",
  "decision": "SELECTED",
  "entry_limit": "3924.50",
  "stop_price": "3880.00",
  "reward_risk": "2.40",
  "ofactor": "74.30",
  "xfactor": "71.20",
  "data_quality": "96.00",
  "score": "241.50",
  "setup": "PULLBACK_CONTINUATION"
}
```

### F&O option suggestion

Recommended event types include:

```text
com.papertrading.fno.option.suggestion.v1
paper_trade.fno.suggestion.v2
```

Recommended data includes underlying, decision, structure, expiry, DTE, each CE/PE leg, lot size, executable ask/premium, implied move, forecast P75 move, expected net return, probability of profit and spread percentage. A `NO_TRADE` row is stored and shown in the UI but is not sent individually to WhatsApp.

### Close semantics

- `target_track.closed` means hypothetical/analytical target achievement.
- `trade_group.partially_closed` means an actual partial execution close.
- `trade_group.closed` means the actual economic position is fully closed.
- Analytical 5-session and 30-session monitoring continues after execution closure.
- Actual P&L is always shown as gross less costs less tax provision equals net.

## 6. Security changes

- Inbound Basic Auth remains attached to the webhook.
- The outbound `X-API-Token` was removed from HTTP-node parameters.
- n8n credential `Paper WhatsApp Gateway - X-API-Token` now owns the value.
- Workflow exports contain a credential reference, not the credential value.
- The supplied n8n public API key was not written into repository files or logs.

The outbound token was previously present in an export. Moving it into n8n prevents further export leakage but does not undo previous exposure. Rotate it at the WhatsApp gateway and update the n8n credential as a separate operator action. Rotate the n8n public API key supplied in chat after this maintenance session as well.

## 7. Tests executed

### Local deterministic tests

```bash
cd /home/novius2/trading-stack
node services/paper_trading/n8n/test_notification_policy_v3.js
```

Result: **15/15 passed**.

Coverage includes transient and sustained data incidents, critical errors, equity selection, actionable and rejected F&O decisions, acceptance versus fill, single/multi-leg open dedupe, analytical targets, partial/full closes, daily/weekly summaries, an explicit non-trade delivery test, duplicate suppression and the PAPER-only boundary.

### Historical event replay

Result: **83 events evaluated; 9 send, 74 suppress**. No database row was changed by the replay.

### Production n8n smoke tests

| Execution | Scenario | Result |
|---:|---|---|
| 123 | Transient stale event | Success; suppressed branch; no gateway request |
| 124 | Equity/OIIS suggestion | Success; concise actionable message |
| 125 | F&O ATM straddle suggestion | Success; legs and economics shown |
| 126 | Analytical target hit | Success; explicitly not an execution close |
| 127 | Actual full close | Success; gross/cost/tax/net shown |
| 132 | First copy of dedupe test | Success; one outbound request |
| 133 | Immediate duplicate | Success; `DUPLICATE`; no outbound request |
| 134 | Final transient stale test | Success; `TRANSIENT_DATA_FLAP`; no outbound request |
| 135 | Credential-backed daily summary | Success; no inline gateway token |

The initial post-deployment inspection through execution `135` was successful. The later exact production-content-type check deliberately exposed execution `143`, which is documented and repaired below. PostgreSQL outbox status at final verification was `delivered=88`, `pending=0`, `retry=0`, `dead=0`.

### Production-shape delivery repair — 11 August 2026, 19:20 UTC

The red execution history had two distinct causes:

- executions `114` and `115` were genuine WhatsApp-gateway HTTP `429` responses during a short request burst; they remain as immutable historical failures;
- controlled execution `143` exposed a separate production-payload defect: n8n represents `application/cloudevents+json` as binary data, but the embedded Code node started in strict mode, so its binary helper context was unavailable and the formatter returned HTTP `500`.

The workflow builder and live patcher now remove only the embedded top-level strict-mode directive. This preserves n8n's helper context while leaving the standalone policy module and its tests in strict mode. The formatter can therefore decode the exact CloudEvents content type used by `papertrade.webhook`.

An explicit `com.papertrading.delivery.test.v1` event was added for end-to-end checks. Its WhatsApp copy states that it is a delivery test and that no paper trade was created or changed.

Final live proof:

| Execution | Input | Result |
|---:|---|---|
| 143 | Exact production-shaped CloudEvent, before repair | Expected controlled failure; formatter binary-helper context missing |
| 144 | Exact production-shaped CloudEvent, after repair | HTTP `200`; n8n success; WhatsApp gateway status `sent`; gateway result `4871` |

The live workflow remained active and retained its webhook and credential bindings. The regenerated source-controlled workflow contains the same repaired formatter. PostgreSQL verification showed `88` delivered rows and no pending, retry or dead-letter backlog. No trade, fill, position or paper-trading calculation was created or modified by the delivery test.

## 8. Build, deploy and rollback

Build a secret-free import workflow:

```bash
cd /home/novius2/trading-stack
N8N_WEBHOOK_PATH=codex-paper-trade \
  node services/paper_trading/n8n/build_workflow_v3.js \
  /home/novius2/NIFTY50/n8n/Paper_Trade_WhatsApp_n8n_Workflow_v2.json \
  services/paper_trading/n8n/workflows/paper-trading-low-noise-v3.json
```

Generated/importable workflow:

```text
/home/novius2/trading-stack/services/paper_trading/n8n/workflows/paper-trading-low-noise-v3.json
```

Operational backup taken before the update:

```text
/home/novius2/backups/n8n/2026-08-11-paper-low-noise-v3/workflow-before.json
```

The backup is mode `0600` because the historical workflow contained an inline credential. Do not commit or share it. Rollback is an n8n API/UI re-import of that backup followed by a controlled smoke test; the PostgreSQL schema and data are unaffected by workflow rollback.

## 9. Follow-up backend improvement

The deployed paper backend already has a durable CloudEvents ledger, transactional outbox, attempts, bounded retry and dead-letter storage, but it currently publishes legacy v1 event shapes. The v3 formatter supports those shapes and the documented v2 contract. A future backend migration should emit canonical `paper-trading-webhook.v2` payloads directly, while retaining the v1 parser only for a defined compatibility period.
