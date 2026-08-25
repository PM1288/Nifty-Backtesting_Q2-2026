#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_BIN=${COMPOSE_BIN:-"docker compose --env-file ${ENV_FILE} -f compose/compose.base.yml -f compose/compose.dev.yml"}
PROJECT_ARGS=()
if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
  PROJECT_ARGS=(-p "${COMPOSE_PROJECT_NAME}")
fi

run_compose() {
  # shellcheck disable=SC2086
  ${COMPOSE_BIN} "${PROJECT_ARGS[@]}" "$@"
}

POSTGRES_USER="${POSTGRES_USER:-${POSTGRES_USER_OVERRIDE:-trader}}"
POSTGRES_DB="${POSTGRES_DB:-${POSTGRES_DB_OVERRIDE:-marketdata}}"

log() {
  printf '[db-migrate-all] %s\n' "$*"
}

wait_for_postgres() {
  until run_compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
    sleep 2
  done
}

log "starting postgres"
run_compose up -d postgres
wait_for_postgres

log "1/37 collector core schema"
run_compose run --rm collector --config /app/config.yaml --db-migrate-only

log "2/37 nse ingestor"
run_compose run --rm --no-deps --entrypoint python nse_ingestor -m app.cli migrate

log "3/37 nse analytics worker"
run_compose run --rm --no-deps --entrypoint python nse-analytics-worker -m app.cli migrate

log "4/37 api read-model performance indexes"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/010_api_read_model_indexes.sql"

log "5/37 nifty100 disclosures schema"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/011_nifty100_disclosures.sql"

log "6/37 nse fii reports schema"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/012_nse_fii_reports.sql"

log "7/37 discord market stream schema"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/013_discord_market_stream.sql"

log "8/37 nifty stratlab data foundation"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/014_nifty_stratlab_foundation.sql"

log "9/37 nifty stratlab economics and strategy contracts"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/015_nifty_stratlab_economics.sql"

log "10/37 nifty stratlab replay and results"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/016_nifty_stratlab_replay.sql"

log "11/37 nifty stratlab discovery and calibration"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/017_nifty_stratlab_discovery.sql"

log "12/37 nifty stratlab options and parity"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/018_nifty_stratlab_options.sql"

log "13/37 nifty stratlab runtime hardening"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/019_nifty_stratlab_runtime_hardening.sql"

log "14/37 strategy evaluation rules of engagement"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/020_strategy_evaluation_roe.sql"

log "15/37 OIIS research decision evidence"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/021_oiis_research.sql"

log "16/37 full-path ladder evaluation V2"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/022_full_path_ladder_v2.sql"

log "17/37 full-path run governance"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/023_full_path_ladder_run_governance.sql"

log "18/37 H30 opportunity evidence V3"
run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/024_h30_opportunity_v3.sql"

migration_number=19
for step in \
  "025_nifty50_yfinance_daily_regime.sql:Nifty 50 daily regime" \
  "026_nifty500_stock_daily_regime.sql:Nifty 500 stock regime" \
  "027_global_market_daily_regime.sql:global market regime" \
  "028_universal_strategy_evaluation.sql:universal strategy evaluation" \
  "029_oiis_component_doe.sql:OIIS component DOE" \
  "030_oiis_doe_v2.sql:OIIS DOE V2" \
  "031_oiis_all_signal_capture.sql:OIIS all-signal capture" \
  "032_oiis_live.sql:OIIS live watchlist" \
  "033_oiis_live_tiered_evidence.sql:OIIS live tiered evidence" \
  "034_oiis_live_directional_integrity.sql:OIIS live directional integrity" \
  "035_oiis_live_run_history_auto_paper.sql:OIIS run history and auto paper" \
  "036_market_notification_outbox.sql:market and OIIS notification outbox" \
  "037_market_status_notifications_v1.sql:isolated market status notifications V1" \
  "055_oiss_v1_202608.sql:independent OISS v1.202608 strategy"; do
  migration="${step%%:*}"
  label="${step#*:}"
  log "${migration_number}/37 ${label}"
  run_compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${ROOT_DIR}/db/sql/${migration}"
  migration_number=$((migration_number + 1))
done

log "33/37 node api operational bootstrap"
run_compose build n50-dashboard
run_compose run --rm --entrypoint node n50-dashboard apps/api/dist/scripts/bootstrapDatabase.js

log "34/37 option-chain watcher schema"
log "prebuilding option-chain watcher host artifacts"
(cd services/option-chain-watcher && npm ci --no-audit --no-fund && npm run build)
run_compose build option-chain-watcher
run_compose run --rm --entrypoint node option-chain-watcher dist/cli.js migrate

log "35/37 orchestration exports sql"
run_compose build nse-export-api
run_compose run --rm nse-export-api python -m nse_orchestration_exports.manual_jobs install-sql

log "36/37 intraday intelligence sql"
run_compose build nse-intraday-api
run_compose run --rm nse-intraday-api python -m nse_intraday_intelligence.manual_jobs install-sql

log "37/37 recommendation overlay sql"
run_compose build nse-reco-api
run_compose run --rm --entrypoint sh nse-reco-api -lc 'python scripts/install_sql.py --database-url "$DATABASE_URL"'

log "migration flow complete"
