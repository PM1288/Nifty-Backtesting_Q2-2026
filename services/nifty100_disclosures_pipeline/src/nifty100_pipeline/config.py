from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

from .utils import ensure_dir, now_utc, parse_date_value, utc_timestamp_slug, unique_preserve_order

DEFAULT_NSE_FIN_START = date(2015, 1, 1)
DEFAULT_EVENT_START = date(2015, 1, 1)


@dataclass
class Settings:
    project_root: Path = field(default_factory=lambda: Path(__file__).resolve().parents[2])
    output_dir: Path = field(default_factory=lambda: Path("data"))
    log_level: str = "INFO"

    symbols: list[str] = field(default_factory=list)

    nse_fin_start_date: date = DEFAULT_NSE_FIN_START
    nse_fin_end_date: date = field(default_factory=lambda: now_utc().date())

    corp_actions_start_date: date = DEFAULT_EVENT_START
    corp_actions_end_date: date = field(default_factory=lambda: now_utc().date())

    event_start_date: date = DEFAULT_EVENT_START
    event_end_date: date = field(default_factory=lambda: now_utc().date())

    request_retries: int = 3
    request_sleep_seconds: float = 0.35

    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "tradingdb"
    postgres_user: str = "trader"
    postgres_password: str = "CHANGE_ME_POSTGRES_PASSWORD"
    postgres_schema: str = "market_data"
    audit_schema: str = "audit"
    truncate_tables_on_load: bool = True

    run_id: str = field(default_factory=lambda: f"nifty100_disclosures_{utc_timestamp_slug()}")

    @classmethod
    def from_env(cls, project_root: Path | None = None, env_path: Path | None = None) -> "Settings":
        project_root = project_root or Path(__file__).resolve().parents[2]
        env_path = env_path or project_root / ".env"
        load_dotenv(env_path)

        def env_str(name: str, default: str) -> str:
            return os.getenv(name, default).strip()

        def env_bool(name: str, default: bool) -> bool:
            raw = os.getenv(name)
            if raw is None:
                return default
            return raw.strip().lower() in {"1", "true", "yes", "y", "on"}

        def env_int(name: str, default: int) -> int:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            return int(raw)

        def env_float(name: str, default: float) -> float:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            return float(raw)

        def env_date(name: str, default: date) -> date:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            parsed = parse_date_value(raw)
            if parsed is None:
                raise ValueError(f"Environment variable {name}={raw!r} is not a valid date")
            return parsed

        def env_list(name: str) -> list[str]:
            raw = os.getenv(name, "").strip()
            if not raw:
                return []
            values = [item.strip().upper() for item in raw.split(",") if item.strip()]
            return unique_preserve_order(values)

        output_dir = Path(env_str("OUTPUT_DIR", "data"))
        return cls(
            project_root=project_root,
            output_dir=output_dir,
            log_level=env_str("LOG_LEVEL", "INFO"),
            symbols=env_list("SYMBOLS"),
            nse_fin_start_date=env_date("NSE_FIN_START_DATE", DEFAULT_NSE_FIN_START),
            nse_fin_end_date=env_date("NSE_FIN_END_DATE", now_utc().date()),
            corp_actions_start_date=env_date("CORP_ACTIONS_START_DATE", DEFAULT_EVENT_START),
            corp_actions_end_date=env_date("CORP_ACTIONS_END_DATE", now_utc().date()),
            event_start_date=env_date("EVENT_START_DATE", DEFAULT_EVENT_START),
            event_end_date=env_date("EVENT_END_DATE", now_utc().date()),
            request_retries=env_int("REQUEST_RETRIES", 3),
            request_sleep_seconds=env_float("REQUEST_SLEEP_SECONDS", 0.35),
            postgres_host=env_str("POSTGRES_HOST", "postgres"),
            postgres_port=env_int("POSTGRES_PORT", 5432),
            postgres_db=env_str("POSTGRES_DB", "nifty100"),
            postgres_user=env_str("POSTGRES_USER", "nifty100"),
            postgres_password=env_str("POSTGRES_PASSWORD", "nifty100"),
            postgres_schema=env_str("POSTGRES_SCHEMA", "market_data"),
            audit_schema=env_str("POSTGRES_AUDIT_SCHEMA", "audit"),
            truncate_tables_on_load=env_bool("TRUNCATE_TABLES_ON_LOAD", True),
        )

    def with_overrides(self, **kwargs: object) -> "Settings":
        data = self.__dict__.copy()
        data.update(kwargs)
        return Settings(**data)

    @property
    def absolute_output_dir(self) -> Path:
        return (self.project_root / self.output_dir).resolve()

    @property
    def run_root(self) -> Path:
        return self.absolute_output_dir / "runs" / self.run_id

    @property
    def raw_dir(self) -> Path:
        return self.run_root / "raw"

    @property
    def combined_dir(self) -> Path:
        return self.run_root / "combined"

    @property
    def audit_dir(self) -> Path:
        return self.run_root / "audit"

    @property
    def logs_dir(self) -> Path:
        return self.run_root / "logs"

    @property
    def latest_run_metadata_path(self) -> Path:
        return self.absolute_output_dir / "latest_run.json"

    @property
    def service_logs_dir(self) -> Path:
        return self.absolute_output_dir / "_service_logs"

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} port={self.postgres_port} dbname={self.postgres_db} "
            f"user={self.postgres_user} password={self.postgres_password}"
        )

    def ensure_runtime_dirs(self) -> None:
        ensure_dir(self.absolute_output_dir)
        ensure_dir(self.service_logs_dir)
        ensure_dir(self.run_root)
        ensure_dir(self.raw_dir)
        ensure_dir(self.combined_dir)
        ensure_dir(self.audit_dir)
        ensure_dir(self.logs_dir)

    def effective_symbols(self, symbols_from_universe: Iterable[str]) -> list[str]:
        all_symbols = [symbol.upper() for symbol in symbols_from_universe]
        if not self.symbols:
            return unique_preserve_order(all_symbols)
        allowed = {symbol.upper() for symbol in self.symbols}
        filtered = [symbol for symbol in all_symbols if symbol.upper() in allowed]
        return unique_preserve_order(filtered)
