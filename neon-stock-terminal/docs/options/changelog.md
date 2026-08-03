# Option Chain Changelog

## 2026-03-12

- Reworked the Option Chain route to use a single analytics payload instead of scattered ladder-only reads.
- Added local tabs for `Snapshot`, `Equilibrium`, `ATM Combo`, and `Diagnostics`.
- Added ATM ± 3 listed-strike window logic based on actual stored strikes.
- Made lower-strike tie-break explicit when spot is exactly between two listed strikes.
- Added normalized CE/PE equilibrium basket chart using watcher snapshot tables as source of truth.
- Added dynamic ATM `CE + PE` combo chart and delta-from-open histogram.
- Added expiry context summary and diagnostics counters.
- Documented the current watcher-backed source of truth and the mismatch with stale legacy equilibrium service tables.
