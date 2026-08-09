# Operations runbook

From `/home/novius2/trading-stack`, copy `.env.example` to the untracked, mode-0600 `.env.paper-trading`, set the `PAPER_*` and n8n values there, then:

```bash
docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml --profile tools run --rm --no-deps paper-migrate
docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml up -d --no-deps paper-api paper-monitor-worker paper-webhook-worker paper-scheduler
curl -fsS http://127.0.0.1:18088/health/ready
docker compose -f docker-compose.yml -f compose/compose.paper-trading.yml exec paper-api papertrade reconcile --account paper-main
```

Submit with `curl -H "Authorization: Bearer $PAPER_CLIENT_TOKEN" -H "Idempotency-Key: unique-signal-key" -H 'Content-Type: application/json' --data-binary @services/paper_trading/examples/requests/01_oiis_long_stock.json http://127.0.0.1:18088/api/v1/trade-intents`.

Query open trades with `SELECT * FROM paper_trading.v_open_trade_groups;`; inspect notifications with `SELECT * FROM paper_trading.v_webhook_delivery_health;`. After activating the supplied n8n production workflow, replay retained failures with `docker compose -p trading-stack-novius2 -f docker-compose.yml -f compose/compose.paper-trading.yml exec paper-api papertrade replay-dead-letters`. Generate reports with `papertrade generate-daily-summary --date YYYY-MM-DD` and `papertrade generate-weekly-summary --week-end YYYY-MM-DD`.

Back up before upgrades: `pg_dump -Fc -n paper_trading tradingdb > paper_trading.dump`. Restore into a disposable database first with `pg_restore`. Alembic downgrade drops the schema and is therefore allowed only after a verified backup and explicit maintenance approval.

PowerShell uses the same Compose commands; scripts are provided in `scripts/*.ps1`.
