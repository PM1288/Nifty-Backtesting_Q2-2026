from __future__ import annotations

from common import (
    compose_config,
    duplicate_build_clusters,
    repo_root_builds,
    run,
)


def main() -> int:
    run(["docker", "compose", "--env-file", ".env", "-f", "compose/compose.base.yml", "-f", "compose/compose.core.yml", "config", "-q"])
    config = compose_config()

    resolved_services = config["services"]
    duplicate_clusters = duplicate_build_clusters(config)
    root_context_services = repo_root_builds(config)

    print("docker compose config: PASS")
    print(f"project: {config.get('name', 'unknown')}")
    print(f"services: {len(resolved_services)} resolved in base+core")
    print(f"duplicate build clusters: {len(duplicate_clusters)}")
    print(f"repo-root build contexts: {', '.join(root_context_services) if root_context_services else 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
