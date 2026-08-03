# RSI15 / Daily40 Evidence Index

| Criterion | Evidence |
|---|---|
| Supplied package integrity | ZIP `unzip -t`; internal `sha256sum -c MANIFEST.sha256` passed |
| Exact SMA-seeded Wilder RSI | `tests/phase2/test_features.py`; 65.0 seed-vector assertion |
| D-1 daily gate/no look-ahead | standalone golden 10/10; `test_daily_rsi_uses_only_prior_completed_session` |
| Strict entry/exit thresholds | golden fixture; per-run `validation.json` |
| Next-bar execution | golden expected timestamps; per-run `validation.json` |
| Costs and 2.5 bps slippage | flattened `trades.csv`, `summary.json` |
| One trade per symbol/day | per-run `validation.json` |
| No overnight position | `no_open_positions` in `validation.json` |
| Forced-exit boundary | `forced_exit_latest_fill` in `validation.json` |
| Report and charts | `report.html`, `equity_curve.svg`, `drawdown.svg`, `trade_pnl.svg` |
| Artifact integrity | `checksums.sha256`, `MANIFEST.json`, `RUN_COMPLETE` |
| Small real-data proof | RELIANCE 2025-07-01 through 2025-07-07 artifact directory |
| Regression safety | 29 tests passed |
| No live orders/DB writes | wrapper help, source boundary, `order_authority=false` |

Detailed paths, commands, outcomes, and limitations are in
`RSI15_DAILY40_IMPLEMENTATION_COMPLETION.md` and `AGENT_HANDOFF.md`.
