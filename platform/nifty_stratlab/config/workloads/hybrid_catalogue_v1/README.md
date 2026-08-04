# NIFTY Hybrid Catalogue v1 worksets

- Strategies: 96
- Historical request: 2015-02-02 through 2025-08-06
- CSV universe: 100 available symbols
- Explicit exclusion: TMPV
- Smoke symbol: RELIANCE
- Common exit: target-only, 0.3% same session then 1.0% swing from original entry
- Portfolio views: finite ₹16 lakh / eight ₹2 lakh positions, and unlimited capital

`workload_index.csv` is the operator index. Every strategy folder contains its immutable `workload.json`. `validation.json` checks catalogue integrity; `smoke_validation.json` checks all generated contracts and the RELIANCE source file.

Important: setup validation is not a completed strategy backtest. Only strategies with a fully implemented point-in-time detector and qualified dependencies may be launched. D2 and D3 strategies require aligned market/sector/VIX or cross-sectional inputs and must fail closed when those inputs are unavailable.
