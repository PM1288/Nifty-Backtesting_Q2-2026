# Three entry-only strategies: integration and runbook

## Integrated strategy versions

| Strategy | Entry definition | Exit/evaluation |
|---|---|---|
| `EMA61_OHLC_ZONE_RECLAIM_RSI_WILLR_V1` | Ten closes below the EMA61 OHLC zone, two closes above, RSI14 below 30 and Williams %R14 below -80. | Shared target-only exit, full I030/I050/I070, S100/S200/S500, adverse ladder, and H30. |
| `ICE_SIDEWAYS_ACCUMULATION_TWO_CLOSE_V1` | -3% red high-volume shock, at least 16-session qualifying base, accumulation proxy, then two higher confirmation closes. | Same shared contract. |
| `MONTHLY_TWO_RED_ONE_GREEN_WEEKLY_GREEN_V1` | Completed M-3/M-2 red, M-1 green, then first completed green current-month week. | Same shared contract. |

No detector contains stop-loss, target, time exit, carry or forced-close logic. All entries are next-session first-minute-open fills. If minute data is unavailable, no synthetic fill is created.

## Run all three

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
export DATABASE_URL='postgresql://trader:<password>@100.86.108.108:5432/tradingdb'
platform/nifty_stratlab/.venv/bin/python platform/nifty_stratlab/tools/run_three_entry_only_replay.py \
  --strategy all --start 2016-01-01 --end 2026-08-05 --workers 4
```

Each strategy writes its own folder under `platform/nifty_stratlab/outputs/three_entry_only_v1/` containing `decisions.csv`, `trades.csv`, full reward/adverse ladder events, path checkpoints, H30 observations/checkpoints, Excel, Markdown, JSON, regime slices, and checksums.

## Smoke result

RELIANCE, 2024-01-01 through 2024-12-31: EMA61 emitted 0 signals; ICE emitted 1 signal/1 trade; monthly-weekly emitted 1 signal/1 trade. The absence of EMA61 signals is a valid result under its strict, unrelaxed rule.

## Important limitations

- Current point-in-time universe is the existing Nifty100 research universe resolved by the canonical loader, not a reconstructed historical Nifty50 membership series.
- Corporate-action adjustment remains governed by current source-basis normalization and must be certified before rankable research claims.
- ICE parameters are provisional as stated in the source package; do not tune them on the complete history.
