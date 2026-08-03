#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_CMD=(docker compose --env-file "${ENV_FILE}" -f compose/compose.base.yml -f compose/compose.dev.yml)

if [[ "${DB_RESET_I_KNOW:-}" != "YES" ]]; then
  echo "Refusing to reset DB. Set DB_RESET_I_KNOW=YES to continue."
  exit 1
fi

"${COMPOSE_CMD[@]}" run --rm collector --config /app/config.yaml --db-reset --i-understand-this-will-delete-data
