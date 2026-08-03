#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${NIFTY_STRATLAB_POSTGRES_CONTAINER:-trading-stack-novius2-postgres-1}"
TEST_DB="${NIFTY_STRATLAB_TEST_DB:-tradingdb_nifty_stratlab_test}"

case "${TEST_DB}" in
  tradingdb|marketdata|postgres)
    printf 'Refusing to use protected database name: %s\n' "${TEST_DB}" >&2
    exit 2
    ;;
esac

docker exec "${CONTAINER}" sh -lc \
  "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname = '${TEST_DB}'\"" \
  | grep -q 1 \
  || docker exec "${CONTAINER}" sh -lc \
    "createdb -U \"\$POSTGRES_USER\" '${TEST_DB}'"

for pass in 1 2; do
  for migration in "${ROOT_DIR}"/db/sql/01{4,5,6,7,8,9}_nifty_stratlab_*.sql; do
    printf 'migration pass=%s file=%s\n' "${pass}" "$(basename "${migration}")"
    docker exec -i "${CONTAINER}" sh -lc \
      "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '${TEST_DB}'" < "${migration}"
  done
done

docker exec "${CONTAINER}" sh -lc \
  "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d '${TEST_DB}' -P pager=off -c \"SELECT schemaname, count(*) AS tables FROM pg_tables WHERE schemaname IN ('catalog','research','simulation') GROUP BY schemaname ORDER BY schemaname;\""
