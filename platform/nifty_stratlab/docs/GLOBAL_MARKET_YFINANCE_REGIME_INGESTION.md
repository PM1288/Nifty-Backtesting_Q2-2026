# Global market daily regimes

`tools/ingest_global_yfinance_regime.py` downloads and classifies five daily market series:

| Instrument | Yahoo ticker |
|---|---|
| CRUDE_OIL | `CL=F` |
| GOLD | `GC=F` |
| USD_INR | `USDINR=X` |
| DOW_JONES | `^DJI` |
| INDIA_VIX | `^INDIAVIX` |

Rows are stored in `strategy_eval.global_market_daily_regime`, keyed by `(instrument_name, trade_date)`. It contains the same returns, moving averages, ATR, RSI, volatility, primary trend and market-zone fields as the NIFTY regime tables. Outputs are in `platform/nifty_stratlab/outputs/global_yfinance_regime/`.
