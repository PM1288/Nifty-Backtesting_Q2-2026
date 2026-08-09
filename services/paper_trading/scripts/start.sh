#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
project="${COMPOSE_PROJECT_NAME:-trading-stack-novius2}"
docker compose -p "$project" -f "$root/docker-compose.yml" -f "$root/compose/compose.paper-trading.yml" --profile tools run --rm --no-deps paper-migrate
docker compose -p "$project" -f "$root/docker-compose.yml" -f "$root/compose/compose.paper-trading.yml" up -d --no-deps paper-api paper-monitor-worker paper-webhook-worker paper-scheduler
