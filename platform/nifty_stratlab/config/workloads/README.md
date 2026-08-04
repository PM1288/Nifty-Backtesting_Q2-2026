# Backtest workloads

Each subdirectory is a governed, reproducible workload set. `hybrid_catalogue_v1` contains one directory per catalogue strategy plus a consolidated index and validation evidence.

All hybrid worksets currently use the operator-approved common exit: a 0.3% target during the entry session; if not filled that session, the position becomes a swing trade with a 1.0% target measured from the original buy price. No indicator exit or stop-loss is implied.
