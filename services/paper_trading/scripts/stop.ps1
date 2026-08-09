$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot/../../..").Path
$Project = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { "trading-stack-novius2" }
docker compose -p $Project -f "$Root/docker-compose.yml" -f "$Root/compose/compose.paper-trading.yml" stop paper-api paper-monitor-worker paper-webhook-worker paper-scheduler
