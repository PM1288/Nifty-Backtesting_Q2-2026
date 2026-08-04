# Hybrid Catalogue Implementation Status

Date: 2026-08-04

## Completed

- Reviewed the supplied MD, DOCX, CSV, JSON and ZIP catalogue package.
- Validated 96 unique strategies, 14 noise guards, six native exit packages and all three wave memberships.
- Created 96 isolated, immutable worksets for the 100-symbol CSV universe covering 2015-02-02 through 2025-08-06.
- Excluded TMPV explicitly.
- Frozen the operator-approved common exit for every workset: 0.3% same-session target, then 1.0% swing target from the original entry price, target-only.
- Included finite ₹16 lakh/eight ₹2 lakh position and unlimited-capital scenarios.
- Added catalogue hashes, per-strategy hashes, CSV/JSON/HTML/PostgreSQL output requirements and resumable runtime settings.
- Passed catalogue validation, all 96 RELIANCE source/contract smoke checks, nine existing golden signal/fill fixtures, and the full Strategy Lab test suite.

## Assumption-backed execution layer

The source catalogue is descriptive, not a complete executable rule grammar. With operator authorization to make assumptions, `hybrid_narrative_assumptions_v1` converts recognized phrases into frozen objective feature rules. Stock history comes from the 100 CSV files; NIFTY 50 and India VIX history come from the Debashis index files; sectors come from `public.index_constituents`; D3 breadth is computed from the available 100-symbol panel.

The assumptions explicitly accept survivorship bias from using the available/current 100-symbol panel, static sector classification, beta=1 residual-return fallback and NIFTY as a missing sector-index proxy. Results from this layer must be labelled assumption-backed and cannot be presented as an unbiased point-in-time constituent study.

The real RELIANCE smoke for 2024-01-01 through 2024-03-31 processed 22,980 bars for all 96 strategies. All detectors and the common target simulator completed successfully; 87 strategies generated at least one signal. Reports exist under `outputs/hybrid_catalogue_v1_reliance_smoke`, one consolidated folder per strategy. Nine strategies generated no RELIANCE signal in the smoke window, which is valid and is not changed after observing the result.

The full runner is ready but retains an explicit operator go-ahead gate. No ten-year/all-symbol job has been started.

## Commands

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
./scripts/strategy_catalogue.sh validate
./scripts/strategy_catalogue.sh setup
./scripts/strategy_catalogue.sh smoke RELIANCE
./scripts/strategy_catalogue.sh smoke-run RELIANCE
./scripts/strategy_catalogue.sh status
```

After explicit approval, launch with `CONFIRM_FULL_HYBRID_RUN=YES ./scripts/strategy_catalogue.sh full`.
