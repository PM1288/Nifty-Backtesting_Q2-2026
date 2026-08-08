# OIIS all-signal diagnostic capture V1

## Purpose

This workflow creates an uncensored research population for learning useful
OFactor/XFactor levels and component conditions. It records an OFactor floor of
0 and an XFactor floor of 1, but it is **not** a production configuration and is
not a portfolio-return replay. Normal OIIS gates, setup states and decision
codes are retained as explanatory columns; they do not suppress path creation.

One row represents one stock and one completed daily signal date. Entry is the
next valid trading session's open. TMPV remains excluded because its demerger
breaks comparable-price assumptions.

## Contents

The single wide dataset contains daily RSI(14), Williams %R(14), EMA(61) and
close distance, Bollinger Band(20,2) levels/position, stochastic FastK/SlowK,
volume with SMA20/EMA20/EMA60, MACD(12,26,9), all nine long and short OFactor
components and weighted contributions, all nine long and short XFactor
components and weighted contributions, gates, stock/Nifty/Bank Nifty/VIX
regimes, and CRUDE_OIL/DOW_JONES/GOLD/INDIA_VIX/USD_INR context.

The path fields evaluate all levels independently. No +0.3% hit stops later
observation:

- Intraday: +0.3%, +0.5%, +0.7% and adverse -0.5/-1/-2/-5/-10/below -10%.
- D0-D5: +1%, +2%, +5% and the complete adverse ladder.
- H30: +1%, +2%, +5%, +10%, +20%, maximum high/close upside, MAE, time below
  entry and Nifty-relative return.

The outputs are a consolidated Zstandard Parquet file, one consolidated gzip
CSV, regime summary CSV and executive Excel workbook. Per-symbol Parquet files
are checkpoints, not the review interface.

## Commands

```bash
./scripts/oiis_all_signal_capture.sh init --start 2023-01-01 --end 2026-08-07
./scripts/oiis_all_signal_capture.sh run --workers 12 --start 2023-01-01 --end 2026-08-07
./scripts/oiis_all_signal_capture.sh status
./scripts/oiis_all_signal_capture.sh consolidate
./scripts/oiis_all_signal_capture.sh load-db
```

For a smoke test, add `--symbol RELIANCE` to `run`. Re-running `run` resumes
from existing fragments. PostgreSQL storage is additive and monthly partitioned:

```text
oiis_research.all_signal_run
oiis_research.all_signal_observation
oiis_research.all_signal_observation_YYYYMM
oiis_research.all_signal_latest
```

The monthly suffix uses `YYYYMM`, not a literal hyphen, so unquoted PostgreSQL
queries remain simple. Source market tables are read only.
