#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

: "${BACKUP_ROOT:?Set BACKUP_ROOT to an external host directory outside the Git repository}"

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-trading-stack-novius2}"
STAMP="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
FINAL_DIR="${BACKUP_ROOT%/}/${STAMP}"
WORK_DIR="${FINAL_DIR}.partial"

if [[ "$(realpath -m "$BACKUP_ROOT")" == /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026* ]]; then
  echo "BACKUP_ROOT must be outside the Git repository" >&2
  exit 2
fi
if [[ -e "$FINAL_DIR" || -e "$WORK_DIR" ]]; then
  echo "Backup target already exists: $FINAL_DIR" >&2
  exit 2
fi

PG_CONTAINER="$(docker ps \
  --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
  --filter 'label=com.docker.compose.service=postgres' \
  --format '{{.Names}}' | head -n 1)"
if [[ -z "$PG_CONTAINER" ]]; then
  echo "Running PostgreSQL container was not found for project $PROJECT_NAME" >&2
  exit 3
fi

MOUNT_NAME="$(docker inspect "$PG_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
if [[ -z "$MOUNT_NAME" ]]; then
  echo "PostgreSQL data volume could not be resolved" >&2
  exit 3
fi

mkdir -p "$BACKUP_ROOT" "$WORK_DIR"
chmod 700 "$BACKUP_ROOT" "$WORK_DIR"

cleanup_partial() {
  if [[ -d "$WORK_DIR" ]]; then
    echo "Incomplete backup retained for inspection at $WORK_DIR" >&2
  fi
}
trap cleanup_partial ERR

SERVER_VERSION="$(docker exec "$PG_CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "show server_version"')"
SOURCE_DB="$(docker exec "$PG_CONTAINER" sh -lc 'printf "%s" "$POSTGRES_DB"')"
PRIMARY_SIZE="$(docker exec "$PG_CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select pg_database_size(current_database())"')"
ROLES_JSON="$(docker exec "$PG_CONTAINER" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select coalesce(jsonb_agg(jsonb_build_object(chr(110)||chr(97)||chr(109)||chr(101),rolname,chr(99)||chr(97)||chr(110)||chr(95)||chr(108)||chr(111)||chr(103)||chr(105)||chr(110),rolcanlogin,chr(115)||chr(117)||chr(112)||chr(101)||chr(114)||chr(117)||chr(115)||chr(101)||chr(114),rolsuper,chr(99)||chr(114)||chr(101)||chr(97)||chr(116)||chr(101)||chr(95)||chr(100)||chr(98),rolcreatedb,chr(99)||chr(114)||chr(101)||chr(97)||chr(116)||chr(101)||chr(95)||chr(114)||chr(111)||chr(108)||chr(101),rolcreaterole,chr(114)||chr(101)||chr(112)||chr(108)||chr(105)||chr(99)||chr(97)||chr(116)||chr(105)||chr(111)||chr(110),rolreplication,chr(98)||chr(121)||chr(112)||chr(97)||chr(115)||chr(115)||chr(95)||chr(114)||chr(108)||chr(115),rolbypassrls) order by rolname),jsonb_build_array()) from pg_roles where rolname not like (chr(112)||chr(103)||chr(95)||chr(37))"')"
FREE_BYTES="$(df -PB1 "$BACKUP_ROOT" | awk 'NR==2 {print $4}')"
REQUIRED_BYTES="$((PRIMARY_SIZE + 5368709120))"
if (( FREE_BYTES < REQUIRED_BYTES )); then
  echo "Insufficient backup space: free=$FREE_BYTES required=$REQUIRED_BYTES" >&2
  exit 4
fi

echo "Dumping global roles and grants from $PG_CONTAINER"
docker exec "$PG_CONTAINER" sh -lc 'pg_dumpall -U "$POSTGRES_USER" --globals-only' >"$WORK_DIR/globals.sql"

mapfile -t DATABASES < <(
  docker exec "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "select datname from pg_database where datallowconn and not datistemplate order by datname"'
)

printf '[]' >"$WORK_DIR/databases.json"
for database in "${DATABASES[@]}"; do
  safe_name="$(printf '%s' "$database" | tr -c 'A-Za-z0-9_.-' '_')"
  archive="${safe_name}.dump"
  schema="${safe_name}.schema.sql"
  grants="${safe_name}.grants.sql"
  echo "Dumping database $database"
  docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'pg_dump -U "$POSTGRES_USER" -d "$TARGET_DB" --format=custom --compress=6' \
    >"$WORK_DIR/$archive"
  docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'pg_dump -U "$POSTGRES_USER" -d "$TARGET_DB" --schema-only' \
    >"$WORK_DIR/$schema"
  # Keep an independently replayable privilege supplement.  This is small,
  # makes ACL preservation directly auditable, and is safe to replay after a
  # custom-format restore because GRANT/REVOKE statements are idempotent.
  docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'pg_dump -U "$POSTGRES_USER" -d "$TARGET_DB" --schema-only' \
    | awk '/^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)/' \
    >"$WORK_DIR/$grants"
  database_size="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select pg_database_size(current_database())"')"
  database_owner="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select pg_get_userbyid(datdba) from pg_database where datname=current_database()"')"
  relation_count="$(docker exec -e TARGET_DB="$database" "$PG_CONTAINER" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$TARGET_DB" -Atqc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in (chr(114),chr(112),chr(118),chr(109),chr(83)) and n.nspname not in (chr(112)||chr(103)||chr(95)||chr(99)||chr(97)||chr(116)||chr(97)||chr(108)||chr(111)||chr(103),chr(105)||chr(110)||chr(102)||chr(111)||chr(114)||chr(109)||chr(97)||chr(116)||chr(105)||chr(111)||chr(110)||chr(95)||chr(115)||chr(99)||chr(104)||chr(101)||chr(109)||chr(97))"')"
  archive_sha="$(sha256sum "$WORK_DIR/$archive" | awk '{print $1}')"
  schema_sha="$(sha256sum "$WORK_DIR/$schema" | awk '{print $1}')"
  grants_sha="$(sha256sum "$WORK_DIR/$grants" | awk '{print $1}')"
  archive_size="$(stat -c %s "$WORK_DIR/$archive")"
  schema_size="$(stat -c %s "$WORK_DIR/$schema")"
  grants_size="$(stat -c %s "$WORK_DIR/$grants")"
  jq \
    --arg name "$database" --arg database_owner "$database_owner" --arg archive "$archive" --arg schema "$schema" --arg grants "$grants" \
    --arg archive_sha "$archive_sha" --arg schema_sha "$schema_sha" --arg grants_sha "$grants_sha" \
    --argjson source_size "$database_size" --argjson relation_count "$relation_count" \
    --argjson archive_size "$archive_size" --argjson schema_size "$schema_size" --argjson grants_size "$grants_size" \
    '. + [{name:$name,database_owner:$database_owner,source_size_bytes:$source_size,relation_count:$relation_count,archive:$archive,archive_size_bytes:$archive_size,archive_sha256:$archive_sha,schema:$schema,schema_size_bytes:$schema_size,schema_sha256:$schema_sha,grants:$grants,grants_size_bytes:$grants_size,grants_sha256:$grants_sha}]' \
    "$WORK_DIR/databases.json" >"$WORK_DIR/databases.json.next"
  mv "$WORK_DIR/databases.json.next" "$WORK_DIR/databases.json"
done

GLOBALS_SHA="$(sha256sum "$WORK_DIR/globals.sql" | awk '{print $1}')"
GLOBALS_SIZE="$(stat -c %s "$WORK_DIR/globals.sql")"
jq -n \
  --arg backup_id "$STAMP" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg project "$PROJECT_NAME" \
  --arg container "$PG_CONTAINER" \
  --arg volume "$MOUNT_NAME" \
  --arg server_version "$SERVER_VERSION" \
  --arg primary_database "$SOURCE_DB" \
  --arg globals_sha256 "$GLOBALS_SHA" \
  --argjson globals_size_bytes "$GLOBALS_SIZE" \
  --argjson roles "$ROLES_JSON" \
  --slurpfile databases "$WORK_DIR/databases.json" \
  '{backup_id:$backup_id,generated_at:$generated_at,compose_project:$project,source_container:$container,source_volume:$volume,postgres_server_version:$server_version,primary_database:$primary_database,roles:$roles,globals:{file:"globals.sql",size_bytes:$globals_size_bytes,sha256:$globals_sha256},databases:$databases[0],verification_status:"PENDING"}' \
  >"$WORK_DIR/manifest.json"

find "$WORK_DIR" -type f -exec chmod 600 {} +
mv "$WORK_DIR" "$FINAL_DIR"
trap - ERR
echo "Backup completed: $FINAL_DIR"
echo "Run: BACKUP_DIR='$FINAL_DIR' ./scripts/db/verify-backup.sh"
