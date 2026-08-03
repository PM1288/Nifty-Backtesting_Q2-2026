from __future__ import annotations

import logging
from pathlib import Path


def configure_logging(log_level: str, log_file: Path | None = None) -> logging.Logger:
    logger = logging.getLogger("nifty100_pipeline")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    has_console = any(
        isinstance(handler, logging.StreamHandler) and not isinstance(handler, logging.FileHandler)
        for handler in logger.handlers
    )
    if not has_console:
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    if log_file is not None:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file_path = str(log_file.resolve())
        has_file = any(
            isinstance(handler, logging.FileHandler) and getattr(handler, "baseFilename", None) == log_file_path
            for handler in logger.handlers
        )
        if not has_file:
            file_handler = logging.FileHandler(log_file, encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)

    logger.propagate = False
    return logger
