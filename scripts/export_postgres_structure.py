from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPORTS_DIR = ROOT / "exports"
COMPOSE_ARGS = [
    "docker",
    "compose",
    "--env-file",
    ".env",
    "-f",
    "compose/compose.base.yml",
    "-f",
    "compose/compose.dev.yml",
]

TABLES_SQL = """
drop table if exists tmp_table_inventory;
create temp table tmp_table_inventory (
    table_schema text,
    table_name text,
    object_type text,
    row_count bigint,
    total_size_bytes bigint,
    time_column text,
    time_min text,
    time_max text
);

do $$
declare
    r record;
    chosen_time_column text;
    time_min_value text;
    time_max_value text;
    exact_rows bigint;
    total_bytes bigint;
begin
    for r in
        select table_schema, table_name, table_type
        from information_schema.tables
        where table_schema not in ('pg_catalog', 'information_schema')
          and table_schema not like 'pg_temp_%'
          and table_schema not like 'pg_toast%'
        order by table_schema, table_name
    loop
        chosen_time_column := null;
        time_min_value := null;
        time_max_value := null;
        exact_rows := null;
        total_bytes := null;

        select c.column_name
        into chosen_time_column
        from information_schema.columns c
        where c.table_schema = r.table_schema
          and c.table_name = r.table_name
          and c.data_type in ('date', 'timestamp without time zone', 'timestamp with time zone')
        order by case
            when c.column_name = 'trade_date' then 1
            when c.column_name = 'event_date' then 2
            when c.column_name = 'period_end_date' then 3
            when c.column_name = 'period_end' then 4
            when c.column_name = 'session_date' then 5
            when c.column_name = 'as_of_date' then 6
            when c.column_name = 'captured_at' then 7
            when c.column_name = 'published_at' then 8
            when c.column_name = 'generated_at' then 9
            when c.column_name = 'loaded_at' then 10
            when c.column_name = 'created_at' then 11
            when c.column_name = 'updated_at' then 12
            when c.column_name like '%trade_date%' then 13
            when c.column_name like '%event_date%' then 14
            when c.column_name like '%date%' then 15
            when c.column_name like '%time%' then 16
            when c.column_name like '%at' then 17
            else 999
        end,
        ordinal_position
        limit 1;

        if r.table_type = 'BASE TABLE' then
            select pg_total_relation_size(to_regclass(format('%I.%I', r.table_schema, r.table_name)))
            into total_bytes;

            if chosen_time_column is not null then
                execute format(
                    'select count(*)::bigint, min(%1$I)::text, max(%1$I)::text from %2$I.%3$I',
                    chosen_time_column,
                    r.table_schema,
                    r.table_name
                ) into exact_rows, time_min_value, time_max_value;
            else
                execute format(
                    'select count(*)::bigint from %1$I.%2$I',
                    r.table_schema,
                    r.table_name
                ) into exact_rows;
            end if;
        end if;

        insert into tmp_table_inventory (
            table_schema,
            table_name,
            object_type,
            row_count,
            total_size_bytes,
            time_column,
            time_min,
            time_max
        )
        values (
            r.table_schema,
            r.table_name,
            r.table_type,
            exact_rows,
            total_bytes,
            chosen_time_column,
            time_min_value,
            time_max_value
        );
    end loop;
end $$;

select
    table_schema,
    table_name,
    object_type,
    coalesce(row_count, 0) as row_count,
    coalesce(total_size_bytes, 0) as total_size_bytes,
    pg_size_pretty(coalesce(total_size_bytes, 0)) as total_size_pretty,
    coalesce(time_column, '') as time_column,
    coalesce(time_min, '') as time_min,
    coalesce(time_max, '') as time_max
from tmp_table_inventory
order by table_schema, table_name;
"""

COLUMNS_SQL = """
select
    table_schema,
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
from information_schema.columns
where table_schema not in ('pg_catalog', 'information_schema')
  and table_schema not like 'pg_temp_%'
  and table_schema not like 'pg_toast%'
order by table_schema, table_name, ordinal_position;
"""

SCHEMA_OWNERSHIP_ROWS = [
    {
        "match": re.compile(r"^public\."),
        "schema_family": "public core collector / app tables",
        "owner_service": "Go collector stack and dashboard app adjunct tables",
        "migration_source": "internal/store/migrations.go plus service-specific transitional bootstraps",
        "update_frequency": "Mixed: live intraday writes, strategy cycles, and user-driven app activity",
        "purpose": "Primary raw market warehouse, strategy state, paper trading, option chain, and app operational tables.",
    },
    {
        "match": re.compile(r"^nse\."),
        "schema_family": "nse.*",
        "owner_service": "services/nse_ingestor",
        "migration_source": "services/nse_ingestor/sql/*.sql",
        "update_frequency": "Daily NSE ingest and late-arrival refreshes",
        "purpose": "Canonical daily NSE ingest warehouse and file registry.",
    },
    {
        "match": re.compile(r"^nse_app\."),
        "schema_family": "nse_app.*",
        "owner_service": "services/nse_analytics_worker and Node API transitional dashboard snapshots",
        "migration_source": "services/nse_analytics_worker/sql/*.sql plus explicit API bootstrap for dashboard_snapshots",
        "update_frequency": "Daily analytics refreshes, scheduled backtesting marts, and app snapshot refresh jobs",
        "purpose": "Analytics marts, strategy/backtesting outputs, quality checks, and read models used by the dashboard.",
    },
    {
        "match": re.compile(r"^market_data\.nse_fii_"),
        "schema_family": "market_data FII reports",
        "owner_service": "services/nse_fii_reports_service",
        "migration_source": "db/sql/012_nse_fii_reports.sql",
        "update_frequency": "Daily pull plus manual or scheduled backfill/load by run_id",
        "purpose": "Parsed NSE FII participant and derivatives reports for downstream institutional-flow style processing.",
    },
    {
        "match": re.compile(
            r"^market_data\.(nse_corporate_actions|nse_event_calendar|nse_financial_results|yf_financial_statements)$"
        ),
        "schema_family": "market_data disclosures",
        "owner_service": "services/nifty100_disclosures_pipeline",
        "migration_source": "db/sql/011_nifty100_disclosures.sql",
        "update_frequency": "On-demand full or subset sync plus manual load/backfill runs",
        "purpose": "Nifty 100 disclosures and financial statement extracts loaded from NSE and Yahoo Finance.",
    },
    {
        "match": re.compile(r"^audit\.load_manifest$"),
        "schema_family": "audit.load_manifest",
        "owner_service": "services/nifty100_disclosures_pipeline and services/nse_fii_reports_service",
        "migration_source": "db/sql/011_nifty100_disclosures.sql",
        "update_frequency": "Every disclosures or FII load run",
        "purpose": "Run-level audit lineage for CSV-to-Postgres loader executions.",
    },
    {
        "match": re.compile(r"^institutional_flow\."),
        "schema_family": "institutional_flow.*",
        "owner_service": "services/institutional_flow_ingest",
        "migration_source": "services/institutional_flow_ingest/configs/warehouse_schema.sql",
        "update_frequency": "Daily scheduled ingestion with explicit backfill jobs for historical source windows",
        "purpose": "Institutional flow normalization, completeness tracking, and stock-level signal generation from NSE/NSDL/BSE sources.",
    },
    {
        "match": re.compile(r"^nse_ops\.(dashboard_snapshot_intraday|dashboard_section_intraday|watchlist_snapshot_intraday)$"),
        "schema_family": "nse_ops intraday-owned tables",
        "owner_service": "services/nse_intraday_intelligence",
        "migration_source": "services/nse_intraday_intelligence/sql/*.sql",
        "update_frequency": "Intraday refresh during market sessions",
        "purpose": "Intraday dashboard and watchlist snapshots owned by the intraday intelligence service.",
    },
    {
        "match": re.compile(r"^nse_ops\."),
        "schema_family": "nse_ops daily/export tables",
        "owner_service": "services/nse_orchestration_exports",
        "migration_source": "services/nse_orchestration_exports/sql/*.sql",
        "update_frequency": "Scheduled daily exports plus orchestration/job logging",
        "purpose": "Daily dashboard snapshots, watchlists, export manifests, and orchestration job tracking.",
    },
    {
        "match": re.compile(r"^nse_intraday\."),
        "schema_family": "nse_intraday.*",
        "owner_service": "services/nse_intraday_intelligence",
        "migration_source": "services/nse_intraday_intelligence/sql/*.sql",
        "update_frequency": "Near-real-time intraday/minute refresh with daily session rollups",
        "purpose": "Canonical intraday minute warehouse, features, session summaries, and live stock state.",
    },
    {
        "match": re.compile(r"^integration\."),
        "schema_family": "integration.* views",
        "owner_service": "Shared compatibility contract installed by intraday and reco packages",
        "migration_source": "services/nse_intraday_intelligence/sql/005_*,006_* and services/nse_reco_state_engine/sql/072_*,073_*",
        "update_frequency": "Derived from upstream tables whenever source data refreshes",
        "purpose": "Compatibility views/templates that present a stable contract across multiple warehouse packages.",
    },
    {
        "match": re.compile(r"^nse_reco_ops\."),
        "schema_family": "nse_reco_ops.*",
        "owner_service": "services/nse_reco_state_engine",
        "migration_source": "services/nse_reco_state_engine/sql/*.sql via scripts/install_sql.py",
        "update_frequency": "Scheduled reco-state engine job cycles",
        "purpose": "Recommendation engine operational logging and quality checks.",
    },
    {
        "match": re.compile(r"^nse_reco\."),
        "schema_family": "nse_reco.*",
        "owner_service": "services/nse_reco_state_engine",
        "migration_source": "services/nse_reco_state_engine/sql/*.sql via scripts/install_sql.py",
        "update_frequency": "Intraday reco-state refresh and scoring cycles",
        "purpose": "Recommendation snapshots, anomaly detection, regime state, and watchlist overlays.",
    },
    {
        "match": re.compile(r"^nse_exports\."),
        "schema_family": "nse_exports.*",
        "owner_service": "services/nse_reco_state_engine",
        "migration_source": "services/nse_reco_state_engine/sql/*.sql via scripts/install_sql.py",
        "update_frequency": "Export job cadence driven by recommendation/export workflows",
        "purpose": "Recommendation/export contract tables.",
    },
]


def run_command(cmd: list[str], *, cwd: Path | None = None, input_text: str | None = None) -> str:
    result = subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(cmd)}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return result.stdout


def docker_psql(sql: str) -> str:
    return run_command(
        COMPOSE_ARGS
        + [
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "trader",
            "-d",
            "tradingdb",
            "-P",
            "pager=off",
            "-q",
            "-X",
            "--csv",
        ],
        input_text=sql,
    )


def docker_pg_dump_schema() -> str:
    return run_command(
        COMPOSE_ARGS
        + [
            "exec",
            "-T",
            "postgres",
            "pg_dump",
            "-s",
            "-U",
            "trader",
            "-d",
            "tradingdb",
        ]
    )


def parse_csv(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


def write_csv(path: Path, rows: Iterable[dict[str, object]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def annotate_table(full_name: str) -> dict[str, str]:
    for mapping in SCHEMA_OWNERSHIP_ROWS:
        if mapping["match"].match(full_name):
            return {key: value for key, value in mapping.items() if key != "match"}
    return {
        "schema_family": "unclassified",
        "owner_service": "unknown / inspect schema owner docs",
        "migration_source": "not mapped in export utility",
        "update_frequency": "unknown",
        "purpose": "Inspect the table name and service docs for exact ownership; this export could not classify it automatically.",
    }


def parse_routes(markdown: str) -> list[dict[str, str]]:
    current_h2 = ""
    current_h3 = ""
    routes: list[dict[str, str]] = []
    code_pattern = re.compile(r"- `([^`]+)`")
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            current_h2 = line[3:].strip()
            current_h3 = ""
            continue
        if line.startswith("### "):
            current_h3 = line[4:].strip()
            continue
        match = code_pattern.match(line)
        if not match:
            continue
        code = match.group(1)
        if code.startswith(("GET ", "POST ", "HEAD ", "PUT ", "DELETE ")):
            method, path = code.split(" ", 1)
        else:
            method, path = "ROUTE", code
        routes.append(
            {
                "section": current_h2,
                "subsection": current_h3,
                "method": method,
                "path": path,
            }
        )
    return routes


def build_summary_markdown(
    report_date: str,
    tables: list[dict[str, object]],
    schemas: list[dict[str, str]],
    routes: list[dict[str, str]],
) -> str:
    top_tables = sorted(
        [row for row in tables if row["object_type"] == "BASE TABLE"],
        key=lambda row: int(str(row["total_size_bytes"] or 0)),
        reverse=True,
    )[:20]
    lines = [
        "# Postgres Structure Export",
        "",
        f"Generated: {report_date}",
        "",
        "## What this bundle contains",
        "",
        "- Schema-only DDL export of the live `tradingdb` database.",
        "- Inventory of every non-system table/view with exact row counts for base tables, storage footprint, and min/max time bounds when a primary date/timestamp column exists.",
        "- Column-level structure export from `information_schema.columns`.",
        "- Service ownership and update cadence mapping derived from repo migration docs.",
        "- Current public/API route inventory extracted from `docs/endpoints.md`.",
        "",
        "## Schema summary",
        "",
        "| Schema | Base tables | Views | Approx rows | Size |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in schemas:
        lines.append(
            f"| {row['table_schema']} | {row['base_table_count']} | {row['view_count']} | {row['row_count']} | {row['total_size_pretty']} |"
        )
    lines.extend(
        [
            "",
            "## Largest relations",
            "",
            "| Schema.Table | Type | Approx rows | Size | Time column | Min | Max |",
            "| --- | --- | ---: | ---: | --- | --- | --- |",
        ]
    )
    for row in top_tables:
        lines.append(
            "| {name} | {otype} | {rows} | {size} | {time_col} | {minv} | {maxv} |".format(
                name=f"{row['table_schema']}.{row['table_name']}",
                otype=row["object_type"],
                rows=row["row_count"],
                size=row["total_size_pretty"],
                time_col=row["time_column"] or "—",
                minv=row["time_min"] or "—",
                maxv=row["time_max"] or "—",
            )
        )
    lines.extend(
        [
            "",
            "## Route coverage",
            "",
            f"- Extracted {len(routes)} routes/endpoints from `docs/endpoints.md`.",
            "- See `06_routes_inventory.csv` for a flat route list and `07_routes_reference.md` for the full source reference.",
        ]
    )
    return "\n".join(lines) + "\n"


def build_schema_inventory(tables: list[dict[str, object]]) -> list[dict[str, str]]:
    grouped: dict[str, dict[str, int]] = {}
    for row in tables:
        schema = str(row["table_schema"])
        stats = grouped.setdefault(
            schema,
            {
                "base_table_count": 0,
                "view_count": 0,
                "row_count": 0,
                "total_size_bytes": 0,
            },
        )
        if row["object_type"] == "BASE TABLE":
            stats["base_table_count"] += 1
            stats["row_count"] += int(str(row["row_count"] or 0))
            stats["total_size_bytes"] += int(str(row["total_size_bytes"] or 0))
        else:
            stats["view_count"] += 1
    result = []
    for schema, stats in sorted(grouped.items()):
        result.append(
            {
                "table_schema": schema,
                "base_table_count": str(stats["base_table_count"]),
                "view_count": str(stats["view_count"]),
                "row_count": str(stats["row_count"]),
                "total_size_bytes": str(stats["total_size_bytes"]),
                "total_size_pretty": human_size(stats["total_size_bytes"]),
            }
        )
    return result


def human_size(size_bytes: int) -> str:
    units = ["bytes", "kB", "MB", "GB", "TB"]
    size = float(size_bytes)
    unit = units[0]
    for candidate in units:
        unit = candidate
        if size < 1024 or candidate == units[-1]:
            break
        size /= 1024
    if unit == "bytes":
        return f"{int(size)} {unit}"
    return f"{size:.0f} {unit}" if size >= 100 else f"{size:.1f} {unit}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export dated Postgres structure bundle for the trading stack.")
    parser.add_argument("--date", default=dt.date.today().isoformat(), help="Report date for folder naming (YYYY-MM-DD).")
    parser.add_argument("--output-root", default=str(DEFAULT_EXPORTS_DIR), help="Root directory for exports.")
    args = parser.parse_args()

    report_date = args.date
    export_root = Path(args.output_root)
    bundle_dir = export_root / f"postgres-structure-{report_date}"
    zip_path = export_root / f"postgres-structure-{report_date}.zip"

    if bundle_dir.exists():
        shutil.rmtree(bundle_dir)
    bundle_dir.mkdir(parents=True, exist_ok=True)

    schema_sql = docker_pg_dump_schema()
    (bundle_dir / "01_schema_structure.sql").write_text(schema_sql, encoding="utf-8")

    tables = parse_csv(docker_psql(TABLES_SQL))
    columns = parse_csv(docker_psql(COLUMNS_SQL))

    enriched_tables: list[dict[str, object]] = []
    for row in tables:
        full_name = f"{row['table_schema']}.{row['table_name']}"
        enriched_tables.append(
            {
                **row,
                **annotate_table(full_name),
                "full_name": full_name,
            }
        )
    schemas = build_schema_inventory(enriched_tables)

    write_csv(
        bundle_dir / "02_tables_inventory.csv",
        enriched_tables,
        [
            "table_schema",
            "table_name",
            "full_name",
            "object_type",
            "row_count",
            "total_size_bytes",
            "total_size_pretty",
            "time_column",
            "time_min",
            "time_max",
            "schema_family",
            "owner_service",
            "migration_source",
            "update_frequency",
            "purpose",
        ],
    )
    write_csv(
        bundle_dir / "03_schema_inventory.csv",
        schemas,
        [
            "table_schema",
            "base_table_count",
            "view_count",
            "row_count",
            "total_size_bytes",
            "total_size_pretty",
        ],
    )
    write_csv(
        bundle_dir / "04_columns_inventory.csv",
        columns,
        [
            "table_schema",
            "table_name",
            "ordinal_position",
            "column_name",
            "data_type",
            "udt_name",
            "is_nullable",
            "column_default",
        ],
    )

    ownership_reference_rows = []
    for mapping in SCHEMA_OWNERSHIP_ROWS:
        ownership_reference_rows.append(
            {
                "match_pattern": mapping["match"].pattern,
                "schema_family": mapping["schema_family"],
                "owner_service": mapping["owner_service"],
                "migration_source": mapping["migration_source"],
                "update_frequency": mapping["update_frequency"],
                "purpose": mapping["purpose"],
            }
        )
    write_csv(
        bundle_dir / "05_service_ownership.csv",
        ownership_reference_rows,
        [
            "match_pattern",
            "schema_family",
            "owner_service",
            "migration_source",
            "update_frequency",
            "purpose",
        ],
    )

    endpoints_markdown = (ROOT / "docs" / "endpoints.md").read_text(encoding="utf-8")
    routes = parse_routes(endpoints_markdown)
    write_csv(bundle_dir / "06_routes_inventory.csv", routes, ["section", "subsection", "method", "path"])
    (bundle_dir / "07_routes_reference.md").write_text(endpoints_markdown, encoding="utf-8")
    (bundle_dir / "08_schema_ownership_reference.md").write_text(
        (ROOT / "db" / "SCHEMA_OWNERSHIP.md").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (bundle_dir / "09_summary.md").write_text(
        build_summary_markdown(report_date, tables=enriched_tables, schemas=schemas, routes=routes),
        encoding="utf-8",
    )

    metadata = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "report_date": report_date,
        "bundle_dir": str(bundle_dir),
        "zip_path": str(zip_path),
        "database": "tradingdb",
        "postgres_service": "postgres",
        "compose_files": ["compose/compose.base.yml", "compose/compose.dev.yml"],
        "table_count": len(enriched_tables),
        "schema_count": len(schemas),
        "route_count": len(routes),
    }
    (bundle_dir / "10_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(bundle_dir.rglob("*")):
            archive.write(file_path, file_path.relative_to(export_root))

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
