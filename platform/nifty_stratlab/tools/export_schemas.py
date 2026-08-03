from __future__ import annotations

import json
from pathlib import Path

from nifty_stratlab.contracts import MarketBar, SignalIntent
from nifty_stratlab.orchestration.models import RunSpec
from nifty_stratlab.reporting.analyst_response import AnalystResponse


def main() -> int:
    root = Path(__file__).resolve().parents[1] / "contracts" / "schemas"
    root.mkdir(parents=True, exist_ok=True)
    models = {
        "market-bar.schema.json": MarketBar,
        "signal-intent.schema.json": SignalIntent,
        "run-spec.schema.json": RunSpec,
        "analyst-response.schema.json": AnalystResponse,
    }
    for name, model in models.items():
        (root / name).write_text(json.dumps(model.model_json_schema(), indent=2, sort_keys=True), encoding="utf-8")
    print(f"wrote {len(models)} schemas to {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
