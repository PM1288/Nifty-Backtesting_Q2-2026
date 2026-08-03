#!/usr/bin/env python
from __future__ import annotations
import io, datetime as dt, logging, argparse
from concurrent.futures import ThreadPoolExecutor
import pandas as pd, requests
from ta.momentum import RSIIndicator, WilliamsRIndicator
from sqlalchemy import text
import config as cfg
from db_utils import engine, session_scope
from notifier import notify

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
LOG = logging.getLogger("bhavcopy")

CSV_URL = "https://archives.nseindia.com/products/content/sec_bhavdata_full_{date}.csv"

def fetch_csv(date: dt.date) -> pd.DataFrame | None:
    fn = cfg.BHAVCOPY_DIR / f"bhav_{date:%Y%m%d}.csv"
    if fn.exists():
        return pd.read_csv(fn)

    url = CSV_URL.format(date=date.strftime("%d%m%Y"))
    r = requests.get(url, timeout=20)
    if r.ok:
        cfg.BHAVCOPY_DIR.mkdir(exist_ok=True)
        fn.write_bytes(r.content)
        return pd.read_csv(io.BytesIO(r.content))
    LOG.warning("Skip %s – %s", date, r.status_code)
    return None

def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df['DATE'] = pd.to_datetime(df['DATE1'], format='%d-%b-%Y', errors='coerce')
    df.dropna(subset=['DATE'], inplace=True)

    df['Close'] = df['CLOSE_PRICE']
    df['rsi']   = RSIIndicator(df['Close']).rsi()
    df['willr'] = WilliamsRIndicator(df['HIGH_PRICE'],
                                     df['LOW_PRICE'],
                                     df['Close']).williams_r()
    df['pct_change'] = (df['HIGH_PRICE'] - df['LOW_PRICE']) / df['LOW_PRICE'] * 100
    return df

def ingest(days: int):
    dates = pd.bdate_range(end=dt.date.today(), periods=days)
    with ThreadPoolExecutor(max_workers=8) as ex:
        frames = [f for f in ex.map(fetch_csv, dates[::-1]) if f is not None]
    if not frames:
        LOG.error("No bhavcopies downloaded.")
        return
    df = pd.concat([add_indicators(f) for f in frames], ignore_index=True)

    # 30-day avg turnover
    recent = df[df['DATE'] >= dt.date.today() - dt.timedelta(days=30)]
    df = df.merge(
        (recent['TTL_TRD_QNTY'] * recent['AVG_PRICE'])
        .groupby(recent['SYMBOL']).mean()
        .rename('last30_turnover'),
        left_on='SYMBOL', right_index=True)

    with session_scope() as sess:
        sess.execute(text("TRUNCATE TABLE IF EXISTS stocks;"))
        df.to_sql("stocks", engine, if_exists="append",
                  index=False, method="multi", chunksize=20_000)

    notify("bhavcopy_ingest",
           f"Ingested {len(df):,} rows for {df['SYMBOL'].nunique()} symbols")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()
    ingest(args.days)

if __name__ == "__main__":
    main()
