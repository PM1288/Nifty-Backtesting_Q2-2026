#!/usr/bin/env bash
set -Eeuo pipefail

: "${BACKUP_DIR:?Set BACKUP_DIR to a verified backup directory}"
RESTORE_DATABASE="${RESTORE_DATABASE:-tradingdb}"
SOURCE_PRESERVATION_MANIFEST="${SOURCE_PRESERVATION_MANIFEST:-}"
MANIFEST="$BACKUP_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "Missing manifest" >&2; exit 2; }
[[ "$(jq -r '.verification_status' "$MANIFEST")" == "ARCHIVE_VERIFIED" ]] || {
  echo "Run verify-backup.sh before restore testing" >&2
  exit 2
}

ARCHIVE="$(jq -r --arg db "$RESTORE_DATABASE" '.databases[] | select(.name==$db) | .archive' "$MANIFEST")"
GRANTS="$(jq -r --arg db "$RESTORE_DATABASE" '.databases[] | select(.name==$db) | .grants // empty' "$MANIFEST")"
EXPECTED_RELATIONS="$(jq -r --arg db "$RESTORE_DATABASE" '.databases[] | select(.name==$db) | .relation_count' "$MANIFEST")"
EXPECTED_DATABASE_OWNER="$(jq -r --arg db "$RESTORE_DATABASE" '.databases[] | select(.name==$db) | .database_owner // empty' "$MANIFEST")"
[[ -n "$ARCHIVE" && "$ARCHIVE" != "null" ]] || { echo "Database is not present in manifest: $RESTORE_DATABASE" >&2; exit 2; }

SUFFIX="$(date -u +%Y%m%d%H%M%S)-$$"
CONTAINER="trading-stack-restore-proof-$SUFFIX"
VOLUME="trading-stack-restore-proof-$SUFFIX"
RESULT_FILE="$BACKUP_DIR/restore-proof-${RESTORE_DATABASE}.json"
RESTORED_MANIFEST="$BACKUP_DIR/restore-preservation-${RESTORE_DATABASE}.json"
COMPARISON_FILE="$BACKUP_DIR/restore-preservation-comparison-${RESTORE_DATABASE}.json"
SUCCESS=0
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  if (( SUCCESS == 1 )); then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  else
    echo "Restore-test resources retained after failure: container=$CONTAINER volume=$VOLUME" >&2
  fi
}
trap cleanup EXIT

docker volume create --label purpose=trading-stack-restore-proof "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" --network none \
  --label purpose=trading-stack-restore-proof \
  -e POSTGRES_USER=restore_admin \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$VOLUME:/var/lib/postgresql/data" \
  -v "$BACKUP_DIR:/backup:ro" \
  postgres:16 >/dev/null

for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" pg_isready -U restore_admin >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U restore_admin >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U restore_admin -d restore_admin -f /backup/globals.sql
if [[ -n "$EXPECTED_DATABASE_OWNER" ]]; then
  docker exec "$CONTAINER" createdb -U restore_admin -O "$EXPECTED_DATABASE_OWNER" "$RESTORE_DATABASE"
else
  docker exec "$CONTAINER" createdb -U restore_admin "$RESTORE_DATABASE"
fi
docker exec "$CONTAINER" pg_restore -U restore_admin -d "$RESTORE_DATABASE" \
  --exit-on-error --jobs="${RESTORE_JOBS:-4}" "/backup/$ARCHIVE"
if [[ -n "$GRANTS" ]]; then
  docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U restore_admin -d "$RESTORE_DATABASE" -f "/backup/$GRANTS"
fi

ACTUAL_RELATIONS="$(docker exec -e TARGET_DB="$RESTORE_DATABASE" "$CONTAINER" sh -lc \
  'psql -U restore_admin -d "$TARGET_DB" -Atqc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in (chr(114),chr(112),chr(118),chr(109),chr(83)) and n.nspname not in (chr(112)||chr(103)||chr(95)||chr(99)||chr(97)||chr(116)||chr(97)||chr(108)||chr(111)||chr(103),chr(105)||chr(110)||chr(102)||chr(111)||chr(114)||chr(109)||chr(97)||chr(116)||chr(105)||chr(111)||chr(110)||chr(95)||chr(115)||chr(99)||chr(104)||chr(101)||chr(109)||chr(97))"')"
[[ "$ACTUAL_RELATIONS" == "$EXPECTED_RELATIONS" ]] || {
  echo "Relation-count mismatch: expected=$EXPECTED_RELATIONS actual=$ACTUAL_RELATIONS" >&2
  exit 4
}
ACTUAL_DATABASE_OWNER="$(docker exec -e TARGET_DB="$RESTORE_DATABASE" "$CONTAINER" sh -lc \
  'psql -U restore_admin -d "$TARGET_DB" -Atqc "select pg_get_userbyid(datdba) from pg_database where datname=current_database()"')"
if [[ -n "$EXPECTED_DATABASE_OWNER" && "$ACTUAL_DATABASE_OWNER" != "$EXPECTED_DATABASE_OWNER" ]]; then
  echo "Database-owner mismatch: expected=$EXPECTED_DATABASE_OWNER actual=$ACTUAL_DATABASE_OWNER" >&2
  exit 4
fi

POSTGRES_CONTAINER="$CONTAINER" DATABASE_USER=restore_admin DATABASE_NAME="$RESTORE_DATABASE" \
  OUTPUT_FILE="$RESTORED_MANIFEST" "$SCRIPT_ROOT/capture-preservation-manifest.sh"

if [[ -n "$SOURCE_PRESERVATION_MANIFEST" ]]; then
  [[ -f "$SOURCE_PRESERVATION_MANIFEST" ]] || {
    echo "Source preservation manifest does not exist: $SOURCE_PRESERVATION_MANIFEST" >&2
    exit 5
  }
  jq -n \
    --slurpfile source "$SOURCE_PRESERVATION_MANIFEST" \
    --slurpfile restored "$RESTORED_MANIFEST" '
      def exact_map($doc):
        reduce ($doc.relations[] | select(.exact_rows != null)) as $r
          ({}; .[$r.schema + "." + $r.relation] = $r.exact_rows);
      def relation_names($doc): [$doc.relations[] | .schema + "." + .relation] | sort;
      def partition_names($doc): [$doc.partitions[] | .partition_schema + "." + .partition_table] | sort;
      def owner_mismatches($a;$b): [
        $a.relations[] as $s | $b.relations[] |
        select(.schema==$s.schema and .relation==$s.relation and .owner!=$s.owner) |
        {relation:(.schema+"."+.relation),source_owner:$s.owner,restored_owner:.owner}
      ];
      (exact_map($source[0])) as $source_exact |
      (exact_map($restored[0])) as $restored_exact |
      {
        status: (if
          ((relation_names($source[0]) - relation_names($restored[0])) | length) == 0 and
          ((partition_names($source[0]) - partition_names($restored[0])) | length) == 0 and
          ([$source_exact | to_entries[] | select(($restored_exact[.key] // -1) < .value)] | length) == 0 and
          (owner_mismatches($source[0];$restored[0]) | length) == 0 and
          ($source[0].object_counts == $restored[0].object_counts)
          then "PASS" else "FAIL" end),
        comparison_semantics: "restored backup must contain every pre-backup relation/partition and at least every pre-backup exact critical row; ongoing source writes after the backup snapshot are excluded",
        source_generated_at: $source[0].generated_at,
        restored_generated_at: $restored[0].generated_at,
        source_relation_count: (relation_names($source[0]) | length),
        restored_relation_count: (relation_names($restored[0]) | length),
        missing_relations: (relation_names($source[0]) - relation_names($restored[0])),
        source_partition_count: (partition_names($source[0]) | length),
        restored_partition_count: (partition_names($restored[0]) | length),
        missing_partitions: (partition_names($source[0]) - partition_names($restored[0])),
        critical_exact_counts: [
          $source_exact | to_entries[] |
          {relation:.key, source_pre_backup_exact:.value, restored_exact:($restored_exact[.key] // null),
           pass:(($restored_exact[.key] // -1) >= .value)}
        ],
        critical_ranges_source: $source[0].critical_ranges,
        critical_ranges_restored: $restored[0].critical_ranges,
        object_counts_source: $source[0].object_counts,
        object_counts_restored: $restored[0].object_counts,
        owner_mismatches: owner_mismatches($source[0];$restored[0]),
        extensions_source: $source[0].extensions,
        extensions_restored: $restored[0].extensions,
        sequence_count_source: ($source[0].sequences | length),
        sequence_count_restored: ($restored[0].sequences | length)
      }' >"$COMPARISON_FILE"
  chmod 600 "$COMPARISON_FILE"
  [[ "$(jq -r '.status' "$COMPARISON_FILE")" == "PASS" ]] || {
    echo "Restored preservation comparison failed: $COMPARISON_FILE" >&2
    exit 5
  }
fi

jq -n \
  --arg database "$RESTORE_DATABASE" \
  --arg archive "$ARCHIVE" \
  --arg tested_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg postgres_version "$(docker exec "$CONTAINER" psql -U restore_admin -d "$RESTORE_DATABASE" -Atqc 'show server_version')" \
  --arg expected_database_owner "$EXPECTED_DATABASE_OWNER" \
  --arg actual_database_owner "$ACTUAL_DATABASE_OWNER" \
  --argjson expected_relations "$EXPECTED_RELATIONS" \
  --argjson actual_relations "$ACTUAL_RELATIONS" \
  --arg restored_manifest "$(basename "$RESTORED_MANIFEST")" \
  --arg comparison_file "$(if [[ -n "$SOURCE_PRESERVATION_MANIFEST" ]]; then basename "$COMPARISON_FILE"; fi)" \
  '{status:"PASS",database:$database,archive:$archive,tested_at:$tested_at,postgres_version:$postgres_version,expected_database_owner:(if $expected_database_owner=="" then null else $expected_database_owner end),actual_database_owner:$actual_database_owner,expected_relation_count:$expected_relations,actual_relation_count:$actual_relations,isolated_network:true,published_ports:[],restored_preservation_manifest:$restored_manifest,preservation_comparison:(if $comparison_file=="" then null else $comparison_file end)}' \
  >"$RESULT_FILE"
chmod 600 "$RESULT_FILE"
SUCCESS=1
echo "Isolated restore proof passed: $RESULT_FILE"
