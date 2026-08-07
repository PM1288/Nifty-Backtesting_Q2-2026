# OIIS O/X threshold sweep

The sweep tests nine independent combinations: Low, Medium, and High O-Factor minimums crossed with Low, Medium, and High X-Factor entry tiers.

| Level | O-Factor minimum | X-Factor Tier B | X-Factor Tier A | Interpretation |
|---|---:|---:|---:|---|
| Low | 60 | 65 | 70 | exploratory/high trade count |
| Medium | 74 | 76 | 84 | current baseline |
| High | 82 | 84 | 90 | selective/high quality |

These are historical score-band thresholds, not invented indicators: the baseline accepted O-Factor scores cluster around 74--80, while rejected opportunities are materially lower; accepted X-Factor Tier B/A scores cluster around 76--82 and 84--88. The sweep compares trade count, after-tax P&L, median return, win rate, H30 opportunity, and drawdown evidence. It does not change the common exit policy.

Run all nine workers:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
export DATABASE_URL='postgresql://trader:<password>@<host>:5432/tradingdb'
./scripts/run_oiis_threshold_sweep.py --workers 3 --workers-per-run 4
```

Each combination has its own output directory and log under `platform/nifty_stratlab/outputs/oiis_threshold_sweep_2026-08-07/`. The aggregate `sweep_summary.json` is the comparison input. Month charts use `YYYY-MM` periods, so January 2018 and January 2019 are no longer combined into one seasonal bucket.
