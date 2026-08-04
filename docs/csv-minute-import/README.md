# CSV minute-history PostgreSQL importer

The executable importer is
`platform/nifty_stratlab/tools/import_nifty_minute_csv.py`. It reads one stock
at a time, treats the CSV timestamp as Asia/Kolkata, retains `09:15` through
`15:29` IST (including legitimate special weekend sessions), validates OHLCV,
deduplicates timestamps, resolves the NSE token, and commits one symbol per
transaction.

Raw bars are inserted into `public.bars_1m` with `ON CONFLICT DO NOTHING`.
Existing raw rows are never updated or deleted. Derived values are upserted into
`research.security_minute_technical`; import state is recorded in
`catalog.csv_minute_import`. Migration `007_csv_minute_history.sql` creates both
tables and their indexes.

Computed columns are RSI(14), Williams %R(14), SMA20, SMA50, lower Bollinger
Band(20,2), MACD(12,26,9), prior completed daily RSI, the preceding daily RSI,
and prior daily close. Warm-up rows correctly have null indicators until enough
completed bars exist.

## Safe commands

Set the DSN without printing its password:

```bash
cd /home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/platform/nifty_stratlab
db_password=$(docker inspect trading-stack-novius2-postgres-1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | \
  awk -F= '$1=="POSTGRES_PASSWORD"{print substr($0,index($0,"=")+1)}')
db_ip=$(docker inspect trading-stack-novius2-postgres-1 \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export TRADING_DATABASE_URL="postgresql://trader:${db_password}@${db_ip}:5432/tradingdb"
```

Dry-run one symbol and bounded dates:

```bash
PYTHONPATH=src .venv/bin/python tools/import_nifty_minute_csv.py \
  --csv-dir /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50 \
  --symbols RELIANCE --start 2025-07-01 --end 2025-07-03 --dry-run
```

Import one symbol or every CSV:

```bash
PYTHONPATH=src .venv/bin/python tools/import_nifty_minute_csv.py \
  --csv-dir /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50 \
  --symbols RELIANCE

PYTHONPATH=src .venv/bin/python tools/import_nifty_minute_csv.py \
  --csv-dir /home/novius2/data/nifty-50-minute-data/aaditya555/NIFTY50 \
  --continue-on-error
```

The full command processes files sequentially and resumes by source SHA-256 plus
requested date range. `--force` recalculates derived rows but still cannot
overwrite existing raw bars. Each run writes a JSON report under `outputs/`.

Token resolution first uses the active NSE universe and then falls back to
`public.instruments`, which is required for historical names no longer present
in the current universe. The explicit compatibility aliases are `MM` to
`M&M-EQ` and `TATAMOTORS` to `TMPV-EQ`; review those mappings before treating
post-demerger history as a single economic instrument.

## Verification

```sql
SELECT count(*), min(ts), max(ts)
FROM public.bars_1m
WHERE exchange='NSE' AND symbol_token='2885';

SELECT count(*), count(rsi_14), count(willr_14), count(bollinger_lower_20_2)
FROM research.security_minute_technical
WHERE symbol='RELIANCE';

SELECT symbol, requested_start, requested_end, status,
       accepted_rows, raw_inserted_rows, feature_upserted_rows
FROM catalog.csv_minute_import
ORDER BY import_id DESC;
```

Do not run the all-symbol command concurrently with another copy. The importer
is idempotent, but duplicate calculation wastes CPU and database I/O.
