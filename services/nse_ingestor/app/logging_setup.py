from __future__ import annotations

import logging
import os
from pathlib import Path


def configure_logging(log_dir: Path) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if os.getenv("FILE_LOG_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}:
        log_dir.mkdir(parents=True, exist_ok=True)
        logfile = log_dir / "nse_ingestor.log"
        handlers.append(logging.FileHandler(logfile, encoding="utf-8"))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=handlers,
    )
