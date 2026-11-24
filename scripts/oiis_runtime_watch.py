"""Independent host checks for the OIIS paper worker and its serving dependencies."""
import http.client
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

SERVICES = ("oiis-live", "paper-api", "n50-dashboard", "postgres")


def failures():
    failed = []
    for service in SERVICES:
        try:
            result = subprocess.run(
                ["docker", "inspect", "--format",
                 "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
                 f"trading-stack-novius2-{service}-1"],
                capture_output=True, text=True, timeout=4,
            )
            status = result.stdout.strip() if result.returncode == 0 else "unavailable"
        except (OSError, subprocess.TimeoutExpired):
            status = "inspect failed"
        if status != "healthy":
            failed.append(f"{service} ({status})")
    return failed


def notify(message):
    url = urlsplit((Path(os.environ["CREDENTIALS_DIRECTORY"]) / "webhook").read_text().strip())
    if url.scheme != "https" or not url.hostname or url.username or url.password:
        raise ValueError("invalid HTTPS notification destination")
    conn = http.client.HTTPSConnection(url.hostname, url.port, timeout=8)
    try:
        target = url.path or "/"
        if url.query:
            target += "?" + url.query
        conn.request("POST", target, json.dumps({"text": message}), {"Content-Type": "application/json"})
        status = conn.getresponse().status
        if not 200 <= status < 300:
            raise RuntimeError(f"notification returned HTTP {status}")
    finally:
        conn.close()


def check(state_file, failed, send):
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    count = state.get("failures", 0) + 1 if failed else 0
    alerted = state.get("alerted", False)
    if failed and count >= 2 and not alerted:
        send("OIIS paper runtime unhealthy on consecutive checks: " + ", ".join(failed))
        alerted = True
    elif not failed and alerted:
        send("OIIS paper runtime recovered. Worker, paper API, dashboard and database are healthy.")
        alerted = False
    if not state or state.get("services") != failed or state.get("alerted") != alerted:
        print("OIIS runtime:", ", ".join(failed) if failed else "healthy", flush=True)
    next_state = {"failures": min(count, 2), "alerted": alerted, "services": failed}
    if next_state != state:
        tmp = state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(next_state))
        tmp.replace(state_file)


if __name__ == "__main__":
    check(Path(os.environ["STATE_DIRECTORY"]) / "status.json", failures(), notify)
