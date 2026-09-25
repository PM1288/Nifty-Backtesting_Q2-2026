# Home MWHD five-minute qualification alerts

## Behavior

The existing server-refreshed Home progression snapshot is the alert source.
During the active NSE session, every fresh snapshot is evaluated for all rows
in the current stock F&O universe (not just the top-ten view). A candidate
queues only when all mandatory comparisons are strictly true:

- M−1 sufficiency: current-month open versus previous-month close.
- W0, W−1 and D0: current value versus current-week open, previous-week open
  and today's open.
- 1H, 15m and 5m: current-period open versus the immediately previous period
  open.

The M−2 route also requires the M−1 gate and adds current-month open versus
two-months-ago close. If both routes pass, the notification is labelled M−2;
otherwise a complete M−1 route is labelled M−1. Bull and exact-inverse Bear
are tested independently. Missing gates are not treated as green.

## Notification and dedupe

The durable outbox key is deterministic for trade date, symbol, direction and
five-minute candle start. A new qualifying candle can produce one event;
repeat cache refreshes cannot repeat that event. Payloads include the detection
timestamp, candle start, current value, selected route, and the exact arithmetic
for every passing gate.

The existing Scalper/OIIS WhatsApp gateway configuration and scheduler are
used. The message describes a screener qualification only. It does not create
an order, paper trade, fill, target or exit. Queue delivery is retried with a
bounded attempt count, while snapshots older than ten minutes are suppressed.

Server qualification is limited to today's IST trading-date snapshot and
09:15–15:30 IST. The payload timestamp and stock quote timestamp must each be
no older than two minutes; the active and previous 5m source intervals must be
contiguous.

## Changed components

- API progression cache refresh evaluates all current rows and inserts
  qualifying records into the new additive outbox.
- The existing scalper_entry_evaluate scheduled job delivers the new event
  type using the same WhatsApp gateway and configured destination as the
  existing Scalper/OIIS alerts.
- db/sql/063_home_mw5_qualification_alert_outbox.sql adds the isolated queue.

## Validation

- API typecheck/build and all API tests pass (277/277); progression-specific
  tests cover complete M−1/M−2 qualifications, route fallback, strict Bear
  inversion, missing/zero evidence and stale suppression.
- Web typecheck/build and all Web tests pass (283/283).
- Python bytecode compilation and the scheduler-image unittest pass (1/1).
- API and scheduler Docker images build; canonical repository gate and
  diff whitespace check pass.
- Production scheduler inspection confirms WhatsApp notifications are enabled,
  its mounted gateway token is readable, and a destination is configured. The
  secret value and destination are intentionally not printed.
- Released from pushed master commit 8c38193. Migration
  db/sql/063_home_mw5_qualification_alert_outbox.sql applied transactionally.
- Dashboard image sha256:d3c85504735ede164f1e0cf95ea8af24d5b2ea3571f6b17c78e627fc7c074c98
  is healthy, has zero restarts, and the release script verified the routed
  Trading Analytics page and its fingerprinted entry asset.
- Scheduler image sha256:e68d5884dfaaee70985fc9c93cf6ce2de4d60ffa4d1c67300b94e611ca36f8ff
  is running with zero restarts; its notifier module imports successfully.
  Intraday API health returned HTTP 200.
- The outbox currently contains no events (release was outside NSE hours).
  No synthetic WhatsApp message was sent, so gateway delivery of this new event
  type remains unverified until a real live qualification occurs.
