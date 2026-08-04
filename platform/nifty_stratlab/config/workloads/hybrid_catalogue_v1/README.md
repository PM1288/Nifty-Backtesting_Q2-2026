# NIFTY Hybrid Catalogue v1 worksets

- Strategies: 96
- Historical request: 2015-02-02 through 2025-08-06
- CSV universe: 100 available symbols
- Explicit exclusion: TMPV
- Smoke symbol: RELIANCE
- Common exit: target-only, 0.3% same session then 1.0% swing from original entry
- Portfolio views: finite ₹16 lakh / eight ₹2 lakh positions, and unlimited capital

`workload_index.csv` is the operator index. Every strategy folder contains its immutable `workload.json`. `validation.json` checks catalogue integrity; `smoke_validation.json` checks all generated contracts and the RELIANCE source file.

The operator-authorized assumption engine is `hybrid_narrative_assumptions_v1`. It uses the available NIFTY 50 and India VIX files, static database sector classifications and the current 100-symbol CSV panel. These assumptions are reproducible but introduce survivorship and proxy bias.

Run the real one-symbol smoke with `scripts/strategy_catalogue.sh smoke-run RELIANCE`. The full command requires the explicit `CONFIRM_FULL_HYBRID_RUN=YES` environment gate and must not be invoked until the operator gives the go-ahead.
