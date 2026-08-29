#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-trading-stack-novius2}"
COMPOSE_ARGS=(
  --project-name "${PROJECT_NAME}"
  --env-file "${ROOT_DIR}/.env"
  -f "${ROOT_DIR}/compose/compose.base.yml"
  -f "${ROOT_DIR}/compose/compose.dev.yml"
  -f "${ROOT_DIR}/compose/compose.ai-stock-research.yml"
)

cd "${ROOT_DIR}"

echo "Applying additive AI stock research schema..."
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres \
  sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' \
  < "${ROOT_DIR}/db/sql/056_ai_stock_research.sql"

echo "Building AI stock research service..."
docker compose "${COMPOSE_ARGS[@]}" build ai-stock-research

echo "Starting AI stock research service only..."
docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps ai-stock-research

container="${PROJECT_NAME}-ai-stock-research-1"
for _ in $(seq 1 45); do
  status="$(docker inspect "${container}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  if [[ "${status}" == "healthy" ]]; then
    echo "AI stock research deployment verified: healthy"
    exit 0
  fi
  if [[ "${status}" == "unhealthy" || "${status}" == "exited" ]]; then
    docker logs --tail 80 "${container}" >&2 || true
    exit 1
  fi
  sleep 2
done

docker logs --tail 80 "${container}" >&2 || true
echo "AI stock research service did not become healthy" >&2
exit 1
