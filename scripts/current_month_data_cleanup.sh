#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
apply=false
compact=false
paper_only=false
case "${1:---plan}" in
  --plan) ;;
  --apply) apply=true; compact=true ;;
  --paper-only) apply=true; paper_only=true ;;
  *) echo 'Usage: current_month_data_cleanup.sh [--plan|--apply|--paper-only]' >&2; exit 2 ;;
esac
docker exec -i trading-stack-novius2-postgres-1 sh -c \
  'exec psql -X -U "$POSTGRES_USER" -d tradingdb "$@"' sh \
  -v "apply=$apply" -v "compact=$compact" -v "paper_only=$paper_only" \
  -v "as_of=$(date -u +%FT%TZ)" < "$root_dir/scripts/sql/current_month_data_cleanup.sql"
