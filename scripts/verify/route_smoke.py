from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from urllib import error as urlerror

from common import DEFAULT_BASE_URL, request_url


@dataclass
class SmokeCheck:
    name: str
    path: str
    expected_kind: str


@dataclass
class SmokeResult:
    name: str
    path: str
    url: str
    ok: bool
    status: int | None
    content_type: str | None
    detail: str


CORE_CHECKS = [
    SmokeCheck("home", "/n50/", "html"),
    SmokeCheck("analytics", "/n50/analytics", "html"),
    SmokeCheck("market-story", "/n50/analytics/regime", "html"),
    SmokeCheck("supporting-metrics", "/n50/analytics/supporting-metrics", "html"),
    SmokeCheck("options", "/n50/options", "html"),
    SmokeCheck("heatmap-change", "/n50/heatmap/change", "html"),
    SmokeCheck("heatmap-rsi", "/n50/heatmap/rsi", "html"),
    SmokeCheck("heatmap-will", "/n50/heatmap/will", "html"),
    SmokeCheck("backtesting", "/n50/backtesting", "html"),
    SmokeCheck("backtesting-strategies", "/n50/backtesting/strategies", "html"),
    SmokeCheck("feedback", "/n50/feedback", "html"),
    SmokeCheck("dashboard-health", "/n50/health", "json"),
    SmokeCheck("dashboard-ready", "/n50/ready", "json"),
    SmokeCheck("option-chain-healthz", "/option-chain/healthz", "json"),
    SmokeCheck("option-chain-readyz", "/option-chain/readyz", "json"),
]

FULL_CHECKS = [
    *CORE_CHECKS,
    SmokeCheck("collector-healthz", "/backend/healthz", "json"),
]


def check_kind(expected_kind: str, content_type: str, body: bytes) -> tuple[bool, str]:
    body_prefix = body[:160].decode("utf-8", errors="ignore").lower()
    if expected_kind == "html":
        if "text/html" in content_type.lower() or "<!doctype html" in body_prefix or "<html" in body_prefix:
            return True, "html response detected"
        return False, "expected html response"

    try:
        json.loads(body.decode("utf-8"))
    except Exception:
        return False, "expected json response"
    return True, "json response detected"


def run_smoke(base_url: str, timeout: float = 10.0, surface: str = "full") -> list[SmokeResult]:
    checks = FULL_CHECKS if surface == "full" else CORE_CHECKS
    results: list[SmokeResult] = []
    for check in checks:
        url = f"{base_url.rstrip('/')}{check.path}"
        try:
            status, content_type, body = request_url(url, timeout=timeout)
            kind_ok, detail = check_kind(check.expected_kind, content_type, body)
            ok = status == 200 and kind_ok
            results.append(
                SmokeResult(
                    name=check.name,
                    path=check.path,
                    url=url,
                    ok=ok,
                    status=status,
                    content_type=content_type,
                    detail=detail if ok else f"status={status}; {detail}",
                )
            )
        except urlerror.HTTPError as exc:
            results.append(
                SmokeResult(
                    name=check.name,
                    path=check.path,
                    url=url,
                    ok=False,
                    status=exc.code,
                    content_type=exc.headers.get("Content-Type") if exc.headers else None,
                    detail=f"http error {exc.code}",
                )
            )
        except Exception as exc:
            results.append(
                SmokeResult(
                    name=check.name,
                    path=check.path,
                    url=url,
                    ok=False,
                    status=None,
                    content_type=None,
                    detail=str(exc),
                )
            )
    return results


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Smoke-test critical N50 routes and health endpoints.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL for the edge gateway.")
    parser.add_argument("--timeout", type=float, default=10.0, help="Per-request timeout in seconds.")
    parser.add_argument(
        "--surface",
        choices=("core", "full"),
        default="full",
        help="Route surface to test. 'core' excludes legacy-only endpoints.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    args = parser.parse_args()

    results = run_smoke(args.base_url, timeout=args.timeout, surface=args.surface)
    failures = [result for result in results if not result.ok]

    if args.json:
        print(json.dumps([asdict(result) for result in results], indent=2))
    else:
        for result in results:
            state = "PASS" if result.ok else "FAIL"
            print(f"{state:4} {result.name:24} {result.path:36} {result.detail}")
        print()
        print(f"summary: {len(results) - len(failures)} passed / {len(results)} total")

    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
