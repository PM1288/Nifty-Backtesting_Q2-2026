#!/usr/bin/env node
/** Read-only PostgreSQL schema/freshness catalog from the deployed container. */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outFile = path.join(repoRoot, "docs/trading-app-audit/evidence/postgres-runtime-catalog.json");
const container = process.env.POSTGRES_CONTAINER ?? "trading-stack-novius2-postgres-1";
const q = (value) => `"${String(value).replaceAll('"', '""')}"`;
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
function psql(sql) {
  const command = `psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -f -`;
  return execFileSync("docker", ["exec", "-i", container, "sh", "-lc", command], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
const split = (raw) => raw ? raw.split("\n").map((line) => line.split("|")) : [];

const tables = split(psql(`
  select t.table_schema,t.table_name,t.table_type,
         coalesce(s.n_live_tup,0)::text,
         coalesce(s.last_analyze::text,''),coalesce(s.last_autoanalyze::text,''),
         coalesce(s.last_vacuum::text,''),coalesce(s.last_autovacuum::text,'')
  from information_schema.tables t
  left join pg_stat_user_tables s on s.schemaname=t.table_schema and s.relname=t.table_name
  where t.table_schema not in ('pg_catalog','information_schema')
  order by t.table_schema,t.table_name
`)).map(([schema, table, type, estimatedRows, lastAnalyze, lastAutoAnalyze, lastVacuum, lastAutoVacuum]) => ({ schema, table, type, estimatedRows: Number(estimatedRows), lastAnalyze: lastAnalyze || null, lastAutoAnalyze: lastAutoAnalyze || null, lastVacuum: lastVacuum || null, lastAutoVacuum: lastAutoVacuum || null }));

const columns = split(psql(`
  select table_schema,table_name,column_name,data_type,is_nullable,coalesce(column_default,'')
  from information_schema.columns
  where table_schema not in ('pg_catalog','information_schema')
  order by table_schema,table_name,ordinal_position
`)).map(([schema, table, column, dataType, nullable, defaultValue]) => ({ schema, table, column, dataType, nullable: nullable === "YES", default: defaultValue || null }));

const timestampPriority = ["updated_at", "as_of", "data_as_of", "last_mark_at", "observed_at", "available_at", "trade_date", "session_date", "created_at", "timestamp", "ts"];
const freshnessCandidates = [];
for (const table of tables.filter((row) => row.type === "BASE TABLE" && row.estimatedRows > 0)) {
  const available = columns.filter((col) => col.schema === table.schema && col.table === table.table && /timestamp|date/.test(col.dataType));
  const chosen = [...available].sort((a, b) => {
    const ai = timestampPriority.indexOf(a.column); const bi = timestampPriority.indexOf(b.column);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  })[0];
  if (chosen) freshnessCandidates.push(chosen);
}

let freshness = [];
let freshnessNote = "MAX(timestamp/date) scans were intentionally skipped by default to avoid expensive reads on production-sized tables. Set POSTGRES_AUDIT_MAX_TIMESTAMPS=1 only in an approved maintenance window.";
if (freshnessCandidates.length && process.env.POSTGRES_AUDIT_MAX_TIMESTAMPS === "1") {
  const union = freshnessCandidates.map((row) => `select ${sqlLiteral(row.schema)} as schema_name,${sqlLiteral(row.table)} as table_name,${sqlLiteral(row.column)} as column_name,coalesce(max(${q(row.column)})::text,'') as latest_value from ${q(row.schema)}.${q(row.table)}`).join(" union all ");
  freshness = split(psql(`set statement_timeout='60s'; ${union};`)).filter((row) => row.length >= 4).map(([schema, table, column, latestValue]) => ({ schema, table, column, latestValue: latestValue || null, meaning: "Maximum of the selected date/timestamp column; not proof of collector freshness unless that column is the feature's canonical as-of field" }));
  freshnessNote = "Maximum candidate timestamps captured with an explicit opt-in; interpret only against feature-specific as-of semantics.";
}

const report = {
  capturedAt: new Date().toISOString(), container,
  safety: "Read-only information_schema, pg_stat_user_tables, and MAX(timestamp/date) queries; no row payloads or secrets captured.",
  tableCount: tables.length, columnCount: columns.length, freshnessCandidateColumns: freshnessCandidates, freshnessNote, tables, columns, freshness
};
await fs.writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outFile, tables: tables.length, columns: columns.length, freshness: freshness.length }, null, 2));
