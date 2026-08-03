from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict, dataclass
from urllib import error as urlerror

from common import DEFAULT_BASE_URL, request_url


@dataclass
class ProbeResult:
    label: str
    url: str
    ok: bool
    status: int | None
    content_type: str | None
    elapsed_ms: int
    detail: str


def probe(url: str, timeout: float, label: str) -> ProbeResult:
    started = time.perf_counter()
    try:
        status, content_type, body = request_url(url, timeout=timeout)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ProbeResult(
            label=label,
            url=url,
            ok=status == 200,
            status=status,
            content_type=content_type,
            elapsed_ms=elapsed_ms,
            detail=f"{len(body)} bytes",
        )
    except urlerror.HTTPError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ProbeResult(
            label=label,
            url=url,
            ok=False,
            status=exc.code,
            content_type=exc.headers.get("Content-Type") if exc.headers else None,
            elapsed_ms=elapsed_ms,
            detail=f"http error {exc.code}",
        )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ProbeResult(
            label=label,
            url=url,
            ok=False,
            status=None,
            content_type=None,
            elapsed_ms=elapsed_ms,
            detail=str(exc),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure first-hit and steady-state behavior for an edge route.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--path", default="/n50/")
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--pause-seconds", type=float, default=1.0)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    url = f"{args.base_url.rstrip('/')}{args.path}"
    results = [
        probe(url, args.timeout, "first_hit"),
    ]
    time.sleep(args.pause_seconds)
    results.append(probe(url, args.timeout, "steady_state"))

    if args.as_json:
        print(json.dumps([asdict(result) for result in results], indent=2))
    else:
        for result in results:
            state = "PASS" if result.ok else "FAIL"
            print(
                f"{state:4} {result.label:12} {result.url} "
                f"status={result.status} elapsed_ms={result.elapsed_ms} detail={result.detail}"
            )

    return 0 if all(result.ok for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
