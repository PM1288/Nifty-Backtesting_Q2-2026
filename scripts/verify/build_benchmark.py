from __future__ import annotations

import argparse
import json
import time
from typing import Any

from common import compose_args, run


def benchmark_build(surface: str, env_file: str, services: list[str], no_cache: bool) -> dict[str, Any]:
    command = [*compose_args(surface, env_file), "build"]
    if no_cache:
        command.append("--no-cache")
    command.extend(services)

    started = time.perf_counter()
    result = run(command, capture_output=True, check=False)
    elapsed = time.perf_counter() - started
    return {
        "surface": surface,
        "env_file": env_file,
        "services": services,
        "no_cache": no_cache,
        "elapsed_seconds": round(elapsed, 2),
        "return_code": result.returncode,
        "stdout_tail": "\n".join(result.stdout.splitlines()[-20:]),
        "stderr_tail": "\n".join(result.stderr.splitlines()[-20:]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure docker compose build duration for a compose surface.")
    parser.add_argument(
        "--surface",
        choices=("core", "stage", "telemetry", "jobs", "legacy", "dev"),
        default="core",
        help="Compose surface to benchmark.",
    )
    parser.add_argument("--env-file", default=".env", help="Explicit env file for compose invocations.")
    parser.add_argument("--services", nargs="+", required=True, help="Services to build and time.")
    parser.add_argument("--no-cache", action="store_true", help="Run the benchmark with --no-cache.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    args = parser.parse_args()

    benchmark = benchmark_build(args.surface, args.env_file, args.services, args.no_cache)
    if args.json:
        print(json.dumps(benchmark, indent=2))
    else:
        print(f"surface: {benchmark['surface']}")
        print(f"env_file: {benchmark['env_file']}")
        print(f"no_cache: {benchmark['no_cache']}")
        print(f"services: {', '.join(benchmark['services'])}")
        print(f"elapsed_seconds: {benchmark['elapsed_seconds']}")
        print(f"return_code: {benchmark['return_code']}")
        if benchmark["stdout_tail"]:
            print("stdout_tail:")
            print(benchmark["stdout_tail"])
        if benchmark["stderr_tail"]:
            print("stderr_tail:")
            print(benchmark["stderr_tail"])
    return benchmark["return_code"]


if __name__ == "__main__":
    raise SystemExit(main())
