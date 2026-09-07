package store

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
)

func TestDailyArchiveIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("RETENTION_TEST_DSN")
	if dsn == "" {
		t.Skip("isolated fixture required")
	}
	if !strings.Contains(dsn, "/retention_fixture") {
		t.Fatal("fixture required")
	}
	ctx := context.Background()
	pool, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	exec := func(q string) {
		t.Helper()
		if _, e := pool.Exec(ctx, q); e != nil {
			t.Fatal(e)
		}
	}
	exec(`CREATE TABLE public.bars_1m(ts timestamptz,exchange text,symbol_token text,open numeric,high numeric,low numeric,close numeric,volume bigint,source text);
 CREATE SCHEMA nse;CREATE SCHEMA integration;
 CREATE TABLE nse.fact_market_activity_index(trade_date date,index_name text,close_price numeric,high_price numeric,low_price numeric);
 CREATE VIEW integration.v_source_index_1m AS SELECT (ts AT TIME ZONE 'Asia/Kolkata')::date trade_date,'NIFTY 50'::text index_code FROM public.bars_1m;
 INSERT INTO public.bars_1m VALUES
 ('2020-01-02 03:45Z','NSE','99926000',100,103,99,102,10,'test'),
 ('2020-01-02 10:00Z','NSE','99926000',102,105,101,104,20,'test'),
 ('2020-01-03 10:00Z','NSE','99926000',104,107,102,106,30,'test');
 INSERT INTO nse.fact_market_activity_index VALUES('2020-01-02','NIFTY 50',999,1001,990)`)
	load := func(path string) string {
		b, e := os.ReadFile("../../scripts/sql/" + path)
		if e != nil {
			t.Fatal(e)
		}
		return string(b)
	}
	exec(load("daily_archive_20260907.sql"))
	t.Run("cutover refuses missing archive", func(t *testing.T) {
		conn, e := pool.Acquire(ctx)
		if e != nil {
			t.Fatal(e)
		}
		defer conn.Release()
		_, e = conn.Exec(ctx, load("index_daily_cutover_20260907.sql"))
		if e == nil {
			t.Fatal("unsafe cutover passed")
		}
		conn.Exec(ctx, "ROLLBACK")
	})
	exec("SELECT public.archive_minute_session('2020-01-02'); SELECT public.archive_minute_session('2020-01-03')")
	t.Run("OHLCV and close preserve exact legacy values", func(t *testing.T) {
		var o, h, l, c, v int
		e := pool.QueryRow(ctx, "SELECT open,high,low,close,volume FROM public.minute_daily_archive WHERE trade_date='2020-01-02'").Scan(&o, &h, &l, &c, &v)
		if e != nil || o != 100 || h != 105 || l != 99 || c != 104 || v != 30 {
			t.Fatal(o, h, l, c, v, e)
		}
	})
	exec(load("index_daily_cutover_20260907.sql"))
	t.Run("official source precedence preserved", func(t *testing.T) {
		var n int
		e := pool.QueryRow(ctx, "SELECT close_px FROM integration.v_index_daily_history WHERE trade_date='2020-01-02'").Scan(&n)
		if e != nil || n != 999 {
			t.Fatal(n, e)
		}
	})
	t.Run("daily and prior close survive raw expiry", func(t *testing.T) {
		exec("DELETE FROM public.bars_1m")
		var prev, n int
		e := pool.QueryRow(ctx, "SELECT prev_close FROM integration.v_prev_index_daily WHERE trade_date='2020-01-03'").Scan(&prev)
		if e != nil || prev != 104 {
			t.Fatal(prev, e)
		}
		e = pool.QueryRow(ctx, "SELECT close_px FROM integration.v_index_daily_history WHERE trade_date='2020-01-03'").Scan(&n)
		if e != nil || n != 106 {
			t.Fatal(n, e)
		}
	})
}
