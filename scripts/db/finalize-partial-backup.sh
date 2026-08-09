#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
: "${PARTIAL_BACKUP_DIR:?Set PARTIAL_BACKUP_DIR to the retained .partial directory}"

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-trading-stack-novius2}"
[[ -d "$PARTIAL_BACKUP_DIR" && "$PARTIAL_BACKUP_DIR" == *.partial ]] || {
  echo "PARTIAL_BACKUP_DIR must be an existing .partial directory" >&2
  exit 2
}
FINAL_DIR="${PARTIAL_BACKUP_DIR%.partial}"
[[ ! -e "$FINAL_DIR" ]] || { echo "Final backup path already exists: $FINAL_DIR" >&2; exit 2; }

PG_CONTAINER="$(docker ps \
  --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --filter 'label=com.docker.compose.service=postgres' \
  --format '{{.Names}}' | head -n 1)"
[[ -n "$PG_CONTAINER" ]] || { echo "Running PostgreSQL container was not found" >&2; exit 3; }

MOUNT_NAME="$(docker inspect "$PG_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
SERVER_VERSION="$(docker exec "$PG_CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "show server_version"')"
SOURCE_DB="$(docker exec "$PG_CONTAINER" sh -lc 'printf "%s" "$POSTGRES_DB"')"
ROLES_JSON="$(docker exec "$PG_CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select coalesce(jsonb_agg(jsonb_build_object(chr(110)||chr(97)||chr(109)||chr(101),rolname,chr(99)||chr(97)||chr(110)||chr(95)||chr(108)||chr(111)||chr(103)||chr(105)||chr(110),rolcanlogin,chr(115)||chr(117)||chr(112)||chr(101)||chr(114)||chr(117)||chr(115)||chr(101)||chr(114),rolsuper,chr(99)||chr(114)||chr(101)||chr(97)||chr(116)||chr(101)||chr(95)||chr(100)||chr(98),rolcreatedb,chr(99)||chr(114)||chr(101)||chr(97)||chr(116)||chr(101)||chr(95)||chr(114)||chr(111)||chr(108)||chr(101),rolcreaterole,chr(114)||chr(101)||chr(112)||chr(108)||chr(105)||chr(99)||chr(97)||chr(116)||chr(105)||chr(111)||chr(110),rolreplication,chr(98)||chr(121)||chr(112)||chr(97)||chr(115)||chr(115)||chr(95)||chr(114)||chr(108)||chr(115),rolbypassrls) order by rolname),jsonb_build_array()) from pg_roles where rolname not like (chr(112)||chr(103)||chr(95)||chr(37))"')"

mapfile -t DATABASES < <(docker exec "$PG_CONTAINER" sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select datname from pg_database where datallowconn and not datistemplate order by datname"')

printf '[]' >"$PARTIAL_BACKUP_DIR/databases.final.json"
for database in "${DATABASES[@]}"; do
  safe_name="$(printf '%s' "$database" | tr -c 'A-Za-z0-9_.-' '_')"
  archive="${safe_name}.dump"
  schema="${safe_name}.schema.sql"
  grants="${safe_name}.grants.sql"
  [[ -f "$PARTIAL_BACKUP_DIR/$archive" && -f "$PARTIAL_BACKUP_DIR/$schema" ]] || {
    echo "Missing archive or schema for $database" >&2
    exit 4
  }
  pg_restore --list "$PARTIAL_BACKUP_DIR/$archive" >/dev/null
  awk '/^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)/' "$PARTIAL_BACKUP_DIR/$schema" >"$PARTIAL_BACKUP_DIR/$grants"
  database_size="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select pg_database_size(current_database())"')"
  database_owner="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select pg_get_userbyid(datdba) from pg_database where datname=current_database()"')"
  relation_count="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in (chr(114),chr(112),chr(118),chr(109),chr(83)) and n.nspname not in (chr(112)||chr(103)||chr(95)||chr(99)||chr(97)||chr(116)||chr(97)||chr(108)||chr(111)||chr(103),chr(105)||chr(110)||chr(102)||chr(111)||chr(114)||chr(109)||chr(97)||chr(116)||chr(105)||chr(111)||chr(110)||chr(95)||chr(115)||chr(99)||chr(104)||chr(101)||chr(109)||chr(97))"')"
  jq \
    --arg name "$database" --arg database_owner "$database_owner" --arg archive "$archive" --arg schema "$schema" --arg grants "$grants" \
    --arg archive_sha "$(sha256sum "$PARTIAL_BACKUP_DIR/$archive" | awk '{print $1}')" \
    --arg schema_sha "$(sha256sum "$PARTIAL_BACKUP_DIR/$schema" | awk '{print $1}')" \
    --arg grants_sha "$(sha256sum "$PARTIAL_BACKUP_DIR/$grants" | awk '{print $1}')" \
    --argjson source_size "$database_size" --argjson relation_count "$relation_count" \
    --argjson archive_size "$(stat -c %s "$PARTIAL_BACKUP_DIR/$archive")" \
    --argjson schema_size "$(stat -c %s "$PARTIAL_BACKUP_DIR/$schema")" \
    --argjson grants_size "$(stat -c %s "$PARTIAL_BACKUP_DIR/$grants")" \
    '. + [{name:$name,database_owner:$database_owner,source_size_bytes:$source_size,relation_count:$relation_count,archive:$archive,archive_size_bytes:$archive_size,archive_sha256:$archive_sha,schema:$schema,schema_size_bytes:$schema_size,schema_sha256:$schema_sha,grants:$grants,grants_size_bytes:$grants_size,grants_sha256:$grants_sha}]' \
    "$PARTIAL_BACKUP_DIR/databases.final.json" >"$PARTIAL_BACKUP_DIR/databases.final.json.next"
  mv "$PARTIAL_BACKUP_DIR/databases.final.json.next" "$PARTIAL_BACKUP_DIR/databases.final.json"
done

GLOBALS_SHA="$(sha256sum "$PARTIAL_BACKUP_DIR/globals.sql" | awk '{print $1}')"
jq -n \
  --arg backup_id "$(basename "$FINAL_DIR")" --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg project "$PROJECT_NAME" --arg container "$PG_CONTAINER" --arg volume "$MOUNT_NAME" \
  --arg server_version "$SERVER_VERSION" --arg primary_database "$SOURCE_DB" --arg globals_sha256 "$GLOBALS_SHA" \
  --argjson globals_size_bytes "$(stat -c %s "$PARTIAL_BACKUP_DIR/globals.sql")" --argjson roles "$ROLES_JSON" \
  --slurpfile databases "$PARTIAL_BACKUP_DIR/databases.final.json" \
  '{backup_id:$backup_id,generated_at:$generated_at,finalised_from_partial:true,compose_project:$project,source_container:$container,source_volume:$volume,postgres_server_version:$server_version,primary_database:$primary_database,roles:$roles,globals:{file:"globals.sql",size_bytes:$globals_size_bytes,sha256:$globals_sha256},databases:$databases[0],verification_status:"PENDING"}' \
  >"$PARTIAL_BACKUP_DIR/manifest.json"
rm "$PARTIAL_BACKUP_DIR/databases.final.json"
find "$PARTIAL_BACKUP_DIR" -type f -exec chmod 600 {} +
mv "$PARTIAL_BACKUP_DIR" "$FINAL_DIR"
echo "Partial backup finalised without re-dumping data: $FINAL_DIR"
