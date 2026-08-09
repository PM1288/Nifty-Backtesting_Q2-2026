# Strategy-lab deployment runbook

The deployed source mirror is `/home/novius2/trading-stack`. Always use the
existing Compose project name `trading-stack-novius2`; omitting it creates an
isolated network and the new services fail closed.

## Preflight

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml config --quiet
docker run --rm --network none \
  -v "$PWD/compose/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  nginx:alpine nginx -t
docker inspect trading-stack-novius2-postgres-1 \
  --format '{{.State.Health.Status}} {{range .Mounts}}{{.Name}} {{end}}'
```

Confirm the latest backup/restore evidence under the external backup directory
before applying any future migration. Never use `down -v`.

## Build and deploy

```bash
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml build nse-analytics-worker \
  nse-strategy-lab-worker n50-dashboard n50-dashboard-stage

docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps nse-analytics-worker
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps nse-strategy-lab-worker \
  n50-dashboard n50-dashboard-stage
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps --force-recreate nginx
```

The analytics entrypoint currently owns idempotent migrations. Do not start
multiple migration-capable analytics replicas concurrently. Separating this
into a one-shot migration service is a future modernisation item.

## Smoke tests

```bash
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml ps nse-analytics-worker nse-strategy-lab-worker \
  n50-dashboard n50-dashboard-stage nginx postgres redis

curl -fsS -H 'Host: m.nifty50today.co.in' \
  http://127.0.0.1:19090/n50/backtesting/lab >/dev/null
curl -fsS -H 'Host: m.nifty50today.co.in' \
  http://127.0.0.1:19090/n50/v1/backtesting/lab/catalogue | jq .environment
curl -fsS -H 'Host: stage.nifty50today.co.in' \
  http://127.0.0.1:19090/n50-stage/backtesting/lab >/dev/null
```

Expected environment is `RESEARCH_ONLY`. No command in this runbook enables
live trading or calls SmartAPI.
