#!/usr/bin/env bash
set -euo pipefail

STACK_DIR=${STACK_DIR:-/home/novius2/trading-stack}
COMPOSE_FILE=${COMPOSE_FILE:-${STACK_DIR}/docker-compose.yml}
PROJECT_NAME=${PROJECT_NAME:-trading-stack-novius2}
PAPER_COMPOSE_FILE=${PAPER_COMPOSE_FILE:-${STACK_DIR}/compose/compose.paper-trading.yml}
OIIS_COMPOSE_FILE=${OIIS_COMPOSE_FILE:-${STACK_DIR}/compose/compose.oiis-live.yml}
COMPOSE_ARGS=(-p "${PROJECT_NAME}" --env-file "${STACK_DIR}/.env" -f "${COMPOSE_FILE}" -f "${PAPER_COMPOSE_FILE}" -f "${OIIS_COMPOSE_FILE}")

echo "OIIS LIVE container status"
docker compose "${COMPOSE_ARGS[@]}" ps \
  postgres collector n50-dashboard paper-api paper-monitor-worker paper-webhook-worker paper-scheduler oiis-live

echo
echo "OIIS LIVE durable service status"
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  psql -U "${POSTGRES_USER:-trader}" -d "${POSTGRES_DB:-tradingdb}" -P pager=off -c \
  "SELECT service_name,status,round(age_seconds)::bigint AS age_seconds,last_success_at,last_error_at
     FROM oiis_live.v_service_diagnostics ORDER BY service_name;"

echo
echo "Source freshness"
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  psql -U "${POSTGRES_USER:-trader}" -d "${POSTGRES_DB:-tradingdb}" -P pager=off -c \
  "SELECT (SELECT max(ts) FROM public.bars_1m) AS latest_minute_bar,
          (SELECT max(trade_date) FROM nse.fact_eod_prices) AS latest_nse_eod,
          (SELECT max(trade_date) FROM strategy_eval.stock_daily_regime) AS latest_stock_regime;"

echo
echo "Paper and notification queues"
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  psql -U "${POSTGRES_USER:-trader}" -d "${POSTGRES_DB:-tradingdb}" -P pager=off -c \
  "SELECT 'paper_group_'||lower(status) AS item,count(*) FROM paper_trading.trade_groups GROUP BY status
   UNION ALL SELECT 'paper_outbox_pending',count(*) FROM paper_trading.webhook_outbox WHERE status IN ('PENDING','RETRY')
   UNION ALL SELECT 'oiis_errors_pending',count(*) FROM oiis_live.error_outbox WHERE status='PENDING';"
