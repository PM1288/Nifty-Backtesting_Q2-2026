from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from market_ingest.cli import run_bootstrap


class FakeRegistry:
    def __init__(self, marker_valid: bool) -> None:
        self.marker_valid = marker_valid

    def completion_is_valid(self, path: Path) -> bool:
        return self.marker_valid


def test_bootstrap_noops_when_completion_marker_is_valid(tmp_path: Path) -> None:
    marker = tmp_path / "bootstrap_complete.json"
    marker.write_text("{}", encoding="utf-8")
    ctx = SimpleNamespace(
        run_id="run-1",
        registry=FakeRegistry(marker_valid=True),
        settings=SimpleNamespace(paths=SimpleNamespace(completion_marker=marker), runtime=SimpleNamespace(default_lookback_years=5)),
        calendar=None,
        catalog={},
    )
    payload = run_bootstrap(ctx, datasets=None, from_date=None, to_date=None, force=False, dry_run=False)
    assert payload["status"] == "noop"
