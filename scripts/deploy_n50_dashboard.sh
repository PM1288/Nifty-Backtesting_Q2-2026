#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/home/novius2/trading-stack}"
PROJECT_NAME="${PROJECT_NAME:-trading-stack-novius2}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:19090}"
ROUTE_PATH="${ROUTE_PATH:-/n50/strategy/oiis-live}"

COMPOSE_FILE="${STACK_DIR}/docker-compose.yml"
ENV_FILE="${STACK_DIR}/.env"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Missing Compose file: ${COMPOSE_FILE}" >&2
  exit 2
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing runtime environment file: ${ENV_FILE}" >&2
  exit 2
fi

compose=(
  docker compose
  -p "${PROJECT_NAME}"
  --env-file "${ENV_FILE}"
  -f "${COMPOSE_FILE}"
)

echo "Building n50-dashboard with the production Compose arguments..."
"${compose[@]}" build n50-dashboard

echo "Deploying n50-dashboard without replacing unrelated services..."
"${compose[@]}" up -d --no-deps --no-build n50-dashboard

container_id="$("${compose[@]}" ps -q n50-dashboard)"
if [[ -z "${container_id}" ]]; then
  echo "Compose did not return an n50-dashboard container ID." >&2
  exit 3
fi

echo "Waiting for the dashboard container to become healthy..."
for _ in $(seq 1 60); do
  health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
  if [[ "${health_status}" == "healthy" ]]; then
    break
  fi
  if [[ "${health_status}" == "unhealthy" || "${health_status}" == "exited" || "${health_status}" == "dead" ]]; then
    echo "Dashboard entered terminal state: ${health_status}" >&2
    docker logs --tail 100 "${container_id}" >&2
    exit 4
  fi
  sleep 2
done

health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
if [[ "${health_status}" != "healthy" ]]; then
  echo "Dashboard did not become healthy; current state: ${health_status}" >&2
  docker logs --tail 100 "${container_id}" >&2
  exit 4
fi

route_url="${PUBLIC_BASE_URL%/}${ROUTE_PATH}"
echo "Verifying routed page: ${route_url}"
html="$(curl --fail --silent --show-error --max-time 20 "${route_url}")"
main_asset="$(printf '%s' "${html}" | sed -nE 's|.*<script[^>]+src="([^"]*index-[^"]+\.js)".*|\1|p' | head -n 1)"

if [[ -z "${main_asset}" ]]; then
  echo "Could not find the Vite entry asset in the routed HTML." >&2
  exit 5
fi

if [[ "${main_asset}" != /n50/assets/* ]]; then
  echo "Invalid production asset path: ${main_asset}" >&2
  echo "Expected an asset below /n50/assets/. Build through Compose so VITE_BASE_PATH is applied." >&2
  exit 5
fi

asset_url="${PUBLIC_BASE_URL%/}${main_asset}"
curl --fail --silent --show-error --max-time 30 --output /dev/null "${asset_url}"

echo "Dashboard deployment verified."
echo "Container health: ${health_status}"
echo "Route: ${route_url}"
echo "Entry asset: ${asset_url}"
