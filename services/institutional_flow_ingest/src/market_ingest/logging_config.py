from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path


class JsonFormatter(logging.Formatter):
    """Simple JSON formatter for operational logs."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in (
            "run_id",
            "dataset_name",
            "market_date",
            "step",
            "source_url",
            "status",
            "duration_ms",
            "rows",
            "file_path",
            "checksum",
            "error_class",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(logs_root: Path, level: str = "INFO") -> None:
    logs_root.mkdir(parents=True, exist_ok=True)
    formatter = JsonFormatter()
    root = logging.getLogger()
    root.setLevel(level.upper())
    root.handlers.clear()

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)

    app_file = logging.FileHandler(logs_root / "app.log", encoding="utf-8")
    app_file.setFormatter(formatter)
    root.addHandler(app_file)

    err_file = logging.FileHandler(logs_root / "error.log", encoding="utf-8")
    err_file.setLevel(logging.ERROR)
    err_file.setFormatter(formatter)
    root.addHandler(err_file)
