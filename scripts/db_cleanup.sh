#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_CMD=(docker compose -p trading-stack-novius2 --env-file "${ENV_FILE}" -f docker-compose.yml)

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
if [[ "${POSTGRES_HOST}" != "postgres" ]]; then
  echo "Using external Postgres host: ${POSTGRES_HOST}"
fi

# Planning is the default. Apply still requires verified, unexpired DB evidence gates.
MODE=--db-cleanup-plan
if [[ "${1:-}" == "--apply" ]]; then MODE=--db-cleanup-only; fi
if [[ -n "${1:-}" && "${1}" != "--apply" ]]; then
  echo 'Usage: scripts/db_cleanup.sh [--apply]' >&2
  exit 2
fi
"${COMPOSE_CMD[@]}" run --rm --no-deps collector --config /app/config.yaml "${MODE}"
