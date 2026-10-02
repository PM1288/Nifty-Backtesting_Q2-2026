package store

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"os"
	"sort"
	"testing"
	"time"
)

// Run inside the database container. Only a uniquely named disposable schema
// is written; production source rows are never modified by this test.
func TestRealtimeStatePersistence(t *testing.T) {
	if os.Getenv("N50_STORE_INTEGRATION") != "1" {
		t.Skip("requires explicit integration environment")
	}
	u := &url.URL{Scheme: "postgres", Host: "127.0.0.1:5432", Path: "/" + os.Getenv("POSTGRES_DB"), User: url.UserPassword(os.Getenv("POSTGRES_USER"), os.Getenv("POSTGRES_PASSWORD"))}
	q := u.Query()
	q.Set("sslmode", "disable")
	u.RawQuery = q.Encode()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal("database connection failed")
	}
	defer pool.Close()
	schema := fmt.Sprintf("realtime_test_%d", time.Now().UnixNano())
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, err := pool.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		if err != nil {
			t.Error(err)
		}
	}()
	if _, err = pool.Exec(ctx, "CREATE TABLE "+schema+".instrument_state (LIKE public.instrument_state INCLUDING ALL)"); err != nil {
		t.Fatal(err)
	}
	st := &Store{Pool: pool, Schema: schema}
	price := 100.0
	state := InstrumentState{Exchange: "NSE", SymbolToken: "1", LastSeen: time.Unix(100, 0), LastPrice: &price, LastSource: "ws"}
	if err = st.UpsertInstrumentStates(ctx, []InstrumentState{state}); err != nil {
		t.Fatal(err)
	}
	price2 := 90.0
	state.LastSeen = time.Unix(90, 0)
	state.LastPrice = &price2
	if err = st.UpsertInstrumentStates(ctx, []InstrumentState{state}); err != nil {
		t.Fatal(err)
	}
	var actual float64
	if err = pool.QueryRow(ctx, "SELECT last_price FROM "+schema+".instrument_state WHERE symbol_token='1'").Scan(&actual); err != nil || actual != 100 {
		t.Fatalf("stale write replaced price: %v %v", actual, err)
	}
	state.LastSeen = time.Unix(101, 0)
	state.LastPrice = nil
	if err = st.UpsertInstrumentStates(ctx, []InstrumentState{state}); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "SELECT last_price FROM "+schema+".instrument_state WHERE symbol_token='1'").Scan(&actual); err != nil || actual != 100 {
		t.Fatal("missing quote erased price")
	}
	// Correct legacy receipt timestamps once, then enforce exchange-time ordering.
	state.SymbolToken = "legacy"
	state.LastSource = "rest_quote"
	state.LastSeen = time.Unix(200, 0)
	state.LastPrice = &price
	if err = st.UpsertInstrumentStates(ctx, []InstrumentState{state}); err != nil {
		t.Fatal(err)
	}
	state.LastSource = "rest_quote_exchange"
	state.LastSeen = time.Unix(100, 0)
	if err = st.UpsertInstrumentStates(ctx, []InstrumentState{state}); err != nil {
		t.Fatal(err)
	}
	var observed time.Time
	if err = pool.QueryRow(ctx, "SELECT last_seen_ts FROM "+schema+".instrument_state WHERE symbol_token='legacy'").Scan(&observed); err != nil || observed.Unix() != 100 {
		t.Fatal("legacy timestamp was not corrected", err)
	}
	if _, err = pool.Exec(ctx, "CREATE TABLE "+schema+".trading_calendar (trade_date date primary key, market_open_ts timestamptz, market_close_ts timestamptz, is_trading_day boolean)"); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, "INSERT INTO "+schema+".trading_calendar VALUES ('2026-10-02','2026-10-02 03:45Z','2026-10-02 10:00Z',false)"); err != nil {
		t.Fatal(err)
	}
	open, err := st.MarketSessionAt(ctx, time.Date(2026, 10, 2, 5, 0, 0, 0, time.UTC), time.UTC)
	if err != nil || open {
		t.Fatal("holiday reported open", err)
	}
	if _, err = st.MarketSessionAt(ctx, time.Date(2027, 1, 1, 5, 0, 0, 0, time.UTC), time.UTC); err == nil {
		t.Fatal("missing calendar must not silently imply open")
	}
	rows := make([]InstrumentState, 3000)
	var durations []float64
	for run := 0; run < 5; run++ {
		for i := range rows {
			rows[i] = InstrumentState{Exchange: "NSE", SymbolToken: fmt.Sprint(i + 1), LastSeen: time.Now(), LastPrice: &price, LastSource: "ws"}
		}
		started := time.Now()
		if err = st.UpsertInstrumentStates(ctx, rows); err != nil {
			t.Fatal(err)
		}
		durations = append(durations, float64(time.Since(started).Microseconds())/1000)
	}
	sort.Float64s(durations)
	t.Logf("3000-row state batch: median=%.1fms max=%.1fms (5 runs, isolated schema)", durations[2], durations[4])
}
