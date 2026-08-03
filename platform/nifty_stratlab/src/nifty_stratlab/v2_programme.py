from __future__ import annotations

import argparse
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path

from nifty_stratlab.reporting.artifacts import write_json
from nifty_stratlab.reporting.research_pack import verify_research_pack
from nifty_stratlab.strategy.sdk import instantiate_strategy, load_manifest
from nifty_stratlab.data.postgres import _psycopg, inspect_core_coverage, point_in_time_universe_snapshot, readonly_connection


COMMANDS: dict[str, dict[str, tuple[str, ...]]] = {
    "phase1": {
        "preflight": ("config", "output"), "inventory": ("config", "output"),
        "qualify": ("config", "source-set", "run-id", "workers"),
        "resume": ("run-dir", "workers"), "verify": ("run-dir",),
        "canonicalise": ("run-dir", "output"), "calendar-check": ("config", "output"),
        "universe-as-of": ("dsn-env", "dates", "output"),
        "migration-test": ("dsn-env", "output"), "evidence-pack": ("run-dir", "output"),
    },
    "phase2": {
        "fee-verify": ("schedule", "vectors", "output"),
        "contract-note-reconcile": ("input", "output"),
        "target-solve": ("entry", "capital", "target-net", "product"),
        "feature-build": ("snapshot", "features", "output"),
        "feature-parity": ("input", "features", "output"),
        "strategy-validate": ("manifest", "output"),
        "simulate": ("strategy", "data", "config", "output"),
        "compare-legacy": ("canonical", "legacy", "output"),
        "evidence-pack": ("run-dir", "output"),
    },
    "phase3": {
        "run-create": ("strategy", "data", "scenario", "output"),
        "plan": ("run-spec", "output"),
        "worker": ("run-id", "dsn-env", "workers"),
        "status": ("run-id", "output"), "resume": ("run-id", "workers"),
        "validate": ("run-id", "output"), "publish": ("run-id", "require-validation-pass"),
        "report": ("run-id", "slices", "output"), "compare": ("run-ids", "output"),
        "evidence-pack": ("run-id", "output"),
    },
    "phase4": {
        "holdout-freeze": ("data", "policy", "output"),
        "labels-build": ("run-spec", "output"),
        "leakage-check": ("features", "policy", "output"),
        "discover": ("labels", "features", "config", "output"),
        "walk-forward": ("dataset", "config", "output"),
        "calibrate": ("oof", "method", "output"),
        "promote-candidate": ("candidate", "output-manifest"),
        "replay-candidate": ("manifest", "phase3-profile", "output"),
        "holdout-evaluate": ("model", "holdout", "output"),
        "evidence-pack": ("run-dir", "output"),
    },
    "phase5": {
        "coverage-audit": ("dsn-env", "output"),
        "contract-as-of": ("underlying", "ts", "output"),
        "option-simulate": ("strategy", "period", "output"),
        "greeks-verify": ("vectors", "output"),
        "parity-replay": ("session", "features", "output"),
        "parity-certify": ("report", "tolerances", "output"),
        "research-pack": ("subject", "as-of", "config", "output"),
        "pack-verify": ("zip", "output"),
        "programme-regression": ("config", "output"),
        "evidence-pack": ("run-dir", "output"),
    },
}


EVIDENCE_STATUS = {
    "01": ["EVIDENCED", "PARTIAL", "PARTIAL", "EVIDENCED", "BLOCKED", "PARTIAL", "PARTIAL", "NOT_RUN", "NOT_RUN", "EVIDENCED"],
    "02": ["BLOCKED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "PARTIAL", "BLOCKED", "EVIDENCED", "EVIDENCED", "BLOCKED"],
    "03": ["EVIDENCED", "PARTIAL", "EVIDENCED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "NOT_RUN", "BLOCKED"],
    "04": ["EVIDENCED", "PARTIAL", "EVIDENCED", "EVIDENCED", "EVIDENCED", "PARTIAL", "BLOCKED", "PARTIAL", "PARTIAL", "PARTIAL"],
    "05": ["BLOCKED", "PARTIAL", "BLOCKED", "EVIDENCED", "EVIDENCED", "EVIDENCED", "PARTIAL", "EVIDENCED", "EVIDENCED", "PARTIAL"],
}


def programme_audit() -> dict:
    criteria = []
    for phase, statuses in EVIDENCE_STATUS.items():
        for number, status in enumerate(statuses, 1):
            criteria.append(
                {
                    "criterion_id": f"AC-{phase}-{number:02d}",
                    "evidence_status": status,
                    "owner_acceptance": "PENDING",
                }
            )
    counts = {status: sum(row["evidence_status"] == status for row in criteria) for status in ("EVIDENCED", "PARTIAL", "BLOCKED", "NOT_RUN")}
    return {
        "programme_version": "2.0", "generated_at": datetime.now(timezone.utc),
        "programme_accepted": False, "criteria": criteria, "counts": counts,
        "critical_blockers": [
            "historical point-in-time NIFTY membership is unavailable",
            "authoritative effective-dated exchange calendar/rules are not frozen",
            "fees are not reconciled to sanitised broker contract notes",
            "carry state and retained Go/TypeScript parity are incomplete",
            "full-estate/full-history and resource-impact profiles were not authorised or run",
            "historical option premium/contract/lot coverage is not qualified",
            "human phase-owner acceptance markers do not exist",
            "target trading-stack directory has no Git metadata, so commit-based gates require an approved substitute",
        ],
        "order_authority": False,
    }


def cmd_programme_audit(args: argparse.Namespace) -> int:
    payload = programme_audit()
    if args.persist_dsn_env:
        dsn = os.getenv(args.persist_dsn_env)
        if not dsn:
            raise ValueError(f"{args.persist_dsn_env} is not set")
        psycopg, _ = _psycopg()
        with psycopg.connect(dsn, autocommit=False) as conn, conn.cursor() as cur:
            for row in payload["criteria"]:
                cur.execute(
                    """
                    INSERT INTO research.programme_acceptance_criterion(
                        programme_version, criterion_id, evidence_status, owner_acceptance, evidence
                    ) VALUES ('2.0',%s,%s,'PENDING',%s::jsonb)
                    ON CONFLICT (programme_version, criterion_id) DO UPDATE
                    SET evidence_status=EXCLUDED.evidence_status,
                        evidence=EXCLUDED.evidence, updated_at=now()
                    """,
                    (row["criterion_id"], row["evidence_status"], json.dumps({"source": "automated programme-audit"})),
                )
            conn.commit()
        payload["persisted_criteria"] = len(payload["criteria"])
    if args.output:
        write_json(args.output, payload)
    print(json.dumps(payload, default=str, indent=2))
    return 3


def _write_result(output: str | None, name: str, payload: dict) -> None:
    if not output:
        return
    path = Path(output)
    target = path if path.suffix else path / f"{name}.json"
    write_json(target, payload)


def cmd_phase_command(args: argparse.Namespace) -> int:
    phase = args.phase_name
    command = args.phase_command
    if phase == "phase1" and command == "preflight":
        config = Path(args.config)
        payload = {
            "status": "WARN" if config.is_file() else "FAIL",
            "config_exists": config.is_file(), "python": platform.python_version(),
            "platform": platform.platform(), "production_dsn_exported": bool(os.getenv("TRADING_DATABASE_URL")),
            "test_dsn_exported": bool(os.getenv("TRADING_TEST_DATABASE_URL")),
            "git_identity_available": (Path.cwd() / ".git").exists(), "order_authority": False,
        }
        _write_result(args.output, "preflight", payload)
        print(json.dumps(payload, indent=2))
        return 0 if payload["status"] != "FAIL" else 2
    if phase == "phase2" and command == "strategy-validate":
        manifest = load_manifest(args.manifest)
        instantiate_strategy(manifest)
        payload = {"status": "PASS", "strategy": manifest.model_dump(mode="json"), "order_authority": False}
        _write_result(args.output, "strategy_validation", payload)
        print(json.dumps(payload, indent=2))
        return 0
    if phase == "phase1" and command == "universe-as-of":
        dsn = os.getenv(args.dsn_env)
        if not dsn:
            raise ValueError(f"{args.dsn_env} is not set")
        dates = [item.strip() for item in args.dates.split(",") if item.strip()]
        payload = {
            "status": "PASS", "mode": "latest_complete_snapshot_on_or_before_date",
            "results": [point_in_time_universe_snapshot(datetime.fromisoformat(item).date(), dsn=dsn) for item in dates],
            "limitation": "coverage is not extended before the first stored snapshot", "order_authority": False,
        }
        _write_result(args.output, "universe_as_of", payload)
        print(json.dumps(payload, default=str, indent=2))
        return 0
    if phase == "phase3" and command == "status":
        dsn = os.getenv("TRADING_DATABASE_URL")
        if not dsn:
            raise ValueError("TRADING_DATABASE_URL is not set")
        with readonly_connection(dsn) as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id,status,validation_status,published,created_at,finished_at,summary,error_message
                FROM research.experiment_run WHERE run_id=%s
                """,
                (args.run_id,),
            )
            row = cur.fetchone()
        if row is None:
            raise ValueError(f"run not found: {args.run_id}")
        payload = {"status": "PASS", "run": dict(row), "order_authority": False}
        _write_result(args.output, "run_status", payload)
        print(json.dumps(payload, default=str, indent=2))
        return 0
    if phase == "phase5" and command == "coverage-audit":
        dsn = os.getenv(args.dsn_env)
        if not dsn:
            raise ValueError(f"{args.dsn_env} is not set")
        payload = {"status": "PASS", "datasets": inspect_core_coverage(dsn), "order_authority": False}
        _write_result(args.output, "coverage_audit", payload)
        print(json.dumps(payload, indent=2))
        return 0
    if phase == "phase5" and command == "pack-verify":
        payload = {"status": "PASS", **verify_research_pack(args.zip), "order_authority": False}
        _write_result(args.output, "pack_verification", payload)
        print(json.dumps(payload, indent=2))
        return 0
    payload = {
        "status": "BLOCKED_BY_ACCEPTANCE_GATE", "phase": phase, "command": command,
        "reason": "The frozen interface exists, but execution is prohibited until prerequisite data/config/owner gates pass.",
        "order_authority": False,
    }
    print(json.dumps(payload, indent=2))
    return 4


def add_v2_parsers(subparsers) -> None:
    audit = subparsers.add_parser("programme-audit", help="Report V2.0 criterion evidence without claiming owner acceptance")
    audit.add_argument("--output")
    audit.add_argument("--persist-dsn-env")
    audit.set_defaults(func=cmd_programme_audit)
    for phase, commands in COMMANDS.items():
        phase_parser = subparsers.add_parser(phase, help=f"V2.0 frozen {phase} command surface")
        phase_sub = phase_parser.add_subparsers(dest="phase_command", required=True)
        for command, options in commands.items():
            command_parser = phase_sub.add_parser(command)
            for option in options:
                if option == "require-validation-pass":
                    command_parser.add_argument("--require-validation-pass", action="store_true", required=True)
                else:
                    command_parser.add_argument(f"--{option}", required=True)
            command_parser.set_defaults(func=cmd_phase_command, phase_name=phase)
