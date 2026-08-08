# NIFTY 50 daily regime ingestion

`tools/ingest_nifty50_yfinance_regime.py` downloads Yahoo Finance ticker `^NSEI` with `yfinance`, calculates daily returns, SMA/EMA, ATR, RSI and annualised 20-day volatility, then upserts the result.

## PostgreSQL table

Use `strategy_eval.nifty50_daily_regime` (one row per trading date). Downstream queries can filter `primary_trend` (`UP_TREND`, `DOWN_TREND`, `SIDEWAYS`) or `market_zone` (`RISING`, `FALLING`, `VOLATILE`, `SIDEWAYS`). The source ticker and fetch timestamp are retained.

## Run

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB'
platform/nifty_stratlab/.venv/bin/python platform/nifty_stratlab/tools/ingest_nifty50_yfinance_regime.py --start 2000-01-01
```

Outputs are `platform/nifty_stratlab/outputs/nifty50_yfinance_regime/nifty50_daily_regime.xlsx` and `.csv`. The script is idempotent and does not delete existing rows.
