#!/usr/bin/env bash
set -Eeuo pipefail

: "${BACKUP_DIR:?Set BACKUP_DIR to one completed backup directory}"

MANIFEST="$BACKUP_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "Missing manifest: $MANIFEST" >&2; exit 2; }

verify_file() {
  local relative="$1" expected_sha="$2" expected_size="$3"
  local path="$BACKUP_DIR/$relative"
  [[ -f "$path" ]] || { echo "Missing backup file: $path" >&2; exit 3; }
  [[ "$(stat -c %s "$path")" == "$expected_size" ]] || { echo "Size mismatch: $relative" >&2; exit 3; }
  [[ "$(sha256sum "$path" | awk '{print $1}')" == "$expected_sha" ]] || { echo "SHA-256 mismatch: $relative" >&2; exit 3; }
}

verify_file \
  "$(jq -r '.globals.file' "$MANIFEST")" \
  "$(jq -r '.globals.sha256' "$MANIFEST")" \
  "$(jq -r '.globals.size_bytes' "$MANIFEST")"

while IFS=$'\t' read -r archive archive_sha archive_size schema schema_sha schema_size grants grants_sha grants_size; do
  verify_file "$archive" "$archive_sha" "$archive_size"
  verify_file "$schema" "$schema_sha" "$schema_size"
  if [[ -n "$grants" && "$grants" != "null" ]]; then
    verify_file "$grants" "$grants_sha" "$grants_size"
  fi
  pg_restore --list "$BACKUP_DIR/$archive" >/dev/null
done < <(jq -r '.databases[] | [.archive,.archive_sha256,.archive_size_bytes,.schema,.schema_sha256,.schema_size_bytes,(.grants // ""),(.grants_sha256 // ""),(.grants_size_bytes // 0)] | @tsv' "$MANIFEST")

jq '.verification_status="ARCHIVE_VERIFIED" | .verified_at=(now|todateiso8601)' "$MANIFEST" >"$MANIFEST.next"
chmod 600 "$MANIFEST.next"
mv "$MANIFEST.next" "$MANIFEST"
echo "Backup archive verification passed: $BACKUP_DIR"
