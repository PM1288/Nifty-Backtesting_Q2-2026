#!/usr/bin/env python3
"""Read-only readiness gate for historical option/future strategy research."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

REQUIRED_TABLES = ("catalog.option_contract_observation", "research.option_trade_result")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dsn", help="PostgreSQL DSN; defaults to TRADING_DATABASE_URL")
    parser.add_argument("--underlying", default="NIFTY")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()
    dsn = args.dsn or os.getenv("TRADING_DATABASE_URL")
    result: dict[str, Any] = {"status": "BLOCKED", "underlying": args.underlying, "checks": {}, "blockers": []}
    if not dsn:
        result["blockers"].append("TRADING_DATABASE_URL is not set")
        return emit(result, args.as_json)
    try:
        import psycopg
    except ImportError:
        result["blockers"].append("psycopg is not installed; install the project dependencies")
        return emit(result, args.as_json)
    try:
        with psycopg.connect(dsn, autocommit=True) as conn, conn.cursor() as cur:
            for table in REQUIRED_TABLES:
                cur.execute("SELECT to_regclass(%s)", (table,))
                exists = cur.fetchone()[0] is not None
                result["checks"][f"table:{table}"] = exists
                if not exists:
                    result["blockers"].append(f"missing table {table}")
            if result["checks"].get("table:catalog.option_contract_observation"):
                cur.execute(
                    "SELECT count(*), min(available_at), max(available_at), count(DISTINCT source_ref) "
                    "FROM catalog.option_contract_observation WHERE upper(underlying_symbol)=upper(%s)",
                    (args.underlying,),
                )
                count, first_seen, last_seen, source_count = cur.fetchone()
                result["checks"].update({
                    "contract_observations": int(count),
                    "contract_first_available_at": first_seen.isoformat() if first_seen else None,
                    "contract_last_available_at": last_seen.isoformat() if last_seen else None,
                    "contract_source_count": int(source_count),
                })
                if count == 0:
                    result["blockers"].append("no point-in-time NIFTY option contract observations")
            cur.execute("SELECT to_regclass('catalog.option_quote_observation'), to_regclass('market.option_quote_observation')")
            quote_relations = [str(value) for value in cur.fetchone() if value]
            result["checks"]["observed_quote_relations"] = quote_relations
            if not quote_relations:
                result["blockers"].append("no registered historical option quote/premium relation")
    except Exception as exc:
        result["blockers"].append(f"database readiness query failed: {type(exc).__name__}: {exc}")
        return emit(result, args.as_json)
    if not result["blockers"]:
        result["status"] = "READY"
    return emit(result, args.as_json)


def emit(result: dict[str, Any], as_json: bool) -> int:
    if as_json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"DERIVATIVES_READINESS={result['status']}")
        for key, value in result["checks"].items():
            print(f"CHECK {key}={value}")
        for blocker in result["blockers"]:
            print(f"BLOCKER {blocker}")
    return 0 if result["status"] == "READY" else 2


if __name__ == "__main__":
    sys.exit(main())
