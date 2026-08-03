#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_CMD=(docker compose --env-file "${ENV_FILE}" -f compose/compose.base.yml -f compose/compose.dev.yml)

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
if [[ "${POSTGRES_HOST}" != "postgres" ]]; then
  echo "Using external Postgres host: ${POSTGRES_HOST}"
fi

"${COMPOSE_CMD[@]}" run --rm collector --config /app/config.yaml --db-cleanup-only
