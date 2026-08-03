from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WalkForwardSplit:
    split_no: int
    train_start: int
    train_end: int
    test_start: int
    test_end: int


def expanding_walk_forward_splits(
    sample_count: int,
    *,
    minimum_train: int,
    test_size: int,
    step_size: int | None = None,
    purge: int = 0,
    embargo: int = 0,
) -> list[WalkForwardSplit]:
    """Create chronological, leakage-controlled expanding splits.

    Indices are half-open. `purge` removes observations immediately before the
    test window from training; `embargo` leaves a gap after each test window.
    """

    if sample_count <= 0 or minimum_train <= 0 or test_size <= 0:
        raise ValueError("sample_count, minimum_train and test_size must be positive")
    if purge < 0 or embargo < 0:
        raise ValueError("purge and embargo cannot be negative")
    step = step_size or test_size
    if step <= 0:
        raise ValueError("step_size must be positive")

    splits: list[WalkForwardSplit] = []
    test_start = minimum_train + purge
    split_no = 0
    while test_start + test_size <= sample_count:
        train_end = test_start - purge
        if train_end <= 0:
            break
        splits.append(
            WalkForwardSplit(
                split_no=split_no,
                train_start=0,
                train_end=train_end,
                test_start=test_start,
                test_end=test_start + test_size,
            )
        )
        split_no += 1
        test_start += step + embargo
    if not splits:
        raise ValueError("scope is too small for the requested walk-forward configuration")
    return splits
