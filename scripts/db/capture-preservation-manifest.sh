#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: OUTPUT_FILE=/absolute/path/manifest.json [COMPOSE_PROJECT=trading-stack-novius2] scripts/db/capture-preservation-manifest.sh

For an isolated restore container, set POSTGRES_CONTAINER, DATABASE_USER and
DATABASE_NAME explicitly.

Captures read-only PostgreSQL catalogue evidence and exact counts for selected
operational tables. OUTPUT_FILE must be explicit. Existing files are not
overwritten unless OVERWRITE=1 is set.
EOF
}

if [[ "${1:-}" == "--help" ]]; then usage; exit 0; fi
: "${OUTPUT_FILE:?Set OUTPUT_FILE to an absolute JSON path}"
[[ "$OUTPUT_FILE" = /* ]] || { echo "OUTPUT_FILE must be absolute" >&2; exit 2; }
if [[ -e "$OUTPUT_FILE" && "${OVERWRITE:-0}" != "1" ]]; then
  echo "Refusing to overwrite $OUTPUT_FILE; set OVERWRITE=1 explicitly" >&2
  exit 2
fi

project="${COMPOSE_PROJECT:-trading-stack-novius2}"
postgres_container="${POSTGRES_CONTAINER:-}"
database_user="${DATABASE_USER:-}"
database_name="${DATABASE_NAME:-}"
if [[ -z "$postgres_container" ]]; then
  postgres_container="$(docker ps --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=postgres" --format '{{.Names}}' | head -n 1)"
fi
[[ -n "$postgres_container" ]] || { echo "PostgreSQL container not found for $project" >&2; exit 1; }

mkdir -p "$(dirname "$OUTPUT_FILE")"
tmp_file="$(mktemp "${OUTPUT_FILE}.tmp.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

if [[ -z "$database_user" ]]; then
  database_user="$(docker exec "$postgres_container" sh -lc 'printf "%s" "${POSTGRES_USER:-postgres}"')"
fi
if [[ -z "$database_name" ]]; then
  database_name="$(docker exec "$postgres_container" sh -lc 'printf "%s" "${POSTGRES_DB:-tradingdb}"')"
fi

docker exec -i -e TARGET_USER="$database_user" -e TARGET_DB="$database_name" "$postgres_container" \
  sh -lc 'psql -X -v ON_ERROR_STOP=1 -U "$TARGET_USER" -d "$TARGET_DB" -At' >"$tmp_file" <<'SQL'
WITH table_catalogue AS (
  SELECT n.nspname AS schema_name, c.relname AS relation_name,
         c.relkind::text AS relation_kind, c.reltuples::bigint AS estimated_rows,
         pg_get_userbyid(c.relowner) AS owner_name,
         pg_total_relation_size(c.oid) AS total_bytes,
         pg_relation_size(c.oid) AS heap_bytes,
         pg_indexes_size(c.oid) AS index_bytes,
         obj_description(c.oid, 'pg_class') AS description
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','m')
    AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
), primary_keys AS (
  SELECT n.nspname AS schema_name, c.relname AS relation_name,
         jsonb_agg(a.attname ORDER BY u.ordinality) AS columns
  FROM pg_constraint k
  JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS u(attnum, ordinality)
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
  WHERE k.contype = 'p' GROUP BY n.nspname, c.relname
), exact_counts AS (
  SELECT * FROM (VALUES
    ('nse_app','backtest_run',(SELECT count(*) FROM nse_app.backtest_run)),
    ('nse_app','backtest_run_validation',(SELECT count(*) FROM nse_app.backtest_run_validation)),
    ('nse_app','backtest_strategy_version',(SELECT count(*) FROM nse_app.backtest_strategy_version)),
    ('nse_app','batch_run_audit',(SELECT count(*) FROM nse_app.batch_run_audit)),
    ('oiis_live','selection_run',(SELECT count(*) FROM oiis_live.selection_run)),
    ('oiis_live','daily_candidate',(SELECT count(*) FROM oiis_live.daily_candidate)),
    ('oiis_live','watchlist_item',(SELECT count(*) FROM oiis_live.watchlist_item)),
    ('oiis_live','entry_claim',(SELECT count(*) FROM oiis_live.entry_claim)),
    ('paper_trading','trade_intents',(SELECT count(*) FROM paper_trading.trade_intents)),
    ('paper_trading','trade_groups',(SELECT count(*) FROM paper_trading.trade_groups)),
    ('paper_trading','trade_legs',(SELECT count(*) FROM paper_trading.trade_legs)),
    ('paper_trading','paper_orders',(SELECT count(*) FROM paper_trading.paper_orders)),
    ('paper_trading','paper_fills',(SELECT count(*) FROM paper_trading.paper_fills)),
    ('paper_trading','positions',(SELECT count(*) FROM paper_trading.positions)),
    ('paper_trading','target_hits',(SELECT count(*) FROM paper_trading.target_hits)),
    ('paper_trading','trade_events',(SELECT count(*) FROM paper_trading.trade_events)),
    ('paper_trading','webhook_outbox',(SELECT count(*) FROM paper_trading.webhook_outbox))
  ) AS v(schema_name, relation_name, exact_rows)
), critical_ranges AS (
  SELECT jsonb_build_object(
    'bars_1m', (SELECT jsonb_build_object('min_ts',min(ts),'max_ts',max(ts)) FROM public.bars_1m),
    'backtest_run', (SELECT jsonb_build_object('min_generated_at',min(generated_at),'max_generated_at',max(generated_at),'min_as_of_date',min(as_of_date),'max_as_of_date',max(as_of_date)) FROM nse_app.backtest_run),
    'paper_trade_events', (SELECT jsonb_build_object('min_event_time',min(event_time),'max_event_time',max(event_time)) FROM paper_trading.trade_events),
    'oiis_selection_run', (SELECT jsonb_build_object('min_signal_date',min(signal_date),'max_signal_date',max(signal_date)) FROM oiis_live.selection_run)
  ) AS ranges
), partitions AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'parent_schema', pn.nspname, 'parent_table', pc.relname,
           'partition_schema', cn.nspname, 'partition_table', cc.relname,
           'bound', pg_get_expr(cc.relpartbound, cc.oid)
         ) ORDER BY pn.nspname, pc.relname, cn.nspname, cc.relname), '[]'::jsonb) AS rows
  FROM pg_inherits i
  JOIN pg_class pc ON pc.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=pc.relnamespace
  JOIN pg_class cc ON cc.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=cc.relnamespace
), seqs AS (
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY schemaname, sequencename), '[]'::jsonb) AS rows FROM pg_sequences s
), exts AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('name',extname,'version',extversion) ORDER BY extname), '[]'::jsonb) AS rows FROM pg_extension
), object_counts AS (
  SELECT jsonb_build_object(
    'constraints', (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')),
    'indexes', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')),
    'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')),
    'triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')),
    'views', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname NOT IN ('pg_catalog','information_schema'))
  ) AS counts
)
SELECT jsonb_pretty(jsonb_build_object(
  'manifest_version','1.0', 'generated_at',clock_timestamp(),
  'source',jsonb_build_object('database',current_database(),'server_version',current_setting('server_version'),'server_version_num',current_setting('server_version_num'),'database_bytes',pg_database_size(current_database())),
  'relations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',t.schema_name,'relation',t.relation_name,'kind',t.relation_kind,
      'owner',t.owner_name,
      'estimated_rows',t.estimated_rows,'exact_rows',e.exact_rows,
      'total_bytes',t.total_bytes,'heap_bytes',t.heap_bytes,'index_bytes',t.index_bytes,
      'primary_key',p.columns,'description',t.description
    ) ORDER BY t.schema_name,t.relation_name),'[]'::jsonb)
    FROM table_catalogue t LEFT JOIN primary_keys p USING(schema_name,relation_name)
    LEFT JOIN exact_counts e USING(schema_name,relation_name)),
  'critical_ranges',(SELECT ranges FROM critical_ranges),
  'partitions',(SELECT rows FROM partitions), 'sequences',(SELECT rows FROM seqs),
  'extensions',(SELECT rows FROM exts), 'object_counts',(SELECT counts FROM object_counts)
));
SQL

python3 -m json.tool "$tmp_file" >/dev/null
chmod 0640 "$tmp_file"
mv "$tmp_file" "$OUTPUT_FILE"
trap - EXIT
sha256sum "$OUTPUT_FILE" >"${OUTPUT_FILE}.sha256"
chmod 0640 "${OUTPUT_FILE}.sha256"
echo "Preservation manifest: $OUTPUT_FILE"
echo "SHA-256: $(cut -d' ' -f1 "${OUTPUT_FILE}.sha256")"
