#!/usr/bin/env bash
set -Eeuo pipefail

: "${BEFORE_MANIFEST:?Set BEFORE_MANIFEST}"
: "${AFTER_MANIFEST:?Set AFTER_MANIFEST}"
: "${OUTPUT_FILE:?Set OUTPUT_FILE}"

for path in "$BEFORE_MANIFEST" "$AFTER_MANIFEST"; do
  [[ -f "$path" ]] || { echo "Manifest does not exist: $path" >&2; exit 2; }
done

jq -n --slurpfile before "$BEFORE_MANIFEST" --slurpfile after "$AFTER_MANIFEST" '
  def relation_names($doc): [$doc.relations[] | .schema + "." + .relation] | sort;
  def partition_names($doc): [$doc.partitions[] | .partition_schema + "." + .partition_table] | sort;
  def exact_map($doc): reduce ($doc.relations[] | select(.exact_rows != null)) as $r
    ({}; .[$r.schema + "." + $r.relation] = $r.exact_rows);
  (relation_names($before[0])) as $before_relations |
  (relation_names($after[0])) as $after_relations |
  (partition_names($before[0])) as $before_partitions |
  (partition_names($after[0])) as $after_partitions |
  (exact_map($before[0])) as $before_exact |
  (exact_map($after[0])) as $after_exact |
  ($before_relations - $after_relations) as $missing_relations |
  ($before_partitions - $after_partitions) as $missing_partitions |
  ([$before_exact | to_entries[] | select(($after_exact[.key] // -1) < .value) |
    {relation:.key,before:.value,after:($after_exact[.key] // null)}]) as $decreased_exact |
  {
    status:(if ($missing_relations|length)==0 and ($missing_partitions|length)==0 and ($decreased_exact|length)==0 then "PASS" else "FAIL" end),
    comparison_semantics:"additive deployment may add objects and rows but must not remove prior relations, partitions or exact critical rows",
    before_generated_at:$before[0].generated_at,
    after_generated_at:$after[0].generated_at,
    before_relation_count:($before_relations|length),after_relation_count:($after_relations|length),
    added_relations:($after_relations-$before_relations),missing_relations:$missing_relations,
    before_partition_count:($before_partitions|length),after_partition_count:($after_partitions|length),
    added_partitions:($after_partitions-$before_partitions),missing_partitions:$missing_partitions,
    decreased_exact_counts:$decreased_exact,
    object_counts_before:$before[0].object_counts,object_counts_after:$after[0].object_counts,
    sequence_count_before:($before[0].sequences|length),sequence_count_after:($after[0].sequences|length),
    critical_ranges_before:$before[0].critical_ranges,critical_ranges_after:$after[0].critical_ranges
  }
' >"$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"
[[ "$(jq -r '.status' "$OUTPUT_FILE")" == "PASS" ]] || {
  echo "Data-preservation comparison failed: $OUTPUT_FILE" >&2
  exit 3
}
echo "Data-preservation comparison passed: $OUTPUT_FILE"
