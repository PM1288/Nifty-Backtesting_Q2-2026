from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = ".env"
DEFAULT_BASE_URL = "http://localhost:19090"
DEFAULT_SURFACE = "core"

SURFACE_FILES = {
    "core": ["compose/compose.base.yml", "compose/compose.core.yml"],
    "stage": ["compose/compose.base.yml", "compose/compose.stage.yml"],
    "telemetry": ["compose/compose.base.yml", "compose/compose.telemetry.yml"],
    "jobs": ["compose/compose.base.yml", "compose/compose.jobs.yml"],
    "legacy": ["compose/compose.base.yml", "compose/compose.legacy.yml"],
    "dev": ["compose/compose.base.yml", "compose/compose.dev.yml"],
}

SERVICE_CLASSIFICATION = {
    "postgres": "shared-infrastructure",
    "redis": "shared-infrastructure",
    "nse_ingestor": "core",
    "nse-analytics-worker": "core",
    "nse-orchestrator": "core",
    "nse-export-api": "core",
    "nse-intraday-api": "core",
    "nse-intraday-scheduler": "core",
    "nse-reco-api": "core",
    "nse-reco-scheduler": "core",
    "market-data-gateway": "core",
    "option-chain-watcher": "core",
    "n50-dashboard": "core",
    "nginx": "core-edge",
    "n50-dashboard-stage": "stage",
    "matomo": "telemetry",
    "matomo-db": "telemetry",
    "institutional-flow-ingest": "jobs",
    "collector": "legacy",
    "strategy": "legacy",
    "watchlist": "legacy",
    "rsi-willr-monitor": "legacy",
}


def resolve_repo_path(path_like: str | Path) -> Path:
    path = Path(path_like)
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def surface_files(surface: str = DEFAULT_SURFACE) -> list[Path]:
    try:
        return [resolve_repo_path(path) for path in SURFACE_FILES[surface]]
    except KeyError as exc:
        raise ValueError(f"unsupported surface: {surface}") from exc


def compose_args(surface: str = DEFAULT_SURFACE, env_file: str = DEFAULT_ENV_FILE) -> list[str]:
    args = ["docker", "compose", "--env-file", str(resolve_repo_path(env_file))]
    for compose_file in surface_files(surface):
        args.extend(["-f", str(compose_file)])
    return args


def run(
    command: list[str],
    *,
    cwd: Path | None = None,
    capture_output: bool = False,
    check: bool = True,
    text: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd or REPO_ROOT),
        check=check,
        capture_output=capture_output,
        text=text,
        errors="replace" if text else None,
    )


def compose_run(
    *compose_command: str,
    surface: str = DEFAULT_SURFACE,
    env_file: str = DEFAULT_ENV_FILE,
    capture_output: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return run(
        [*compose_args(surface, env_file), *compose_command],
        capture_output=capture_output,
        check=check,
    )


def compose_config(surface: str = DEFAULT_SURFACE, env_file: str = DEFAULT_ENV_FILE) -> dict[str, Any]:
    result = compose_run(
        "config",
        "--format",
        "json",
        surface=surface,
        env_file=env_file,
        capture_output=True,
    )
    return json.loads(result.stdout)


def compose_ps(surface: str = DEFAULT_SURFACE, env_file: str = DEFAULT_ENV_FILE) -> list[dict[str, Any]]:
    result = compose_run("ps", "--format", "json", surface=surface, env_file=env_file, capture_output=True)
    output = result.stdout.strip()
    if not output:
        return []
    try:
        parsed = json.loads(output)
    except json.JSONDecodeError:
        return [json.loads(line) for line in output.splitlines() if line.strip()]
    if isinstance(parsed, list):
        return parsed
    return [parsed]


def merged_source(surface: str = DEFAULT_SURFACE) -> dict[str, Any]:
    merged: dict[str, Any] = {"services": {}, "volumes": {}, "networks": {}}
    for compose_file in surface_files(surface):
        with compose_file.open("r", encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle) or {}
        for section in ("services", "volumes", "networks"):
            merged.setdefault(section, {})
            merged[section].update(loaded.get(section, {}) or {})
    return merged


def compose_image_names(surface: str = DEFAULT_SURFACE, env_file: str = DEFAULT_ENV_FILE) -> list[str]:
    config = compose_config(surface, env_file)
    images = []
    for service_config in config.get("services", {}).values():
        image = service_config.get("image")
        if image:
            images.append(image)
    return sorted(set(images))


def docker_image_inspect(image: str) -> dict[str, Any] | None:
    result = run(["docker", "image", "inspect", image], capture_output=True, check=False)
    if result.returncode != 0:
        return None
    inspected = json.loads(result.stdout)
    return inspected[0] if inspected else None


def duplicate_build_clusters(config: dict[str, Any]) -> dict[str, list[str]]:
    clusters: dict[str, list[str]] = {}
    for service_name, service_config in config.get("services", {}).items():
        build = service_config.get("build")
        if not build:
            continue
        if isinstance(build, str):
            context = build
            dockerfile = "Dockerfile"
            target = "-"
            args = "-"
        else:
            context = build.get("context", "")
            dockerfile = build.get("dockerfile", "Dockerfile")
            target = build.get("target", "-")
            args = json.dumps(build.get("args", {}), sort_keys=True)
        key = "|".join([context, dockerfile, target, args])
        clusters.setdefault(key, []).append(service_name)
    return {key: services for key, services in clusters.items() if len(services) > 1}


def repo_root_builds(config: dict[str, Any]) -> list[str]:
    root = str(REPO_ROOT).lower()
    root_services: list[str] = []
    for service_name, service_config in config.get("services", {}).items():
        build = service_config.get("build")
        if not build:
            continue
        context = build if isinstance(build, str) else build.get("context", "")
        if not context:
            continue
        if str(Path(context)).lower() == root:
            root_services.append(service_name)
    return sorted(root_services)


def bytes_to_mb(size_bytes: int) -> str:
    return f"{size_bytes / (1024 * 1024):.2f} MB"


def configured_pool_budget(config: dict[str, Any]) -> tuple[int, dict[str, str], list[str]]:
    pool_notes: dict[str, str] = {}
    unknown_pool_services: list[str] = []
    total = 0

    db_markers = ("postgres", "database_url", "db_url", "db_dsn")
    for service_name, service_config in config.get("services", {}).items():
        environment = service_config.get("environment", {}) or {}
        normalized = {str(key): str(value) for key, value in environment.items()}
        if not any(marker in key.lower() for key in normalized for marker in db_markers):
            continue

        explicit = None
        if "DB_POOL_SIZE" in normalized:
            explicit = int(normalized["DB_POOL_SIZE"])
            overflow = int(normalized.get("DB_MAX_OVERFLOW", "0"))
            total += explicit + overflow
            pool_notes[service_name] = f"DB_POOL_SIZE={explicit}, DB_MAX_OVERFLOW={overflow}"
            continue
        if "N50_API_DB_CONNECTION_LIMIT" in normalized:
            explicit = int(normalized["N50_API_DB_CONNECTION_LIMIT"])
            total += explicit
            pool_notes[service_name] = f"N50_API_DB_CONNECTION_LIMIT={explicit}"
            continue
        if "POSTGRES_MAX_CONNS" in normalized:
            explicit = int(normalized["POSTGRES_MAX_CONNS"])
            total += explicit
            pool_notes[service_name] = f"POSTGRES_MAX_CONNS={explicit}"
            continue

        unknown_pool_services.append(service_name)

    return total, pool_notes, sorted(set(unknown_pool_services))


def service_classification(service_name: str) -> str:
    return SERVICE_CLASSIFICATION.get(service_name, "unknown")


def service_started_dependencies(config: dict[str, Any]) -> dict[str, list[str]]:
    edges: dict[str, list[str]] = {}
    for service_name, service_config in config.get("services", {}).items():
        dependencies = []
        depends_on = service_config.get("depends_on", {}) or {}
        for dependency_name, dependency_config in depends_on.items():
            condition = dependency_config.get("condition") if isinstance(dependency_config, dict) else None
            if condition == "service_started":
                dependencies.append(dependency_name)
        if dependencies:
            edges[service_name] = sorted(dependencies)
    return edges


def startup_flag_services(config: dict[str, Any]) -> dict[str, list[str]]:
    flagged: dict[str, list[str]] = {}
    interesting_flags = (
        "INSTALL_SQL_ON_START",
        "RUN_MIGRATIONS_ON_START",
        "AUTO_MIGRATE",
        "AUTO_INSTALL_SQL",
    )
    for service_name, service_config in config.get("services", {}).items():
        environment = service_config.get("environment", {}) or {}
        found = [key for key in environment if key in interesting_flags and str(environment[key]).lower() not in {"0", "false", ""}]
        if found:
            flagged[service_name] = found
    return flagged


def poll_default_services_ready(
    config: dict[str, Any],
    *,
    surface: str = DEFAULT_SURFACE,
    env_file: str = DEFAULT_ENV_FILE,
    timeout_seconds: int = 600,
) -> tuple[bool, float, list[str], list[dict[str, Any]]]:
    started = time.monotonic()
    deadline = started + timeout_seconds
    pending: list[str] = []
    rows: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        rows = compose_ps(surface, env_file)
        pending = []
        for row in rows:
            service_name = row.get("Service", "unknown")
            state = str(row.get("State", "")).lower()
            health = str(row.get("Health", "")).lower()
            if state != "running":
                pending.append(service_name)
                continue
            if health and health not in {"healthy", "-"}:
                pending.append(service_name)
        if not pending:
            return True, time.monotonic() - started, pending, rows
        time.sleep(3)
    return False, time.monotonic() - started, pending, rows


def request_url(url: str, timeout: float = 10.0) -> tuple[int, str, bytes]:
    request = Request(url, headers={"User-Agent": "trading-stack-verify/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return response.status, response.headers.get("Content-Type", ""), response.read()
