Title
Export RELIANCE CSV Bundle

Objective
Export all readily available RELIANCE datasets to CSV, including 1-minute bars with computed RSI-14 and WILLR-14, plus existing quote, performance snapshot, and live stream tables.

Repo facts verified
- RELIANCE NSE equity token resolves to `2885` with tradingsymbol `RELIANCE-EQ`.
- Minute OHLCV data exists in `public.bars_1m`.
- Quote snapshots exist in `public.quote_snapshots`.
- Symbol performance snapshots exist in `public.symbol_perf_snapshot`.
- `RSI` and `WILLR` are not stored as a clean RELIANCE minute history table, so they were computed from `bars_1m` during export.

Files inspected
- `internal/store/migrations.go`
- `public.instruments`
- `public.bars_1m`
- `public.quote_snapshots`
- `public.symbol_perf_snapshot`
- `public.a02_backtest_live_stream`

Plan
1. Resolve the RELIANCE NSE equity token.
2. Identify which persisted datasets exist.
3. Export raw data to CSV.
4. Compute RSI-14 and WILLR-14 on top of the 1-minute bars.
5. Save a bundle manifest with row counts.

Changes made
- Added `scripts/export_symbol_csv_bundle.py`.
- Exported the RELIANCE CSV bundle to `output/exports/reliance-2026-04-01/`.

Validation run
- Confirmed RELIANCE token resolution to `NSE / 2885 / RELIANCE-EQ`.
- Confirmed latest timestamps in bars, quotes, and performance snapshots.
- Export script completed successfully.
- Bundle row counts:
  - `RELIANCE_1m_with_rsi_willr.csv`: 19047
  - `RELIANCE_quote_snapshots.csv`: 121
  - `RELIANCE_symbol_perf_snapshot.csv`: 63214
  - `RELIANCE_a02_backtest_live_stream.csv`: 8

Screens reviewed
- Not applicable.

Decisions made
- Compute RSI-14 and WILLR-14 from `bars_1m` instead of inventing a join to unrelated alert tables.
- Keep each persisted source in its own CSV rather than flattening incompatible timestamp grains into one misleading file.

Risks / follow-ups
- The exported minute series contains gaps where the source data itself has gaps.
- If needed later, the exporter can be extended to additional symbols or zipped bundles.

Resume here next time
- Generalize the export script for multi-symbol batches or add ZIP packaging if repeated downloads are needed.
