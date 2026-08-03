from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path


class JsonFileFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for attr in ("job_run_id", "step_name", "status"):
            if hasattr(record, attr):
                payload[attr] = getattr(record, attr)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(log_dir: Path, log_level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    root.handlers.clear()

    console = logging.StreamHandler()
    console.setLevel(root.level)
    console.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s"))

    root.addHandler(console)
    if os.getenv("FILE_LOG_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_dir / "analytics.jsonl", encoding="utf-8")
        file_handler.setLevel(root.level)
        file_handler.setFormatter(JsonFileFormatter())
        root.addHandler(file_handler)
