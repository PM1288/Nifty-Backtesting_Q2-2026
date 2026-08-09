$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot/../../..").Path
$Project = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { "trading-stack-novius2" }
docker compose -p $Project -f "$Root/docker-compose.yml" -f "$Root/compose/compose.paper-trading.yml" --profile tools run --rm --no-deps paper-migrate
docker compose -p $Project -f "$Root/docker-compose.yml" -f "$Root/compose/compose.paper-trading.yml" up -d --no-deps paper-api paper-monitor-worker paper-webhook-worker paper-scheduler
