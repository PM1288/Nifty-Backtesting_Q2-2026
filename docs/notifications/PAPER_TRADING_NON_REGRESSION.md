# Paper Trading Non-Regression Boundary

## Protected ownership map

The following existing areas were classified as paper-owned and excluded from this assignment:

- HTTP/API, domain, monitor, scheduler, event and webhook code under `services/paper_trading/src`.
- Paper migrations, Alembic revisions, tests, tools, documentation and n8n assets under
  `services/paper_trading`.
- `compose/compose.paper-trading.yml` and its `paper-api`, `paper-monitor-worker`,
  `paper-webhook-worker`, `paper-scheduler` and migration jobs.
- PostgreSQL schemas/tables/outboxes owned by paper trading.
- Active n8n workflow `LRFbVccpU3w0B03S`, route `/webhook/codex-paper-trade`.
- Existing paper credential bindings and all `PAPER_TRADE_*` environment/configuration.

The full 93-file pre-assignment checksum manifest is
`docs/notifications/paper_trading_boundary_pre_assignment.sha256`.

## Verification

From the repository root:

```bash
sha256sum -c docs/notifications/paper_trading_boundary_pre_assignment.sha256
services/paper_trading/.venv/bin/pytest -q services/paper_trading/tests
services/paper_trading/.venv/bin/ruff check services/paper_trading/src services/paper_trading/tests
```

Result on 11 August 2026:

- 93/93 protected files match their pre-assignment SHA-256 values.
- 17 tests passed.
- Six database integration tests were skipped because `TEST_DATABASE_URL` was not configured.
- Ruff passed.
- Active paper n8n ID, name, active state, path and update timestamp remained unchanged.

No market-status event is accepted by the paper route. The new JSON Schema and n8n formatter
allow only four `market.*.v1` event types and reject paper events. Conversely, the new market
workflow is a distinct Basic Auth route and has no paper event template or paper credential.
