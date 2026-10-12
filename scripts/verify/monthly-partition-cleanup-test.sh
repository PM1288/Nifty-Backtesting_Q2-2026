#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
test_db="monthly_cleanup_test_$$"
psql_test() {
  docker exec -i trading-stack-novius2-postgres-1 sh -c \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$@"' sh "$test_db" "$@"
}
docker exec trading-stack-novius2-postgres-1 sh -c \
  'exec createdb -U "$POSTGRES_USER" "$1"' sh "$test_db"
trap 'docker exec trading-stack-novius2-postgres-1 sh -c '\''exec dropdb -U "$POSTGRES_USER" "$1"'\'' sh "$test_db"' EXIT
psql_test <<'SQL'
CREATE TABLE public.market_ticks(ts timestamptz) PARTITION BY RANGE(ts);
CREATE TABLE public.market_ticks_2026_08 PARTITION OF public.market_ticks FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE public.market_ticks_2026_09 PARTITION OF public.market_ticks FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE public.market_ticks_2026_10 PARTITION OF public.market_ticks FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE public.market_ticks_2026_11 PARTITION OF public.market_ticks FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
-- A misleading old name with future bounds must survive.
CREATE TABLE public.market_ticks_2026_07 PARTITION OF public.market_ticks FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE public.unrelated_2026_09(ts timestamptz);
CREATE VIEW public.protected_old_data AS SELECT * FROM public.market_ticks_2026_08;
SQL
# RESTRICT must prevent dependent-object deletion and roll back audit inserts.
if psql_test -v apply=true -v as_of=2026-10-06T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"; then
  echo 'Expected dependency protection to reject cleanup' >&2; exit 1
fi
psql_test <<'SQL'
DO $$ BEGIN
 IF to_regclass('public.market_ticks_2026_08') IS NULL OR
    EXISTS(SELECT FROM operations.monthly_partition_cleanup_log) THEN
   RAISE EXCEPTION 'Dependency protection failed';
 END IF;
END $$;
DROP VIEW public.protected_old_data;
SQL
psql_test -v apply=false -v as_of=2026-10-07T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
psql_test <<'SQL'
DO $$ BEGIN
 IF to_regclass('public.market_ticks_2026_08') IS NULL THEN RAISE EXCEPTION 'Plan mutated data'; END IF;
END $$;
SQL
psql_test -v apply=true -v as_of=2026-10-06T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
psql_test <<'SQL'
DO $$ BEGIN
 IF to_regclass('public.market_ticks_2026_08') IS NOT NULL OR
    to_regclass('public.market_ticks_2026_09') IS NULL THEN
   RAISE EXCEPTION 'Pre-seventh catch-up boundary failed';
 END IF;
END $$;
SQL
psql_test -v apply=true -v as_of=2026-10-07T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
psql_test -v apply=true -v as_of=2026-10-07T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
psql_test <<'SQL'
DO $$ BEGIN
 IF to_regclass('public.market_ticks_2026_09') IS NOT NULL OR
    to_regclass('public.market_ticks_2026_10') IS NULL OR
    to_regclass('public.market_ticks_2026_11') IS NULL OR
    to_regclass('public.market_ticks_2026_07') IS NULL OR
    to_regclass('public.unrelated_2026_09') IS NULL OR
    (SELECT count(*) FROM operations.monthly_partition_cleanup_log) <> 2 THEN
   RAISE EXCEPTION 'Seventh-day retention, bounds validation, or idempotency failed';
 END IF;
END $$;
SQL
psql_test -v apply=true -v as_of=2026-11-07T02:00:00Z < "$root_dir/scripts/sql/monthly_partition_cleanup.sql"
psql_test <<'SQL'
DO $$ BEGIN
 IF to_regclass('public.market_ticks_2026_10') IS NOT NULL OR
    to_regclass('public.market_ticks_2026_11') IS NULL OR
    (SELECT count(*) FROM operations.monthly_partition_cleanup_log) <> 3 THEN
   RAISE EXCEPTION 'Next-month rolling cleanup failed';
 END IF;
END $$;
SQL
echo 'Monthly partition cleanup integration tests passed.'
