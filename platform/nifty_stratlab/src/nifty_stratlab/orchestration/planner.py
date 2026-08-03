from __future__ import annotations

from datetime import date, timedelta

from nifty_stratlab.orchestration.models import RunSpec, ShardSpec
from nifty_stratlab.util.hashing import stable_id


def _date_blocks(start: date, end: date, days_per_shard: int) -> list[tuple[date, date]]:
    if days_per_shard <= 0:
        raise ValueError("days_per_shard must be positive")
    blocks: list[tuple[date, date]] = []
    current = start
    while current <= end:
        block_end = min(end, current + timedelta(days=days_per_shard - 1))
        blocks.append((current, block_end))
        current = block_end + timedelta(days=1)
    return blocks


def _symbol_buckets(symbols: tuple[str, ...], symbols_per_shard: int) -> list[tuple[str, ...]]:
    if symbols_per_shard <= 0:
        raise ValueError("symbols_per_shard must be positive")
    ordered = tuple(sorted(symbols))
    return [ordered[index:index + symbols_per_shard] for index in range(0, len(ordered), symbols_per_shard)]


def plan_shards(
    spec: RunSpec,
    *,
    days_per_shard: int = 20,
    symbols_per_shard: int = 10,
) -> list[ShardSpec]:
    """Create deterministic date x symbol shards for restartable backtests."""

    shards: list[ShardSpec] = []
    ordinal = 0
    for start, end in _date_blocks(spec.date_start, spec.date_end, days_per_shard):
        for symbols in _symbol_buckets(spec.symbols, symbols_per_shard):
            input_hash = stable_id(
                "input",
                {
                    "run_id": spec.run_id,
                    "date_start": start,
                    "date_end": end,
                    "symbols": symbols,
                    "data_snapshot_id": spec.data_snapshot_id,
                },
                length=40,
            )
            shards.append(
                ShardSpec(
                    run_id=spec.run_id,
                    ordinal=ordinal,
                    date_start=start,
                    date_end=end,
                    symbols=symbols,
                    input_hash=input_hash,
                )
            )
            ordinal += 1
    return shards
