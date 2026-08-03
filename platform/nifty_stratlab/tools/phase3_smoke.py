from __future__ import annotations

import json
import tempfile
from datetime import date
from pathlib import Path

from nifty_stratlab.orchestration.file_store import FileRunStore
from nifty_stratlab.orchestration.models import RunSpec
from nifty_stratlab.orchestration.planner import plan_shards


def main() -> int:
    spec = RunSpec(
        strategy_version_id="reference_v1", data_snapshot_id="snapshot1",
        feature_set_id="features", feature_version="1", fee_profile_id="fee1",
        execution_model_id="e1", universe_snapshot_id="u1",
        date_start=date(2020, 1, 1), date_end=date(2020, 2, 29),
        symbols=("RELIANCE", "HDFCBANK", "INFY"), scenario_key="finite_2l",
        simulation_config={"ticket_size": 200000}, code_hash="demo",
    )
    shards = plan_shards(spec, days_per_shard=20, symbols_per_shard=2)
    with tempfile.TemporaryDirectory() as temp:
        store = FileRunStore(temp)
        store.create_run(spec, shards)
        for shard in shards:
            claimed = store.claim_next(spec.run_id, "smoke")
            assert claimed is not None
            output = Path(temp) / f"{claimed.spec.shard_id}.json"
            output.write_text("{}", encoding="utf-8")
            store.complete_shard(spec.run_id, claimed.spec.shard_id, "smoke", output_uri=str(output), output_checksum="demo", output_row_count=0)
        store.validate_run(spec.run_id, {"checks": "passed"})
        store.publish_run(spec.run_id)
    print(json.dumps({"phase": 3, "status": "PASS", "run_id": spec.run_id, "shard_count": len(shards)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
