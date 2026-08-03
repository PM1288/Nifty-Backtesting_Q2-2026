from datetime import date
from pathlib import Path

import pytest

from nifty_stratlab.orchestration.file_store import FileRunStore, RunStoreError
from nifty_stratlab.orchestration.models import RunSpec
from nifty_stratlab.orchestration.planner import plan_shards


def spec():
    return RunSpec(
        strategy_version_id="s_v1",
        data_snapshot_id="d1",
        feature_set_id="f",
        feature_version="1",
        fee_profile_id="fee",
        execution_model_id="e",
        universe_snapshot_id="u",
        date_start=date(2020, 1, 1),
        date_end=date(2020, 1, 30),
        symbols=("BBB", "AAA", "CCC"),
        scenario_key="base",
        simulation_config={"ticket": 200000},
        code_hash="abc",
    )


def test_planner_is_deterministic_and_normalises_symbol_order():
    one = spec()
    two = spec()
    assert one.run_id == two.run_id
    assert one.symbols == ("AAA", "BBB", "CCC")
    assert [item.shard_id for item in plan_shards(one, days_per_shard=10, symbols_per_shard=2)] == [
        item.shard_id for item in plan_shards(two, days_per_shard=10, symbols_per_shard=2)
    ]


def test_failed_shard_can_resume_and_failed_run_cannot_publish(tmp_path: Path):
    run_spec = spec()
    shards = plan_shards(run_spec, days_per_shard=30, symbols_per_shard=10)
    store = FileRunStore(tmp_path)
    store.create_run(run_spec, shards)
    claimed = store.claim_next(run_spec.run_id, "worker")
    assert claimed is not None and claimed.attempt_no == 1
    store.fail_shard(run_spec.run_id, claimed.spec.shard_id, "worker", "forced")
    reclaimed = store.claim_next(run_spec.run_id, "worker")
    assert reclaimed is not None and reclaimed.attempt_no == 2
    output = tmp_path / "out.json"
    output.write_text("{}", encoding="utf-8")
    store.complete_shard(run_spec.run_id, reclaimed.spec.shard_id, "worker", output_uri=str(output), output_checksum="abc", output_row_count=0)
    with pytest.raises(RunStoreError):
        store.publish_run(run_spec.run_id)
    store.validate_run(run_spec.run_id, {"passed": True})
    published = store.publish_run(run_spec.run_id)
    assert published.published
