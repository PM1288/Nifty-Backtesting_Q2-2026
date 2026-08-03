#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_CMD=(docker compose --env-file "${ENV_FILE}" -f compose/compose.base.yml -f compose/compose.dev.yml)

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-marketdata}"

if [[ "${POSTGRES_HOST}" == "postgres" ]]; then
  "${COMPOSE_CMD[@]}" up -d postgres
  until "${COMPOSE_CMD[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
    sleep 2
  done
fi

"${COMPOSE_CMD[@]}" run --rm collector --config /app/config.yaml --db-migrate-only
"${COMPOSE_CMD[@]}" run --rm collector --config /app/config.yaml --db-validate-only
echo "DB init complete."
