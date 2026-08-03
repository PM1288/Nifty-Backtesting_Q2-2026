from __future__ import annotations

import argparse

from common import bytes_to_mb, compose_image_names, docker_image_inspect


def main() -> int:
    parser = argparse.ArgumentParser(description="Report resolved image tags and local sizes for a compose surface.")
    parser.add_argument(
        "--surface",
        choices=("core", "stage", "telemetry", "jobs", "legacy", "dev"),
        default="core",
        help="Compose surface to inspect.",
    )
    parser.add_argument("--env-file", default=".env", help="Explicit env file for compose invocations.")
    args = parser.parse_args()

    images = compose_image_names(args.surface, args.env_file)
    if not images:
        print("No compose images were resolved. Build or pull the stack first.")
        return 1

    print("IMAGE REPORT")
    print(f"surface: {args.surface}")
    print("| Image | Present locally | Size | Image ID |")
    print("|---|---:|---:|---|")
    for image in images:
        inspected = docker_image_inspect(image)
        if not inspected:
            print(f"| `{image}` | no | - | - |")
            continue
        size = int(inspected.get("Size", 0) or 0)
        image_id = inspected.get("Id", "")
        print(f"| `{image}` | yes | {bytes_to_mb(size)} | `{image_id[:19]}` |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
