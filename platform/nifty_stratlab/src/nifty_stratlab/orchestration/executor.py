from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from nifty_stratlab.orchestration.file_store import FileRunStore
from nifty_stratlab.orchestration.models import ShardRecord
from nifty_stratlab.util.hashing import sha256_file


@dataclass(frozen=True)
class ShardOutput:
    path: Path
    row_count: int


ShardHandler = Callable[[ShardRecord, Callable[[dict], None]], ShardOutput]


class ResumableExecutor:
    """Serial reference executor; multiple processes may share the durable store."""

    def __init__(self, store: FileRunStore, worker_id: str, lease_seconds: int = 120) -> None:
        self.store = store
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds

    def run_until_empty(self, run_id: str, handler: ShardHandler) -> int:
        completed = 0
        while True:
            shard = self.store.claim_next(run_id, self.worker_id, self.lease_seconds)
            if shard is None:
                break

            def checkpoint(cursor: dict) -> None:
                self.store.heartbeat(
                    run_id,
                    shard.spec.shard_id,
                    self.worker_id,
                    cursor=cursor,
                    lease_seconds=self.lease_seconds,
                )

            try:
                output = handler(shard, checkpoint)
                checksum = sha256_file(output.path)
                self.store.complete_shard(
                    run_id,
                    shard.spec.shard_id,
                    self.worker_id,
                    output_uri=str(output.path),
                    output_checksum=checksum,
                    output_row_count=output.row_count,
                )
                completed += 1
            except Exception as exc:
                self.store.fail_shard(run_id, shard.spec.shard_id, self.worker_id, f"{type(exc).__name__}: {exc}")
                raise
        return completed
