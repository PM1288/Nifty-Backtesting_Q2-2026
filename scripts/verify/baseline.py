from __future__ import annotations

import argparse
from collections import Counter

from common import (
    DEFAULT_BASE_URL,
    compose_config,
    compose_ps,
    configured_pool_budget,
    duplicate_build_clusters,
    poll_default_services_ready,
    repo_root_builds,
    run,
    service_classification,
    service_started_dependencies,
    startup_flag_services,
)
from route_smoke import run_smoke


def publishers_for_service(service_config: dict) -> list[str]:
    published: list[str] = []
    for publisher in service_config.get("ports", []):
        if publisher.get("published"):
            published.append(f"{publisher['published']}->{publisher.get('target')}")
    return published


def mount_totals(config: dict) -> tuple[int, int]:
    bind_mounts = 0
    named_volumes = 0
    for service_config in config["services"].values():
        for volume in service_config.get("volumes", []):
            if volume.get("type") == "bind":
                bind_mounts += 1
            elif volume.get("type") == "volume":
                named_volumes += 1
    return bind_mounts, named_volumes


def print_runtime_rows(rows: list[dict]) -> None:
    if not rows:
        print("runtime: no active compose containers detected")
        return
    print("runtime services:")
    for row in rows:
        service = row.get("Service", "unknown")
        state = row.get("State", "")
        health = row.get("Health", "") or "-"
        status = row.get("Status", "")
        print(f"- {service}: state={state}, health={health}, status={status}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture the current compose/runtime baseline.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL for route smoke checks.")
    parser.add_argument("--env-file", default=".env", help="Explicit env file for compose invocations.")
    parser.add_argument(
        "--surface",
        choices=("core", "stage", "telemetry", "jobs", "legacy", "dev"),
        default="core",
        help="Compose surface to inspect.",
    )
    parser.add_argument("--bring-up", action="store_true", help="Run `docker compose up -d` before measuring readiness.")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout in seconds when waiting for default services.")
    parser.add_argument("--skip-smoke", action="store_true", help="Skip route smoke checks.")
    args = parser.parse_args()

    config = compose_config(args.surface, args.env_file)

    if args.bring_up:
        print(f"running: docker compose --env-file {args.env_file} -f compose/compose.base.yml -f compose/compose.{args.surface}.yml up -d")
        run(
            [
                "docker",
                "compose",
                "--env-file",
                args.env_file,
                "-f",
                "compose/compose.base.yml",
                "-f",
                f"compose/compose.{args.surface}.yml",
                "up",
                "-d",
            ]
        )
        ready, elapsed, pending, rows = poll_default_services_ready(
            config, surface=args.surface, env_file=args.env_file, timeout_seconds=args.timeout
        )
        print(f"startup wait: {'PASS' if ready else 'FAIL'} after {elapsed:.1f}s")
        if pending:
            print("pending services:")
            for item in pending:
                print(f"- {item}")
    else:
        rows = compose_ps(args.surface, args.env_file)

    all_services = config["services"]

    class_counts = Counter(service_classification(name) for name in all_services)
    bind_mounts, named_volumes = mount_totals(config)
    explicit_pool_total, pool_notes, unknown_pool_services = configured_pool_budget(config)
    duplicate_clusters = duplicate_build_clusters(config)
    root_context_services = repo_root_builds(config)
    started_only = service_started_dependencies(config)
    startup_flags = startup_flag_services(config)

    print(f"project: {config.get('name', 'unknown')}")
    print(f"surface: {args.surface}")
    print(f"services: {len(all_services)} resolved")
    print("classification counts:")
    for service_class, count in sorted(class_counts.items()):
        print(f"- {service_class}: {count}")

    print("published ports:")
    for service_name, service_config in all_services.items():
        published = publishers_for_service(service_config)
        if published:
            print(f"- {service_name}: {', '.join(published)}")

    print(f"mounts: {bind_mounts} bind mounts, {named_volumes} named volumes")

    print("duplicate build clusters:")
    if duplicate_clusters:
        for cluster_key, services in sorted(duplicate_clusters.items()):
            print(f"- {cluster_key}: {', '.join(sorted(services))}")
    else:
        print("- none")

    print(f"repo-root build contexts: {', '.join(root_context_services) if root_context_services else 'none'}")

    print("startup-time schema/install flags:")
    if startup_flags:
        for service_name, flags in sorted(startup_flags.items()):
            print(f"- {service_name}: {', '.join(flags)}")
    else:
        print("- none")

    print("service_started dependency edges:")
    if started_only:
        for service_name, dependencies in sorted(started_only.items()):
            print(f"- {service_name}: {', '.join(dependencies)}")
    else:
        print("- none")

    print(f"explicit DB connection ceiling: {explicit_pool_total}")
    for service_name, note in sorted(pool_notes.items()):
        print(f"- {service_name}: {note}")
    if unknown_pool_services:
        print(f"services with DB access but no explicit pool ceiling in compose: {', '.join(unknown_pool_services)}")

    print_runtime_rows(rows)

    if not args.skip_smoke:
        print("route smoke:")
        smoke_surface = "core" if args.surface == "core" else "full"
        results = run_smoke(args.base_url, surface=smoke_surface)
        failures = 0
        for result in results:
            state = "PASS" if result.ok else "FAIL"
            print(f"- {state} {result.path} ({result.detail})")
            if not result.ok:
                failures += 1
        print(f"route smoke summary: {len(results) - failures}/{len(results)} passed")
        if failures:
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
