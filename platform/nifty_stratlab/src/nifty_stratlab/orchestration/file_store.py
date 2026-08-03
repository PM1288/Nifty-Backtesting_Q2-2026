from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from nifty_stratlab.orchestration.models import (
    RunRecord,
    RunSpec,
    RunStatus,
    ShardRecord,
    ShardSpec,
    ShardStatus,
)
from nifty_stratlab.util.io import atomic_write_text

try:  # POSIX locking is available on the intended Linux host.
    import fcntl
except ImportError:  # pragma: no cover - Windows uses the PowerShell wrapper serially.
    fcntl = None


class RunStoreError(RuntimeError):
    pass


class FileRunStore:
    """Small durable run store used by tests, local development and recovery drills.

    PostgreSQL is the production ledger. This implementation deliberately uses
    the same state transitions while remaining executable without database access.
    """

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.root / ".store.lock"
        self.lock_path.touch(exist_ok=True)

    @contextmanager
    def _locked(self) -> Iterator[None]:
        with self.lock_path.open("r+") as handle:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def _run_path(self, run_id: str) -> Path:
        return self.root / run_id / "run.json"

    def _shard_path(self, run_id: str, shard_id: str) -> Path:
        return self.root / run_id / "shards" / f"{shard_id}.json"

    @staticmethod
    def _write(path: Path, model: RunRecord | ShardRecord) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, model.model_dump_json(indent=2))

    @staticmethod
    def _read(path: Path, model_type):
        if not path.exists():
            raise RunStoreError(f"record not found: {path}")
        return model_type.model_validate_json(path.read_text(encoding="utf-8"))

    def create_run(self, spec: RunSpec, shards: list[ShardSpec]) -> RunRecord:
        with self._locked():
            path = self._run_path(spec.run_id)
            if path.exists():
                existing = self._read(path, RunRecord)
                if existing.spec != spec:
                    raise RunStoreError("run identity collision with different specification")
                return existing
            record = RunRecord(spec=spec)
            self._write(path, record)
            for shard in shards:
                self._write(self._shard_path(spec.run_id, shard.shard_id), ShardRecord(spec=shard))
            return record

    def get_run(self, run_id: str) -> RunRecord:
        return self._read(self._run_path(run_id), RunRecord)

    def list_shards(self, run_id: str) -> list[ShardRecord]:
        folder = self.root / run_id / "shards"
        if not folder.exists():
            return []
        return sorted((self._read(path, ShardRecord) for path in folder.glob("*.json")), key=lambda x: x.spec.ordinal)

    def claim_next(self, run_id: str, worker_id: str, lease_seconds: int = 120) -> ShardRecord | None:
        if lease_seconds <= 0:
            raise ValueError("lease_seconds must be positive")
        now = datetime.now(timezone.utc)
        with self._locked():
            run = self.get_run(run_id)
            if run.status in {RunStatus.FAILED, RunStatus.CANCELLED, RunStatus.PUBLISHED}:
                return None
            if run.status == RunStatus.PLANNED:
                run.status = RunStatus.RUNNING
                run.started_at = now
                self._write(self._run_path(run_id), run)
            for shard in self.list_shards(run_id):
                expired = (
                    shard.status == ShardStatus.RUNNING
                    and shard.lease_expires_at is not None
                    and shard.lease_expires_at <= now
                )
                if shard.status == ShardStatus.PLANNED or expired or shard.status == ShardStatus.FAILED:
                    shard.status = ShardStatus.RUNNING
                    shard.attempt_no += 1
                    shard.lease_owner = worker_id
                    shard.started_at = shard.started_at or now
                    shard.heartbeat_at = now
                    shard.lease_expires_at = now + timedelta(seconds=lease_seconds)
                    shard.error = None
                    self._write(self._shard_path(run_id, shard.spec.shard_id), shard)
                    return shard
        return None

    def heartbeat(
        self,
        run_id: str,
        shard_id: str,
        worker_id: str,
        *,
        cursor: dict | None = None,
        lease_seconds: int = 120,
    ) -> ShardRecord:
        now = datetime.now(timezone.utc)
        with self._locked():
            shard = self._read(self._shard_path(run_id, shard_id), ShardRecord)
            if shard.status != ShardStatus.RUNNING or shard.lease_owner != worker_id:
                raise RunStoreError("worker does not own a running lease")
            shard.heartbeat_at = now
            shard.lease_expires_at = now + timedelta(seconds=lease_seconds)
            if cursor is not None:
                shard.cursor = cursor
            self._write(self._shard_path(run_id, shard_id), shard)
            return shard

    def complete_shard(
        self,
        run_id: str,
        shard_id: str,
        worker_id: str,
        *,
        output_uri: str,
        output_checksum: str,
        output_row_count: int,
    ) -> ShardRecord:
        now = datetime.now(timezone.utc)
        with self._locked():
            shard = self._read(self._shard_path(run_id, shard_id), ShardRecord)
            if shard.status != ShardStatus.RUNNING or shard.lease_owner != worker_id:
                raise RunStoreError("worker does not own a running lease")
            shard.status = ShardStatus.COMPLETED
            shard.finished_at = now
            shard.output_uri = output_uri
            shard.output_checksum = output_checksum
            shard.output_row_count = output_row_count
            shard.lease_owner = None
            shard.lease_expires_at = None
            self._write(self._shard_path(run_id, shard_id), shard)
            return shard

    def fail_shard(self, run_id: str, shard_id: str, worker_id: str, error: str) -> ShardRecord:
        with self._locked():
            shard = self._read(self._shard_path(run_id, shard_id), ShardRecord)
            if shard.lease_owner != worker_id:
                raise RunStoreError("worker does not own shard")
            shard.status = ShardStatus.FAILED
            shard.error = error
            shard.lease_owner = None
            shard.lease_expires_at = None
            self._write(self._shard_path(run_id, shard_id), shard)
            return shard

    def validate_run(self, run_id: str, validation_summary: dict) -> RunRecord:
        with self._locked():
            run = self.get_run(run_id)
            shards = self.list_shards(run_id)
            if not shards or any(shard.status != ShardStatus.COMPLETED for shard in shards):
                raise RunStoreError("all expected shards must complete before validation")
            run.status = RunStatus.VALIDATED
            run.validation_status = "passed"
            run.summary = validation_summary
            run.finished_at = datetime.now(timezone.utc)
            self._write(self._run_path(run_id), run)
            return run

    def publish_run(self, run_id: str) -> RunRecord:
        """Publish only a validated run; failed validation can never become current."""

        with self._locked():
            run = self.get_run(run_id)
            if run.status != RunStatus.VALIDATED or run.validation_status != "passed":
                raise RunStoreError("only a successfully validated run may be published")
            run.status = RunStatus.PUBLISHED
            run.published = True
            self._write(self._run_path(run_id), run)
            return run
