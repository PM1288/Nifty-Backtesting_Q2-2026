# NIFTY 500 stock daily regimes

The script `tools/ingest_nifty500_yfinance_regime.py` downloads the current NSE NIFTY 500 constituent list, maps each NSE symbol to Yahoo Finance `<SYMBOL>.NS`, calculates daily indicators and upserts the result.

## PostgreSQL reference

Use `strategy_eval.stock_daily_regime`. Its composite key is `(stock_name, trade_date)`, so the same date is retained independently for every stock. Filter `primary_trend` for `UP_TREND`, `DOWN_TREND`, or `SIDEWAYS`, and `market_zone` for `RISING`, `FALLING`, `VOLATILE`, or `SIDEWAYS`.

```sql
SELECT stock_name, trade_date, primary_trend, market_zone, close_price, rsi14
FROM strategy_eval.stock_daily_regime
WHERE stock_name = 'Reliance Industries Ltd.'
ORDER BY trade_date;
```

The run also creates `stock_daily_regime.csv`, a multi-sheet Excel workbook (split below Excel's row limit), and `failures.csv` in `platform/nifty_stratlab/outputs/nifty500_yfinance_regime/`. Use `--csv-input` to load a completed CSV into PostgreSQL without downloading again.
