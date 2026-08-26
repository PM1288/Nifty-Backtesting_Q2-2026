# OISS CSV Export Manifest

Generated 26 August 2026 from canonical PostgreSQL schema `oiss`. Row counts exclude the header. Every CSV was parsed using Python's standards-compliant CSV reader; all rows matched the declared header width.

| File | Bytes | Data rows | Columns | Malformed rows | SHA-256 |
|---|---:|---:|---:|---:|---|
| `OISS_BACKTEST_DECISIONS_2026-08-11_TO_2026-08-25.csv` | 316,612,382 | 27,456 | 43 | 0 | `42d820c0efdaf4a7dac0287ddc500851e8c0b961cc6c226d77ca6ffb0e39adc3` |
| `OISS_BACKTEST_OUTCOMES_2026-08-11_TO_2026-08-25.csv` | 12,664,029 | 27,456 | 21 | 0 | `e8f127e4ab3c4e001bea6c7976122c504859bd466786b2de222dd0405971f4be` |
| `OISS_BACKTEST_SUMMARY_BY_STATUS_2026-08-25.csv` | 740 | 13 | 7 | 0 | `1b3b104fc277b1074bc9735a275f4931da84d5c99e2a76a66ca4655dfbcbc153` |
| `OISS_CURRENT_RUN_2026-08-25.csv` | 2,714 | 1 | 27 | 0 | `3d40088fe2c1d68d18f4b94f09f65717e979ed874424e32a69ce7d743d8a212f` |
| `OISS_CURRENT_SCAN_CHANGES_2026-08-25.csv` | 65,637 | 208 | 15 | 0 | `93df7d7dd244b4ad7e9f03cb1daaea0c9a2b480f988ad286a5cc70f44ca5a177` |
| `OISS_CURRENT_SECTOR_ROTATION_2026-08-25.csv` | 2,558 | 18 | 14 | 0 | `f4619a4f4d69f2ba9d9cf4c2554401fbd2247d0582b7028556eae255934f4c1d` |
| `OISS_CURRENT_STOCK_RADAR_2026-08-25.csv` | 2,565,405 | 208 | 45 | 0 | `8b18ab3eeb30f335737f122bd6234cebd3e547f9ecbe816d460887014e7593e0` |
| `OISS_HISTORICAL_RUNS_2026-08-11_TO_2026-08-25.csv` | 284,461 | 132 | 25 | 0 | `7a10b36ffd16b1de1cfabdccbd35374f2bf8254f702768339a2c02e5cc25d3d7` |

## Reconciliation

- Historical runs: 132 export rows = 132 completed database runs.
- Decision observations: 27,456 export rows = 132 scans × 208 stocks.
- Outcome observations: 27,456 export rows = one outcome record per decision record.
- Current radar: 208 rows = current OISS universe for the latest completed run.
- Current scan changes: 208 rows = one comparison record per latest-run stock.
- No duplicate run/symbol records were detected by the OISS validation command.
- No decision source timestamp occurred after its scan timestamp.

The CSV files are runtime evidence and are intentionally excluded from Git. They are included in the handoff ZIP beside this manifest.
