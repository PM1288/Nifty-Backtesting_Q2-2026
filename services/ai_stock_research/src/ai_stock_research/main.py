from __future__ import annotations

import argparse
import json

import httpx

from .config import Settings
from .logging_json import configure_logging
from .repository import Repository
from .runtime import Runtime


def provider_health(settings: Settings) -> dict[str, object]:
    results: dict[str, object] = {}
    with httpx.Client(timeout=httpx.Timeout(10, connect=5)) as client:
        for provider, query_url in settings.provider_endpoints.items():
            health_url = query_url.rsplit("/", 1)[0] + "/health"
            try:
                response = client.get(health_url)
                results[provider] = {
                    "status": "HEALTHY" if response.status_code == 200 else "UNHEALTHY",
                    "http_status": response.status_code,
                }
            except httpx.HTTPError as exc:
                results[provider] = {"status": "UNREACHABLE", "error_class": type(exc).__name__}
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["run", "once", "discover", "validate"])
    args = parser.parse_args()
    settings = Settings.from_env()
    configure_logging(settings.log_level)
    if args.command == "validate":
        repository = Repository(settings.database_url)
        try:
            result = {"database": repository.validation_summary(), "providers": provider_health(settings)}
        finally:
            repository.close()
        print(json.dumps(result, indent=2, default=str))
        return
    runtime = Runtime(settings)
    try:
        if args.command == "run":
            runtime.run_forever()
        elif args.command == "discover":
            print(json.dumps(runtime.discover(), indent=2, default=str))
        else:
            print(json.dumps(runtime.run_once(), indent=2, default=str))
    finally:
        runtime.close()


if __name__ == "__main__":
    main()
