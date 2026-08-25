# Market Status Notification Incident — 12 August 2026

## Impact

- The 09:16 NIFTY open snapshot and 09:20 NIFTY 50 movers message were not sent.
- Four later OIIS candidate messages failed delivery and reached dead-letter state.
- The final market-close message was delayed, then delivered successfully after repair.
- Paper-trading notification and calculation paths were not involved or changed.

## Root causes

1. The three market-status containers were created/started at 09:56 IST, after the hard deadlines of 09:18 and 09:22. The scheduler created audit rows at 09:46:53 IST and correctly assigned `MISSED_NOTIFICATION_DEADLINE`; it did not emit a late backlog burst.
2. The active market-status n8n formatter depended on workflow static data containing `gatewayUrl` and `chatId`. That state was absent, causing `MARKET_STATUS_DELIVERY_CONFIG_MISSING` and HTTP 500 responses.

## Repair

- Bound the active market-status workflow to the proven WhatsApp gateway/destination while retaining the dedicated market-status inbound and outbound credentials.
- Removed the missing static-data dependency from the live formatter.
- Added an explicit, non-market delivery-verification presentation used only for controlled tests.
- Preserved market-specific idempotency and correlation headers.
- Kept the four historical OIIS dead letters for audit and did not replay stale candidate messages.
- Released the valid final-close retry; it delivered with HTTP 200.

## Evidence

- Active n8n workflow: `Market-Status-Outgoing-WhatsApp-v1` (`xPrJ9eh7RXtBopUh`).
- Workflow update: HTTP 200.
- Explicit WhatsApp test: n8n execution 653, success through `Send Market WhatsApp`, gateway status `sent`.
- Final close: outbox event `c1ccbcf3-0342-56c7-9b3c-a5f66ade3284`, `SENT`, HTTP 200; n8n execution 654 succeeded.
- Market-status tests: 28 passed; Ruff passed; n8n formatter tests passed.
- Scheduler/worker/delivery containers: healthy with `restart: unless-stopped`.
- NIFTY 50 effective universe: 50 members and 50 unique tokens.
- Queue after repair: zero pending, zero retry; four retained historical dead letters.
- Planning validation: 09:16:06 produces a pending OPEN job; 09:20:06 produces a pending MOVERS job.

## Rollback

The pre-repair n8n workflow is stored at:

`/home/novius2/backups/n8n/2026-08-12-market-status-delivery-repair/workflow-before.json`
