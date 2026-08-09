from __future__ import annotations

import json
import platform
import resource
import time
from decimal import Decimal

from papertrade.domain import evaluate_target_ladder


def main() -> None:
    symbols, bars_per_symbol, active_tracks = 500, 375, 5000
    targets = [Decimal("0.003"), Decimal("0.005"), Decimal("0.010")]
    started = time.perf_counter()
    hits = 0
    for symbol_index in range(symbols):
        entry = Decimal("100") + Decimal(symbol_index % 50)
        for bar_index in range(bars_per_symbol):
            movement = Decimal(bar_index % 15) / Decimal("1000")
            high = entry * (Decimal("1") + movement)
            low = entry * (Decimal("1") - movement / Decimal("2"))
            hits += len(evaluate_target_ladder("BUY", entry, high, low, targets))
    elapsed = time.perf_counter() - started
    result = {
        "hardware": platform.platform(),
        "python": platform.python_version(),
        "symbols": symbols,
        "bars": symbols * bars_per_symbol,
        "simulated_active_tracks": active_tracks,
        "target_evaluations": symbols * bars_per_symbol * len(targets),
        "target_hits": hits,
        "elapsed_seconds": round(elapsed, 4),
        "bars_per_second": round(symbols * bars_per_symbol / elapsed, 2),
        "target_evaluations_per_second": round(symbols * bars_per_symbol * len(targets) / elapsed, 2),
        "max_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "scope": "CPU calculation benchmark; PostgreSQL and webhook soak require production-like staging",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
