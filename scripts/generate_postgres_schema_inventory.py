#!/usr/bin/env python3
"""Generate a live PostgreSQL schema, freshness and activity inventory."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def psql(container: str, sql: str) -> Any:
    command = [
        "docker", "exec", "-i", container, "sh", "-lc",
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -v ON_ERROR_STOP=1',
    ]
    result = subprocess.run(command, input=sql, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"psql exited {result.returncode}")
    payload = result.stdout.strip()
    return json.loads(payload) if payload else None


CATALOG_SQL = r"""
WITH relations AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS relation_name,
         CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED TABLE'
              WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'f' THEN 'FOREIGN TABLE' ELSE c.relkind::text END AS relation_type,
         pg_get_userbyid(c.relowner) AS owner,
         obj_description(c.oid, 'pg_class') AS description,
         c.relispartition, parent_ns.nspname AS parent_schema, parent.relname AS parent_name,
         (SELECT count(*) FROM pg_inherits children WHERE children.inhparent=c.oid) AS child_count,
         pg_total_relation_size(c.oid) AS total_bytes,
         pg_relation_size(c.oid) AS heap_bytes,
         pg_indexes_size(c.oid) AS index_bytes,
         greatest(c.reltuples::bigint, 0) AS estimated_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_inherits inh ON inh.inhrelid=c.oid
  LEFT JOIN pg_class parent ON parent.oid=inh.inhparent
  LEFT JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_toast'
    AND c.relkind IN ('r','p','v','m','f')
), columns_json AS (
  SELECT r.oid, jsonb_agg(jsonb_build_object(
    'position', a.attnum, 'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid,a.atttypmod),
    'nullable', NOT a.attnotnull,
    'default', pg_get_expr(ad.adbin,ad.adrelid),
    'identity', nullif(a.attidentity,''),
    'generated', nullif(a.attgenerated,''),
    'description', col_description(a.attrelid,a.attnum)
  ) ORDER BY a.attnum) AS columns
  FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
  LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped GROUP BY r.oid
), constraints_json AS (
  SELECT r.oid, jsonb_agg(jsonb_build_object(
    'name', con.conname,
    'type', CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
      WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE con.contype::text END,
    'definition', pg_get_constraintdef(con.oid,true)
  ) ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'f' THEN 1 WHEN 'u' THEN 2 ELSE 3 END,con.conname) AS constraints
  FROM relations r JOIN pg_constraint con ON con.conrelid=r.oid GROUP BY r.oid
), indexes_json AS (
  SELECT r.oid, jsonb_agg(jsonb_build_object(
    'name', idx.relname, 'primary', i.indisprimary, 'unique', i.indisunique,
    'valid', i.indisvalid, 'definition', pg_get_indexdef(i.indexrelid)
  ) ORDER BY i.indisprimary DESC,i.indisunique DESC,idx.relname) AS indexes
  FROM relations r JOIN pg_index i ON i.indrelid=r.oid
  JOIN pg_class idx ON idx.oid=i.indexrelid GROUP BY r.oid
), activity AS (
  SELECT relid,n_live_tup,n_dead_tup,seq_scan,idx_scan,n_tup_ins,n_tup_upd,n_tup_del,
         last_vacuum,last_autovacuum,last_analyze,last_autoanalyze
  FROM pg_stat_user_tables
), freshness_candidates AS (
  SELECT r.oid,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS column_type,
         row_number() OVER (PARTITION BY r.oid ORDER BY
           CASE lower(a.attname)
             WHEN 'updated_at' THEN 1 WHEN 'received_at' THEN 2 WHEN 'event_time' THEN 3
             WHEN 'exchange_timestamp' THEN 4 WHEN 'ts' THEN 5 WHEN 'timestamp' THEN 6
             WHEN 'data_as_of' THEN 7 WHEN 'as_of' THEN 8 WHEN 'created_at' THEN 9
             WHEN 'trade_date' THEN 10 WHEN 'session_date' THEN 11 WHEN 'report_date' THEN 12
             WHEN 'date' THEN 13 ELSE 20 END,a.attnum) AS priority
  FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
  JOIN pg_type t ON t.oid=a.atttypid
  WHERE t.typname IN ('timestamp','timestamptz','date')
    AND lower(a.attname) IN (
      'updated_at','received_at','event_time','exchange_timestamp','exchange_ts','ts','timestamp',
      'data_as_of','as_of','created_at','trade_date','session_date','report_date','date',
      'captured_at','detected_at','started_at','completed_at','valued_at','bar_ts','refreshed_at',
      'last_mark_at','last_verified_at','effective_at','generated_at','published_at','ingested_at'
    )
), freshness AS (
  SELECT f.oid,f.column_name,f.column_type,
         CASE WHEN s.histogram_bounds IS NOT NULL THEN to_jsonb(s.histogram_bounds)->>-1
              WHEN s.most_common_vals IS NOT NULL THEN to_jsonb(s.most_common_vals)->>-1 END AS stats_latest_value
  FROM freshness_candidates f
  LEFT JOIN pg_stats s ON s.schemaname=(SELECT schema_name FROM relations WHERE oid=f.oid)
                      AND s.tablename=(SELECT relation_name FROM relations WHERE oid=f.oid)
                      AND s.attname=f.column_name
  LEFT JOIN pg_stat_user_tables st ON st.relid=f.oid
  WHERE f.priority=1
), view_defs AS (
  SELECT r.oid, CASE WHEN r.relation_type IN ('VIEW','MATERIALIZED VIEW')
                     THEN pg_get_viewdef(r.oid,true) END AS definition FROM relations r
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'database', current_database(),
  'database_user', current_user,
  'server_version', version(),
  'stats_reset', coalesce((SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),pg_postmaster_start_time()),
  'relations', coalesce(jsonb_agg(jsonb_build_object(
    'schema',r.schema_name,'name',r.relation_name,'type',r.relation_type,'owner',r.owner,
    'description',r.description,'is_partition',r.relispartition,
    'parent',concat_ws('.',r.parent_schema,r.parent_name),'children',r.child_count,
    'estimated_rows',coalesce(a.n_live_tup,r.estimated_rows),'dead_rows',coalesce(a.n_dead_tup,0),
    'total_bytes',r.total_bytes,'heap_bytes',r.heap_bytes,'index_bytes',r.index_bytes,
    'seq_scans',coalesce(a.seq_scan,0),'index_scans',coalesce(a.idx_scan,0),
    'inserts',coalesce(a.n_tup_ins,0),'updates',coalesce(a.n_tup_upd,0),'deletes',coalesce(a.n_tup_del,0),
    'last_vacuum',a.last_vacuum,'last_autovacuum',a.last_autovacuum,
    'last_analyze',a.last_analyze,'last_autoanalyze',a.last_autoanalyze,
    'freshness_column',f.column_name,'freshness_column_type',f.column_type,
    'stats_latest_value',f.stats_latest_value,
    'columns',coalesce(cj.columns,'[]'::jsonb),
    'constraints',coalesce(k.constraints,'[]'::jsonb),
    'indexes',coalesce(ij.indexes,'[]'::jsonb),
    'definition',vd.definition
  ) ORDER BY r.schema_name,r.relation_type,r.relation_name),'[]'::jsonb)
) FROM relations r
LEFT JOIN columns_json cj USING(oid)
LEFT JOIN constraints_json k USING(oid)
LEFT JOIN indexes_json ij USING(oid)
LEFT JOIN activity a ON a.relid=r.oid
LEFT JOIN freshness f USING(oid)
LEFT JOIN view_defs vd USING(oid);
"""


def human_bytes(value: int) -> str:
    size = float(value or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"


def md(value: Any) -> str:
    if value in (None, ""):
        return "—"
    return str(value).replace("|", "\\|").replace("\n", " ")


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).replace(" ", "T", 1).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        try:
            return datetime.fromisoformat(str(value)[:10]).replace(tzinfo=UTC)
        except ValueError:
            return None


def cadence(relation: dict[str, Any], stats_reset: datetime | None, generated: datetime) -> tuple[str, str]:
    name = f"{relation['schema']}.{relation['name']}".lower()
    writes = int(relation.get("inserts", 0)) + int(relation.get("updates", 0)) + int(relation.get("deletes", 0))
    if relation["type"] in {"VIEW", "MATERIALIZED VIEW"}:
        return ("Derived on query" if relation["type"] == "VIEW" else "Refresh-managed", "catalog relation type")
    if "migration_backup" in name or "legacy" in name or "archive" in name:
        return "Historical/partition storage", "relation role"
    elapsed = max((generated - stats_reset).total_seconds(), 1) if stats_reset else None
    rate = writes / elapsed if elapsed else 0
    latest = parse_time(relation.get("stats_latest_value"))
    age = (generated - latest).total_seconds() if latest else None
    if relation.get("is_partition") and (age is None or age > 8 * 86400):
        return "Historical partition", "partition age/evidence"
    if rate >= 1:
        return "Streaming; multiple writes/second", "observed pg_stat average"
    if rate >= 1 / 60:
        return "Streaming/intraday; at least one write/minute", "observed pg_stat average"
    if rate >= 1 / 3600:
        return "Periodic intraday; at least one write/hour", "observed pg_stat average"
    if rate >= 1 / 86400:
        return "Daily or batch", "observed pg_stat average"
    if writes > 0:
        return "Occasional/on-change", "observed pg_stat average"
    if age is not None and age <= 900:
        return "Current-session data", "ANALYZE histogram estimate"
    if age is not None and age <= 86400:
        return "Intraday/daily", "ANALYZE histogram estimate"
    if age is not None and age <= 8 * 86400:
        return "Daily/weekly", "ANALYZE histogram estimate"
    if relation.get("estimated_rows", 0) == 0:
        return "Empty or parent relation", "catalog estimate"
    return "No writes observed since statistics reset", "pg_stat counters"


def render(catalog: dict[str, Any]) -> str:
    generated = parse_time(catalog["generated_at"]) or datetime.now(UTC)
    stats_reset = parse_time(catalog.get("stats_reset"))
    relations = catalog["relations"]
    tables = [r for r in relations if r["type"] in {"TABLE", "PARTITIONED TABLE"}]
    foreign_tables = [r for r in relations if r["type"] == "FOREIGN TABLE"]
    views = [r for r in relations if "VIEW" in r["type"]]
    schemas = sorted({r["schema"] for r in relations})
    latest = sorted(
        [r for r in tables if parse_time(r.get("stats_latest_value"))],
        key=lambda r: parse_time(r["stats_latest_value"]) or datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    lines = [
        "# PostgreSQL Complete Schema, Freshness and Update-Cadence Inventory",
        "",
        f"**Generated from live database:** `{catalog['database']}`  ",
        f"**Generated at:** `{catalog['generated_at']}`  ",
        f"**Database user:** `{catalog['database_user']}`  ",
        f"**Server:** `{catalog['server_version']}`  ",
        f"**Statistics reset:** `{catalog.get('stats_reset') or 'unknown'}`  ",
        f"**Coverage:** {len(schemas)} application schemas, {len(tables)} physical/partitioned tables, {len(foreign_tables)} foreign tables, {len(views)} views/materialized views ({len(relations)} relations total).",
        "",
        "## How to interpret freshness and frequency",
        "",
        "PostgreSQL does not keep a universal `last row updated` timestamp. This report therefore separates evidence:",
        "",
        "- **Update cadence** is measured from `pg_stat_user_tables` insert/update/delete counters since the statistics reset. It describes observed average activity, not a contractual cron schedule.",
        "- **Latest data evidence** uses the most relevant timestamp/date column and the latest value in PostgreSQL ANALYZE statistics. It is an estimate unless the application table itself guarantees that column as a watermark.",
        "- **Views** are derived at query time. Partition parents and archive/legacy tables may show zero estimated rows while their children or allocated storage contain data.",
        "- `—` means PostgreSQL exposes no reliable generic evidence. It is not treated as zero or current.",
        "",
        "## Executive inventory by schema",
        "",
        "| Schema | Tables | Views | Estimated live rows | Total storage | Latest timestamp evidence |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for schema in schemas:
        members = [r for r in relations if r["schema"] == schema]
        schema_tables = [r for r in members if r["type"] in {"TABLE", "PARTITIONED TABLE", "FOREIGN TABLE"}]
        schema_views = [r for r in members if "VIEW" in r["type"]]
        dates = [parse_time(r.get("stats_latest_value")) for r in schema_tables]
        dates = [d for d in dates if d]
        lines.append(f"| `{schema}` | {len(schema_tables)} | {len(schema_views)} | {sum(int(r.get('estimated_rows',0)) for r in schema_tables):,} | {human_bytes(sum(int(r.get('total_bytes',0)) for r in schema_tables))} | `{max(dates).isoformat() if dates else 'unknown'}` |")
    lines += [
        "",
        "## Freshest tables",
        "",
        "These are ranked by the latest available table timestamp/date statistic, not by container uptime or last query time.",
        "",
        "| Rank | Table | Latest evidence | Evidence column | Update cadence | Rows (estimate) | Size |",
        "|---:|---|---|---|---|---:|---:|",
    ]
    for rank, relation in enumerate(latest[:50], 1):
        frequency, basis = cadence(relation, stats_reset, generated)
        lines.append(f"| {rank} | `{relation['schema']}.{relation['name']}` | `{md(relation.get('stats_latest_value'))}` | `{md(relation.get('freshness_column'))}` | {frequency} ({basis}) | {int(relation.get('estimated_rows',0)):,} | {human_bytes(relation.get('total_bytes',0))} |")
    lines += [
        "",
        "## Largest relations",
        "",
        "| Rank | Relation | Type | Rows (estimate) | Heap | Indexes | Total | Partition role |",
        "|---:|---|---|---:|---:|---:|---:|---|",
    ]
    for rank, relation in enumerate(sorted(tables, key=lambda r: int(r.get("total_bytes",0)), reverse=True)[:50], 1):
        role = f"child of `{relation['parent']}`" if relation.get("is_partition") else (f"parent with {relation['children']} children" if relation.get("children") else "standalone")
        lines.append(f"| {rank} | `{relation['schema']}.{relation['name']}` | {relation['type']} | {int(relation.get('estimated_rows',0)):,} | {human_bytes(relation.get('heap_bytes',0))} | {human_bytes(relation.get('index_bytes',0))} | {human_bytes(relation.get('total_bytes',0))} | {role} |")
    lines += ["", "# Complete relation definitions", ""]
    for schema in schemas:
        lines += [f"## Schema `{schema}`", ""]
        for relation in [r for r in relations if r["schema"] == schema]:
            fq = f"{schema}.{relation['name']}"
            frequency, basis = cadence(relation, stats_reset, generated)
            role = f"Partition of `{relation['parent']}`" if relation.get("is_partition") else (f"Partition parent ({relation['children']} children)" if relation.get("children") else "Standalone")
            lines += [
                f"### `{fq}`",
                "",
                "| Property | Value |",
                "|---|---|",
                f"| Relation type | {relation['type']} |",
                f"| Owner | `{relation['owner']}` |",
                f"| Description | {md(relation.get('description'))} |",
                f"| Partition role | {role} |",
                f"| Estimated live/dead rows | {int(relation.get('estimated_rows',0)):,} / {int(relation.get('dead_rows',0)):,} |",
                f"| Storage (heap / indexes / total) | {human_bytes(relation.get('heap_bytes',0))} / {human_bytes(relation.get('index_bytes',0))} / {human_bytes(relation.get('total_bytes',0))} |",
                f"| Writes since stats reset (insert / update / delete) | {int(relation.get('inserts',0)):,} / {int(relation.get('updates',0)):,} / {int(relation.get('deletes',0)):,} |",
                f"| Scans (sequential / index) | {int(relation.get('seq_scans',0)):,} / {int(relation.get('index_scans',0)):,} |",
                f"| Observed update cadence | **{frequency}** |",
                f"| Cadence evidence | {basis}; statistics reset `{catalog.get('stats_reset') or 'unknown'}` |",
                f"| Latest data evidence | `{md(relation.get('stats_latest_value'))}` from `{md(relation.get('freshness_column'))}` ({md(relation.get('freshness_column_type'))}); ANALYZE statistic estimate |",
                f"| Maintenance evidence | analyze `{md(relation.get('last_analyze') or relation.get('last_autoanalyze'))}`; vacuum `{md(relation.get('last_vacuum') or relation.get('last_autovacuum'))}` |",
                "",
                "#### Columns",
                "",
                "| # | Column | PostgreSQL type | Nullable | Default / generation | Description |",
                "|---:|---|---|---|---|---|",
            ]
            for column in relation.get("columns", []):
                generation = column.get("default") or (f"IDENTITY {column['identity']}" if column.get("identity") else None) or (f"GENERATED {column['generated']}" if column.get("generated") else None)
                lines.append(f"| {column['position']} | `{column['name']}` | `{md(column['type'])}` | {'YES' if column['nullable'] else 'NO'} | `{md(generation)}` | {md(column.get('description'))} |")
            constraints = relation.get("constraints", [])
            lines += ["", "#### Constraints", ""]
            if constraints:
                lines += ["| Name | Type | Definition |", "|---|---|---|"]
                for constraint in constraints:
                    lines.append(f"| `{constraint['name']}` | {constraint['type']} | `{md(constraint['definition'])}` |")
            else:
                lines.append("No declared table constraints.")
            indexes = relation.get("indexes", [])
            lines += ["", "#### Indexes", ""]
            if indexes:
                lines += ["| Name | Primary | Unique | Valid | Definition |", "|---|---|---|---|---|"]
                for index in indexes:
                    lines.append(f"| `{index['name']}` | {index['primary']} | {index['unique']} | {index['valid']} | `{md(index['definition'])}` |")
            else:
                lines.append("No physical index (normal for views and some staging/partition parents).")
            if relation.get("definition"):
                lines += ["", "#### View definition", "", "```sql", relation["definition"].rstrip(";") + ";", "```"]
            lines.append("")
    lines += [
        "# Operational conclusions",
        "",
        "1. Treat streaming tick/quote/depth/OI partitions as the freshest live estate; verify their timestamps and collector health together.",
        "2. Treat daily/batch feature and report tables as current only for their intended session/report date—not merely because PostgreSQL is connected.",
        "3. Treat `migration_backup_20260808`, `legacy`, and historical partitions as retained archives, not current serving tables.",
        "4. A zero PostgreSQL row estimate is not proof that a partition parent or unanalyzed relation is empty. Use child partitions and exact application queries for release decisions.",
        "5. Regenerate this document after migrations or scheduler changes; cadence classifications are observations from the stated statistics window.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="trading-stack-novius2-postgres-1")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    catalog = psql(args.container, CATALOG_SQL)
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(catalog), encoding="utf-8")
    print(json.dumps({"output": str(output), "relations": len(catalog["relations"]), "bytes": output.stat().st_size}))


if __name__ == "__main__":
    main()
