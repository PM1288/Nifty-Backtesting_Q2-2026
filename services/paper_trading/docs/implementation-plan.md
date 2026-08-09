# Universal paper-trading implementation plan

## Existing stack findings

- Runtime source: `/home/novius2/trading-stack`; versioned mirror: this repository.
- PostgreSQL 16.13 database `tradingdb`; existing market data is read through
  `public.bars_1m`, `public.instruments`, `public.quote_snapshots` and
  `public.option_greeks` without changing those objects.
- `public.bars_1m` is monthly partitioned and contains UTC `TIMESTAMPTZ`, NSE
  exchange/token identity and exact `NUMERIC` OHLC.
- Existing Go paper tables are strategy-specific and use floating-point values.
  They remain untouched; this service owns a new `paper_trading` schema.
- The stack uses explicit deployment migrations and Compose overlays. Runtime
  DDL by API/worker processes is prohibited.

## Delivery map

1. Add one Python 3.12 image containing FastAPI, Pydantic 2, SQLAlchemy 2,
   psycopg 3, httpx, Prometheus metrics and a CLI.
2. Add an idempotent SQL/Alembic migration containing normalised identity,
   intent, trade, analytical, ledger, outbox, delivery, summary and audit
   tables plus reporting views.
3. Add API, bar monitor, transactional webhook worker and scheduler commands.
4. Enforce paper-only configuration and state machines; use Decimal throughout
   financial calculations.
5. Map the existing minute-bar warehouse through a validated adapter contract
   and durable per-instrument cursor.
6. Publish JSON Schema/OpenAPI/examples and an importable n8n workflow.
7. Test domain maths, independent ladders, idempotency, HMAC delivery, state
   invariants, restart/bar replay and summaries using disposable PostgreSQL.
8. Build the image, migrate a disposable database, run API/monitor/webhook
   integration tests, then migrate and deploy against `tradingdb`.

## Safety decisions

- No broker package, credential or live-order path exists.
- `PAPER_TRADING_ONLY=true` is mandatory and `environment=LIVE` is rejected.
- Analytical target hits never close an execution position unless an explicit
  execution rule owns that action.
- The default cost profile is disabled until an effective-dated operator rate
  is seeded; deterministic fixture rates are test-only. The 35% value is a
  management provision, not tax advice.
- n8n failure cannot roll back trades: events and outbox rows commit atomically,
  then delivery occurs asynchronously with at-least-once semantics.
