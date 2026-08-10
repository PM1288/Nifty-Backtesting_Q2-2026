# F&O daily technical five-year export

## Outcome

The reusable exporter is:

`platform/nifty_stratlab/tools/export_fno_daily_technical_dataset.py`

The completed 2021-08-10 through 2026-08-10 dataset is outside Git at:

`/home/novius2/data/fno_daily_technical_5y_20210810_20260810`

It contains 242 files and approximately 703 MB:

- 219 current F&O-equity CSV files;
- 12 market-context CSV files: NIFTY 50, India VIX, NIFTY Bank, IT, Auto,
  FMCG, Metal, Pharma, Realty, Energy, Media and PSU Bank;
- `ALL_FNO_AND_MARKET_DAILY_TECHNICAL.csv` with every instrument in one table;
- `ADVANCES_DECLINES_DAILY.csv` for the current F&O universe, current NIFTY 50
  constituents and each available sector;
- `FNO_DAILY_TECHNICAL_5Y.xlsx` with README, universe, coverage, breadth and
  consolidated daily-data sheets;
- universe, coverage, warning, failure, manifest, run-log and SHA-256 files.

## Data and calculation policy

- The current F&O universe is derived from `public.instruments` using real
  `NFO` `FUTSTK`/`OPTSTK` contracts. Instrument-master test names are excluded.
- NSE equity OHLCV, turnover, trade-count and delivery fields come from
  `nse.fact_eod_prices`.
- Sector classifications come from the current official NIFTY 500 constituent
  file with `nse_intraday.universe_membership` as fallback.
- yfinance supplies NIFTY 50, India VIX and available sector indices.
- When a renamed current symbol has local data only after its rename, the
  current Yahoo ticker supplies the earlier part and every such row is labelled
  `CURRENT_YAHOO_TICKER_PRE_LOCAL_HISTORY`.
- TMPV pre-demerger history is deliberately not joined. LTIM has one recorded
  warning because Yahoo no longer returns `LTIM.NS`; its valid local history is
  retained.
- Breadth uses the current F&O and NIFTY 50 memberships retrospectively. It is
  suitable for current-universe research but is not survivorship-free.
- Daily bars cannot calculate true intraday session VWAP. The dataset therefore
  exposes `rolling_vwap_20_proxy` and `anchored_vwap_ytd_proxy` by explicit name.

## Technical columns

The 81-column consolidated dataset includes identity/provenance, OHLCV,
turnover, trades, delivery, one/five/20-session returns, SMA 20/50/100/200,
EMA 9/20/50/61/200, RSI(14), Williams %R(14), MACD(12,26,9), Bollinger
(20,2), ATR/ADX and directional indicators(14), stochastic(14,3), ROC(12),
CCI(20), MFI(14), OBV, volume SMA/EMA 20/60, both daily VWAP proxies, plus F&O,
NIFTY 50 and sector advance/decline fields.

## Verified result

- Consolidated rows: `270,353`
- Consolidated columns: `81`
- Equity symbols: `219/219`
- Market series: `12/12`
- Date range: `2021-08-10` through latest available trading date `2026-08-07`
- Breadth rows: `24,282`
- Pre-local history fills: `20`
- Blocking failures: `0`
- Warnings: `1` (`LTIM.NS` unavailable from Yahoo)
- Duplicate instrument/date rows: `0`
- Unclassified sectors: `0`
- Excel archive test: PASS
- Excel/consolidated row reconciliation: PASS (`270,353`)
- Breadth conservation (`advance + decline + unchanged = total`): PASS
- SHA-256 verification: PASS for every file

## Tests and rerun

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026

/home/novius2/trading-stack/platform/nifty_stratlab/.venv/bin/python \
  -m pytest -q \
  platform/nifty_stratlab/tests/test_export_fno_daily_technical_dataset.py

export DATABASE_URL='postgresql://<user>:<password>@<host>:5432/<database>'
/home/novius2/trading-stack/platform/nifty_stratlab/.venv/bin/python \
  platform/nifty_stratlab/tools/export_fno_daily_technical_dataset.py \
  --start 2021-08-10 \
  --end 2026-08-10 \
  --output-dir /home/novius2/data/fno_daily_technical_5y_20210810_20260810
```

Do not place the database password in Git, logs, shell history or this document.
