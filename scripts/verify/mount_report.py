from __future__ import annotations

import argparse
import json

from common import DEFAULT_ENV_FILE, DEFAULT_SURFACE, compose_ps, run


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Report mount and port exposure for running compose services.")
    parser.add_argument("--surface", default=DEFAULT_SURFACE)
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def inspect_container(container_id: str) -> dict:
    result = run(["docker", "inspect", container_id], capture_output=True)
    inspected = json.loads(result.stdout)
    return inspected[0]


def main() -> int:
    args = parse_args()
    rows = []
    for service in compose_ps(surface=args.surface, env_file=args.env_file):
        container_id = service.get("ID")
        if not container_id:
            continue
        inspected = inspect_container(container_id)
        mounts = inspected.get("Mounts", [])
        ports = inspected.get("NetworkSettings", {}).get("Ports", {}) or {}
        rows.append(
            {
                "service": service.get("Service"),
                "container": inspected.get("Name", "").lstrip("/"),
                "mounts": [
                    {
                        "type": mount.get("Type"),
                        "source": mount.get("Source"),
                        "target": mount.get("Destination"),
                        "rw": mount.get("RW"),
                    }
                    for mount in mounts
                ],
                "published_ports": sorted(
                    f"{container_port}->{binding['HostIp']}:{binding['HostPort']}"
                    for container_port, bindings in ports.items()
                    if bindings
                    for binding in bindings
                ),
            }
        )

    if args.as_json:
        print(json.dumps(rows, indent=2))
        return 0

    for row in rows:
        print(f"{row['service']}:")
        if row["published_ports"]:
            print(f"  published_ports: {', '.join(row['published_ports'])}")
        else:
            print("  published_ports: none")
        if row["mounts"]:
            for mount in row["mounts"]:
                mode = "rw" if mount["rw"] else "ro"
                print(f"  {mount['type']}: {mount['target']} <- {mount['source']} ({mode})")
        else:
            print("  mounts: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
