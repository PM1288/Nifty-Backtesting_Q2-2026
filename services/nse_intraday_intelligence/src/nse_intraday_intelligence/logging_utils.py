from __future__ import annotations

import logging
import os


def configure_logging(level: str | None = None) -> None:
    logging.basicConfig(
        level=(level or os.getenv("LOG_LEVEL", "INFO")).upper(),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
