#!/usr/bin/env bash
set -euo pipefail

container="${COMPOSE_PROJECT_NAME:-trading-stack-novius2}-ai-stock-research-1"
docker inspect "${container}" --format 'container={{.Name}} state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} image={{.Image}}'
docker exec "${container}" ai-stock-research validate
