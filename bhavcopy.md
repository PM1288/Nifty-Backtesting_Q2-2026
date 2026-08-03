# Bhavcopy Complete Self-Contained Notes

This document is intentionally self-contained.

It includes:

- what Bhavcopy is doing in this repo
- the current main implementation
- the exact download code
- the exact pipeline runner and config
- the analyzer code
- the alternate older service code
- practical notes about what works and what does not work for a single file

No external file lookup is required to understand the Bhavcopy flow.

## 1. Main Conclusion

The primary Bhavcopy implementation in this repository is the Python pipeline below.

It:

- downloads NSE Bhavcopy CSV files
- stores them in a local `bhavcopies` folder
- parses and filters the files
- computes RSI and Williams %R
- applies selection rules
- writes shortlisted rows into a database table

The most complete current version is the code block in Section 3 below.

## 2. Download URL Pattern

The Bhavcopy download uses the NSE archive URL pattern:

```text
https://archives.nseindia.com/products/content/sec_bhavdata_full_DDMMYYYY.csv
```

Example:

```text
https://archives.nseindia.com/products/content/sec_bhavdata_full_01012024.csv
```

The downloaded file is stored locally as:

```text
bhavcopies/bhavcopy_DDMMYYYY.csv
```

Example:

```text
bhavcopies/bhavcopy_01012024.csv
```

## 3. Main Current Bhavcopy Pipeline Code

This is the main current Bhavcopy pipeline code.

```python
#!/usr/bin/env python3
"""
Download NSE Bhavcopies, compute metrics, and store into the `stocks` table.
• Logs to rotating file AND postgres
• No emojis
• Auto-adds missing columns
• Filters only symbols where:
    - SERIES = 'EQ'
    - AVG_PRICE > 1
    - TURNOVER_LACS > 1000
    - DELIV_PER > 45
"""

from __future__ import annotations
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import os, datetime, requests, time
import pandas as pd
from decimal import Decimal, InvalidOperation
from ta.momentum import RSIIndicator, WilliamsRIndicator

from common.config   import strategy_config
from common.logger   import get_logger
from common.db       import conn, bulkinsert
from common.notifier import notify

LOG = get_logger("bhavcopy_pipeline")
BHAV_DIR = "bhavcopies"
TABLE = "stocks"

def safe_numeric(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    for col in columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df

def dl_bhav(date: datetime.date) -> str | None:
    fname = f"{BHAV_DIR}/bhavcopy_{date.strftime('%d%m%Y')}.csv"
    if os.path.exists(fname):
        LOG.info(f"Bhavcopy already exists: {fname}")
        print(f"Bhavcopy already exists: {fname}")
        return fname
    url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{date.strftime('%d%m%Y')}.csv"
    try:
        print(f"Downloading {url}")
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(fname, "wb") as f:
            f.write(r.content)
        LOG.info(f"Downloaded {fname}")
        print(f"Downloaded {fname}")
        return fname
    except Exception as e:
        LOG.warning(f"Failed to download {url}: {e}")
        print(f"Failed to download {url}: {e}")
        return None

def dec(v) -> Decimal:
    try:
        if pd.isna(v):
            return Decimal("0")
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return Decimal("0")

def add_norm(df: pd.DataFrame) -> pd.DataFrame:
    mn, mx = df.Close.min(), df.Close.max()
    df["normalized_close"] = 0 if mx == mn else (df.Close - mn) / (mx - mn) * 100
    return df

def ensure_table_and_columns(cur):
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE}(
            symbol TEXT PRIMARY KEY,
            close NUMERIC,
            rsi NUMERIC,
            willr NUMERIC,
            day_on_rsi INTEGER,
            per_return_rsi NUMERIC,
            normalized_close NUMERIC,
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = %s", (TABLE,))
    existing_cols = set(r[0] for r in cur.fetchall())
    required_cols = {
        "per_return_rsi": "NUMERIC",
        "normalized_close": "NUMERIC",
        "day_on_rsi": "INTEGER"
    }
    for col, coltype in required_cols.items():
        if col not in existing_cols:
            cur.execute(f"ALTER TABLE {TABLE} ADD COLUMN {col} {coltype};")
            LOG.info(f"Added missing column: {col}")
            print(f"Added missing column: {col}")

def process(days: int) -> int:
    os.makedirs(BHAV_DIR, exist_ok=True)

    print(f"Fetching last {days} bhavcopies")
    bus = pd.bdate_range(end=datetime.date.today(), periods=days)
    files = [f for d in reversed(bus) if (f := dl_bhav(d))]

    if not files:
        print("No bhavcopies downloaded")
        return 0

    print(f"Parsing {len(files)} files")
    dfs = []
    for f in files:
        try:
            df = pd.read_csv(f, skipinitialspace=True)
            df.columns = df.columns.str.upper().str.replace(" ", "_")
            df = safe_numeric(df, ["AVG_PRICE", "TURNOVER_LACS", "DELIV_PER"])
            df = df[(df['SERIES'] == 'EQ') & (df['AVG_PRICE'] > 1) &
                    (df['TURNOVER_LACS'] > 1000) & (df['DELIV_PER'] > 50)]
            df["DATE"] = pd.to_datetime(
                df.get("DATE1", os.path.basename(f)[9:17]), dayfirst=True, errors="coerce"
            )
            dfs.append(df)
        except Exception as e:
            print(f"Failed to parse {f}: {e}")
            LOG.warning(f"Failed to parse {f}: {e}")

    if not dfs:
        print("No valid rows after parsing")
        return 0

    full = pd.concat(dfs, ignore_index=True)
    symbols = full.SYMBOL.unique().tolist()
    print(f"Processing {len(symbols)} symbols")
    LOG.info(f"Processing {len(symbols)} symbols")

    rsi_count = 0
    volume_count = 0
    trend_count = 0
    rows = []

    for sym in symbols:
        g = full[full.SYMBOL.eq(sym)].copy()
        if g.empty:
            continue

        g["Close"] = g.CLOSE_PRICE
        g["Volume"] = g.TTL_TRD_QNTY
        g["High"] = g.HIGH_PRICE
        g["Low"] = g.LOW_PRICE
        g["Open"] = g.OPEN_PRICE
        g = g.sort_values("DATE")

        try:
            g["rsi"] = RSIIndicator(close=g.Close).rsi()
            g["willr"] = WilliamsRIndicator(high=g.High, low=g.Low, close=g.Close).williams_r()
        except Exception as e:
            print(f"Indicator error for {sym}: {e}")
            continue

        g["day_rsi"] = (g.rsi < 30).astype(int)
        g["per_return_rsi"] = ((g.Close * g.day_rsi.cumsum()) -
                               (g.Close.where(g.rsi < 30, 0).cumsum())) / (
                                  g.Close.where(g.rsi < 30, 0).cumsum().replace(0, 1)
                               ) * 100
        g = add_norm(g)

        include_symbol = False

        # --- RSI condition ---
        try:
            if (
                g["day_rsi"].iloc[-1] == 1 and
                g["Low"].iloc[-1] > g["Low"].iloc[-2] and
                g["Close"].iloc[-1] > g["Open"].iloc[-2]
            ):
                all_time_high = g["Close"].max()
                current_close = g["Close"].iloc[-1]
                if current_close <= 0.8 * all_time_high:
                    include_symbol = True
                    rsi_count += 1
                    print(f"Selected by RSI: {sym}")
        except Exception as e:
            print(f"RSI filter error for {sym}: {e}")

        # --- Volume Spike condition ---
        try:
            if len(g) >= 30:
                g["Volume_MA7"] = g["Volume"].rolling(7).mean()
                g["Volume_Spike"] = g["Volume"] > 2 * g["Volume_MA7"]
                spike_indices = g.index[g["Volume_Spike"]].tolist()

                for i in spike_indices:
                    pos = g.index.get_loc(i)
                    if pos + 2 < len(g):
                        spike_close = g.iloc[pos]["Close"]
                        post_close = g.iloc[pos + 2]["Close"]
                        if (post_close - spike_close) / spike_close < -0.03:
                            recent_close = g.iloc[-1]["Close"]
                            high_90d = g["High"].rolling(90, min_periods=1).max().iloc[-1]
                            if (
                                recent_close <= 0.75 * high_90d and
                                g["willr"].iloc[-1] < -40 and
                                g["Close"].iloc[-1] > g["Open"].iloc[-2]
                            ):
                                include_symbol = True
                                volume_count += 1
                                print(f"Selected by Volume Spike: {sym}")
                                break
        except Exception as e:
            print(f"Volume spike filter failed for {sym}: {e}")

        # --- Trend + Volume condition ---
        # --- Trend + Volume condition ---
        try:
            if len(g) >= 10:
                last5 = g.iloc[-5:]
                avg_vol = g["Volume"].rolling(5).mean().iloc[-1]  # 5-day MA from full history
                if 1>0:
                    start_close = last5["Close"].iloc[0]
                    end_close = last5["Close"].iloc[-1]
                    if end_close > 1.045 * start_close:
                        alltime_min = g["Close"].min()
                        alltime_max = g["Close"].max()
                        if (
                            end_close >= 1.12 * alltime_min and
                            end_close <= 0.45 * alltime_max
                        ):
                            include_symbol = True
                            trend_count += 1
                            print(f"Selected by Trend+Volume: {sym}")
        except Exception as e:
            print(f"Trend+Volume filter failed for {sym}: {e}")

        if not include_symbol:
            continue

        last = g.iloc[-1]
        rows.append((
            sym,
            dec(last.Close),
            dec(last.rsi),
            dec(last.willr),
            int(last.day_rsi),
            dec(last.per_return_rsi),
            dec(last.normalized_close)
        ))

    print(f"\n✅ Selected {len(rows)} symbols in total:")
    print(f"→ RSI condition:           {rsi_count}")
    print(f"→ Volume spike condition:  {volume_count}")
    print(f"→ Trend+Volume condition:  {trend_count}")

    print(f"Writing {len(rows)} rows to table {TABLE}")
    LOG.info(f"Writing {len(rows)} rows to table {TABLE}")

    with conn() as c:
        with c.cursor() as cur:
            ensure_table_and_columns(cur)
            bulkinsert(
                cur,
                TABLE,
                ["symbol", "close", "rsi", "willr", "day_on_rsi", "per_return_rsi", "normalized_close"],
                rows,
                upsert_on="symbol"
            )
        c.commit()

    print(f"Completed: {len(rows)} symbols written")
    LOG.info(f"Completed: {len(rows)} symbols written")
    return len(rows)

def main():
    print("Starting Bhavcopy Pipeline")
    start = time.time()
    notify("bhavcopy_pipeline", "Run started", "low")
    days = strategy_config().get("bhavcopy", {}).get("days_back", 365)
    count = process(days=days)
    dur = round(time.time() - start, 1)
    print(f"Run completed in {dur} seconds")
    LOG.info(f"Run completed in {dur} seconds")
    notify("bhavcopy_pipeline", f"Completed in {dur}s ({count} symbols)", "low")

if __name__ == "__main__":
    main()
```

## 4. Exact Download Logic Only

If you only want the Bhavcopy download code isolated, this is the exact current function:

```python
BHAV_DIR = "bhavcopies"

def dl_bhav(date: datetime.date) -> str | None:
    fname = f"{BHAV_DIR}/bhavcopy_{date.strftime('%d%m%Y')}.csv"
    if os.path.exists(fname):
        LOG.info(f"Bhavcopy already exists: {fname}")
        print(f"Bhavcopy already exists: {fname}")
        return fname
    url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{date.strftime('%d%m%Y')}.csv"
    try:
        print(f"Downloading {url}")
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(fname, "wb") as f:
            f.write(r.content)
        LOG.info(f"Downloaded {fname}")
        print(f"Downloaded {fname}")
        return fname
    except Exception as e:
        LOG.warning(f"Failed to download {url}: {e}")
        print(f"Failed to download {url}: {e}")
        return None
```

## 5. Exact Pipeline Runner Code

This is how the current trading system invokes the Bhavcopy pipeline.

```python
import sys
import subprocess
from pathlib import Path
from datetime import datetime
sys.path.append(str(Path(__file__).resolve().parents[1]))

from common.notifier import notify

SCRIPTS = [
    "data_source/01_bhavcopy_pipeline.py",
    "data_source/02_n100.py",
    "data_source/03_portfolio_sync.py",
    "data_source/04_manual_tracker_sync.py",
    "data_source/05_build_master_tracking_no_token.py",
    "data_source/06_token_mapper.py"
]

def run_script(script):
    print(f"\n[RUNNER] Executing {script}...")
    result = subprocess.run([sys.executable, script], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(f"[ERROR] {script} failed:\n{result.stderr}")
        notify("runner", f"❌ Failed: {script}", criticality="high")
        sys.exit(1)

def main():
    start_time = datetime.utcnow()
    print(f"Starting pipeline at {start_time} UTC\n")

    for script in SCRIPTS:
        run_script(script)

    duration = (datetime.utcnow() - start_time).total_seconds()
    print(f"\nAll scripts completed in {duration:.1f} seconds.")

    notify(
        service="runner",
        message=f"✅ All pipeline scripts completed in {duration:.1f}s.",
        criticality="low"
    )

if __name__ == "__main__":
    main()
```

## 6. Exact Current Bhavcopy Config

```yaml
bhavcopy:
  days_back: 365
  min_score: 80
```

## 7. Current Bhavcopy Analyzer Code

This is another Bhavcopy-related code path in the same trading system.

```python
#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import os, datetime, requests, pandas as pd
from ta.momentum import RSIIndicator, WilliamsRIndicator
from common.db import conn, bulkinsert
from common.logger import get_logger
from common.notifier import notify
from common.config import strategy_config, env

log = get_logger("bhavcopy_analyser")

BHAV_DIR = "bhavcopies"
os.makedirs(BHAV_DIR, exist_ok=True)

def download(date):
    ds = date.strftime("%d%b%Y").upper()
    url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{date.strftime('%d%m%Y')}.csv"
    file = f"{BHAV_DIR}/bhavcopy_{date.strftime('%d%m%Y')}.csv"
    if os.path.exists(file):
        return file
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(file, "wb") as f:
            f.write(r.content)
        return file
    except Exception as e:
        log.warning("download failed %s %s", url, e)
        return ""

def load_latest(days_back):
    for d in range(days_back):
        f = download(datetime.date.today() - datetime.timedelta(days=d))
        if f:
            return pd.read_csv(f, skipinitialspace=True)
    return pd.DataFrame()

def score(df, cfg):
    df["rsi"] = RSIIndicator(close=df.CLOSE_PRICE).rsi()
    df["willr"] = WilliamsRIndicator(high=df.HIGH_PRICE, low=df.LOW_PRICE, close=df.CLOSE_PRICE).williams_r()
    return (100 - df.rsi.iloc[-1]) + (-df.willr.iloc[-1])

def select_candidates(df, cfg):
    sel = []
    for sym, g in df.groupby("SYMBOL"):
        s = score(g, cfg)
        if s > cfg["min_score"]:
            sel.append((sym, g.rsi.iloc[-1], g.willr.iloc[-1], s))
    return sel

def main():
    cfg = strategy_config()["bhavcopy"]
    raw = load_latest(cfg["days_back"])
    if raw.empty:
        log.error("no bhavcopy data")
        return
    raw.columns = raw.columns.str.upper().str.replace(" ", "_")
    raw = raw[raw.SERIES == "EQ"]
    cands = select_candidates(raw, cfg)
    if not cands:
        log.info("no buy candidates")
        return
    with conn() as c:
        with c.cursor() as cur:
            cur.execute("TRUNCATE buy_candidates")
            bulkinsert(cur, "buy_candidates", ["stock", "rsi", "willr", "score"], cands)
        c.commit()
    log.info("inserted %s buy candidates", len(cands))
    notify("bhavcopy_analyser", f"Bhavcopy analysis complete ({len(cands)} buys)")

if __name__ == "__main__":
    main()
```

## 8. Alternate Older Bhavcopy Service Code

This is another Bhavcopy implementation that appears to be an older or alternate service.

It still matters because:

- it contains a full Bhavcopy downloader
- it builds a Bhavcopy daily summary
- it computes RSI and Williams %R
- it writes per-symbol summary output

```python
import os
import pandas as pd
import requests
import zipfile
import io
import datetime
import psycopg2
from psycopg2.extras import execute_values
from ta.momentum import RSIIndicator, WilliamsRIndicator
from decimal import Decimal, InvalidOperation

#POSTGRES_USER=trader
#POSTGRES_PASSWORD=change_me_now
#POSTGRES_DB=tradingdb

# Database configuration from environment variables
PGHOST = os.getenv("DB_HOST", "localhost")
PGPORT = int(os.getenv("DB_PORT", 55432))
PGDATABASE = os.getenv("DB_NAME", "tradingdb")
PGUSER = os.getenv("DB_USER", "trader")
PGPASSWORD = os.getenv("DB_PASSWORD", "change_me_now")
MASTER_LIST_TABLE = os.getenv("MASTER_LIST_TABLE", "master_list_table")
DAY_DATA_TABLE = "bhavcopy_daily_summary"
TARGET_TABLE = "stocks"
BHAVCOPY_DIR = "bhavcopies"

def ensure_directory(path):
    if not os.path.exists(path):
        os.makedirs(path)

def download_bhavcopy(date_obj):
    date_str = date_obj.strftime("%d-%m-%Y")
    formatted_date = date_obj.strftime("%d%m%Y")
    url = f"https://archives.nseindia.com/products/content/sec_bhavdata_full_{formatted_date}.csv"
    local_file = os.path.join(BHAVCOPY_DIR, f"bhavcopy_{formatted_date}.csv")

    if os.path.exists(local_file):
        print(f"[INFO] Bhavcopy for {date_str} already exists.")
        return

    try:
        response = requests.get(url)
        response.raise_for_status()
        with open(local_file, 'wb') as f:
            f.write(response.content)
        print(f"[SUCCESS] Downloaded Bhavcopy for {date_str}.")
    except Exception as e:
        print(f"[WARNING] Failed to download Bhavcopy for {date_str}: {e}")

def download_missing_bhavcopies(days_back=365):
    ensure_directory(BHAVCOPY_DIR)
    dates = pd.bdate_range(end=datetime.datetime.today(), periods=days_back)
    for date in reversed(dates):
        download_bhavcopy(date)

def connect_db():
    return psycopg2.connect(
        host=PGHOST, port=PGPORT, dbname=PGDATABASE,
        user=PGUSER, password=PGPASSWORD
    )

def to_decimal(val):
    try:
        if pd.isna(val):
            return Decimal("0.0")
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0.0")

def calculate_sip_metrics(df):
    df = df.sort_values("DATE")
    df['Close'] = df['CLOSE_PRICE']
    df['High'] = df['HIGH_PRICE']
    df['Low'] = df['LOW_PRICE']
    df['day'] = range(1, len(df) + 1)

    # Charges
    brokerage_rate = 0.0032
    min_brokerage = 25.0
    stt_rate = 0.001
    exchange_txn_rate = 0.000297
    sebi_fee_rate = 0.000001
    stamp_duty_rate = 0.00015
    gst_rate = 0.18

    df['investment'] = df['Close']
    df['brokerage'] = df['investment'].apply(lambda x: max(x * brokerage_rate, min_brokerage))
    df['stt'] = df['investment'] * stt_rate
    df['exchange_txn'] = df['investment'] * exchange_txn_rate
    df['sebi_fee'] = df['investment'] * sebi_fee_rate
    df['stamp_duty'] = df['investment'] * stamp_duty_rate
    df['gst'] = (df['brokerage'] + df['exchange_txn']) * gst_rate
    df['total_charges'] = df[['brokerage', 'stt', 'exchange_txn', 'sebi_fee', 'stamp_duty', 'gst']].sum(axis=1)
    df['total_cost'] = df['investment'] + df['total_charges']

    df['price_change_today'] = df['Close'].diff().fillna(0)
    df['buy_on_dip'] = df['Close'].where(df['price_change_today'] < 0, 0)
    df['day_on_dip'] = df['price_change_today'].apply(lambda x: 1 if x < 0 else 0)

    df['rsi'] = RSIIndicator(close=df['Close']).rsi()
    df['willr'] = WilliamsRIndicator(high=df['High'], low=df['Low'], close=df['Close']).williams_r()

    df['buy_on_rsi'] = df['Close'].where(df['rsi'] < 30, 0)
    df['day_on_rsi'] = df['rsi'].apply(lambda x: 1 if x < 30 else 0)
    df['buy_on_rsi_willr'] = df['Close'].where((df['rsi'] < 30) & (df['willr'] < -80), 0)
    df['day_on_rsi_willr'] = df.apply(lambda x: 1 if (x['rsi'] < 30 and x['willr'] < -80) else 0, axis=1)

    def compute_sip(base_col, day_col):
        cost = df[base_col].copy()
        cost[df[base_col] > 0] = (
            df[base_col] +
            df[base_col].apply(lambda x: max(x * brokerage_rate, min_brokerage)) +
            df[base_col] * (stt_rate + exchange_txn_rate + sebi_fee_rate + stamp_duty_rate) +
            (df[base_col].apply(lambda x: max(x * brokerage_rate, min_brokerage)) + df[base_col] * exchange_txn_rate) * gst_rate
        )
        invest = cost.cumsum()
        cum_day = df[day_col].cumsum()
        ret = df['Close'] * cum_day
        per_ret = ((ret - invest) / invest) * 100
        return invest, per_ret

    _, df['per_return_on_rsi_willr'] = compute_sip('buy_on_rsi_willr', 'day_on_rsi_willr')
    return df

def process_bhavcopies():
    conn = connect_db()
    cur = conn.cursor()

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {DAY_DATA_TABLE} (
            ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            symbol TEXT,
            close NUMERIC,
            rsi NUMERIC,
            willr NUMERIC,
            per_return_on_rsi_willr NUMERIC
        );
    """)
    conn.commit()

    cur.execute(f"SELECT stock FROM {MASTER_LIST_TABLE};")
    master_rows = cur.fetchall()
    symbols = [row[0] for row in master_rows]

    all_data = []

    for filename in os.listdir(BHAVCOPY_DIR):
        if filename.endswith(".csv"):
            filepath = os.path.join(BHAVCOPY_DIR, filename)
            try:
                df = pd.read_csv(filepath, skipinitialspace=True)
                df.columns = df.columns.str.strip().str.upper().str.replace(" ", "_")
                # Try extracting DATE1; fallback to filename-based date if missing
                if 'DATE1' in df.columns:
                    df['DATE'] = pd.to_datetime(df['DATE1'], format='%d-%b-%Y')
                else:
                    try:
                        file_date = filename.replace("bhavcopy_", "").replace(".csv", "").strip()
                        df['DATE'] = pd.to_datetime(file_date, format='%d%m%Y')
                    except Exception as e:
                        print(f"[ERROR] Couldn't parse date from filename {filename}: {e}")
                        continue
                df = df[df['SYMBOL'].isin(symbols)]
                all_data.append(df)
            except Exception as e:
                print(f"[ERROR] Failed to process {filename}: {e}")

    if not all_data:
        print("[INFO] No data to process.")
        return

    full_data = pd.concat(all_data, ignore_index=True)

    for symbol in symbols:
        df_symbol = full_data[full_data['SYMBOL'] == symbol.upper()]
        if df_symbol.empty:
            continue

        df_symbol = calculate_sip_metrics(df_symbol)
        latest = df_symbol.iloc[-1]

        record = (
            symbol,
            to_decimal(latest.get("Close")),
            to_decimal(latest.get("rsi")),
            to_decimal(latest.get("willr")),
            to_decimal(latest.get("per_return_on_rsi_willr"))
        )

        try:
            execute_values(cur, f"""
                INSERT INTO {DAY_DATA_TABLE} (symbol, close, rsi, willr, per_return_on_rsi_willr)
                VALUES %s;
            """, [record])
            conn.commit()
        except Exception as e:
            print(f"[ERROR] Failed to insert data for {symbol}: {e}")

        # Save individual CSV
        output_path = os.path.join("summaries", f"{symbol}.csv")
        df_symbol.to_csv(output_path, index=False)

    conn.close()

def main():
    download_missing_bhavcopies(days_back=365)
    summaries_dir = "summaries"
    if not os.path.exists(summaries_dir):
        os.makedirs(summaries_dir)
    process_bhavcopies()

if __name__ == "__main__":
    main()
```

## 9. Plain-English Flow of the Main Current Pipeline

The main current pipeline works like this:

1. Create `bhavcopies/` if it does not exist.
2. Generate a list of business dates for the configured history window.
3. For each date:
   - construct the NSE Bhavcopy URL
   - download the CSV if it is missing locally
4. Read all downloaded CSV files into pandas DataFrames.
5. Normalize the column names.
6. Filter for tradeable NSE equity rows only.
7. Merge all days into one historical dataset.
8. For each symbol:
   - sort by date
   - compute RSI
   - compute Williams %R
   - compute derived metrics
   - apply rule filters
9. Save the shortlisted rows into the `stocks` table.

## 10. What Happens For One Single Bhavcopy File

This is important.

A single Bhavcopy CSV file usually contains only one row per symbol for one day.

That means:

- RSI does not have enough historical data
- Williams %R does not have enough historical data
- checks like `iloc[-2]` do not have a prior row
- rolling windows such as 5-day, 7-day, and 90-day logic do not have enough history

So:

- single-file reading works
- single-file filtering works
- single-file indicator-driven selection does not work meaningfully in the current main pipeline

### Practical single-file result

When tested against one real Bhavcopy CSV:

- rows can be loaded
- symbols can be counted
- indicators become `NaN`
- final selected symbols stay at zero

## 11. Why There Are Multiple Bhavcopy Implementations

This repo appears to have evolved over time.

The Bhavcopy logic exists in at least these forms:

1. Modular current trading-system pipeline
2. Separate analyzer path
3. Older service-oriented Bhavcopy processor
4. Notebook-derived or legacy bundled code

The most complete and current operational version is the code in Section 3.

## 12. If You Need Only One Singular Code Block

Use Section 3.

That one code block contains:

- downloading
- file naming
- parsing
- filtering
- indicators
- selection rules
- DB schema creation
- DB upsert
- run entry point

## 13. Final Takeaway

If you want the Bhavcopy system in one place, use this document plus the main current code in Section 3.

If you want the exact download code only, use Section 4.

If you want the execution wrapper, use Section 5.

If you want the alternate older service implementation, use Section 8.
