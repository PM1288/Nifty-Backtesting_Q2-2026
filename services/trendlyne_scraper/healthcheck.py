#!/usr/bin/env python3
"""Container health check for the scheduler heartbeat."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from config import SETTINGS


def main() -> int:
    try:
        state = json.loads(SETTINGS.scheduler_state_path.read_text(encoding="utf-8"))
        heartbeat = datetime.fromisoformat(state["heartbeat_at"])
        if heartbeat.tzinfo is None:
            heartbeat = heartbeat.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - heartbeat.astimezone(timezone.utc)).total_seconds()
        return 0 if age <= max(180, SETTINGS.scheduler_heartbeat_seconds * 4) else 1
    except Exception:
        return 1


if __name__ == "__main__":
    sys.exit(main())
