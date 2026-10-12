#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
apply=false
case "${1:---plan}" in
  --plan) ;;
  --apply) apply=true ;;
  *) echo 'Usage: monthly_partition_cleanup.sh [--plan|--apply]' >&2; exit 2 ;;
esac
# Use the existing container identity and its environment; never print secrets.
docker exec -i trading-stack-novius2-postgres-1 sh -c \
  'exec psql -X -U "$POSTGRES_USER" -d tradingdb "$@"' sh \
  -v "apply=$apply" -v "as_of=$(date -u +%FT%TZ)" \
  < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
