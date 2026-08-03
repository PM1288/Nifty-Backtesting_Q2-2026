package universe

import (
	"os"
	"path/filepath"
	"testing"

	"log/slog"

	"trading-stack/internal/instruments"
)

func TestParseSymbolsCSV(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "symbols.csv")
	content := "Company,Symbol,Series\nTata,TCS,EQ\n Infosys,INFY,EQ\n\nReliance,RELIANCE,EQ\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write csv: %v", err)
	}

	got, err := ParseSymbolsCSV(path)
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 symbols, got %d", len(got))
	}
	if got[0] != "TCS" || got[1] != "INFY" || got[2] != "RELIANCE" {
		t.Fatalf("unexpected symbols: %v", got)
	}
}

func TestResolveEquities(t *testing.T) {
	instrumentsList := []instruments.Instrument{
		{Exchange: "NSE", TradingSymbol: "TCS-EQ", SymbolToken: "11536"},
		{Exchange: "NSE", TradingSymbol: "INFY", SymbolToken: "1594"},
		{Exchange: "NSE", TradingSymbol: "RELIANCE-EQ", SymbolToken: "2885"},
	}
	r := Resolver{Instruments: instrumentsList, EquityExchange: "NSE", Logger: slog.Default()}
	subs, err := r.ResolveEquities([]string{"TCS", "INFY", "RELIANCE"}, "LTP")
	if err != nil {
		t.Fatalf("resolve equities: %v", err)
	}
	if len(subs) != 3 {
		t.Fatalf("expected 3 subscriptions, got %d", len(subs))
	}
	if subs[0].TradingSymbol != "TCS-EQ" {
		t.Fatalf("expected TCS-EQ, got %s", subs[0].TradingSymbol)
	}
}

func TestResolveIndices(t *testing.T) {
	instrumentsList := []instruments.Instrument{
		{Exchange: "NSE", TradingSymbol: "Nifty 50", Name: "NIFTY", SymbolToken: "99926000"},
		{Exchange: "NSE", TradingSymbol: "Nifty Bank", Name: "BANKNIFTY", SymbolToken: "99926009"},
	}
	r := Resolver{Instruments: instrumentsList, EquityExchange: "NSE", Logger: slog.Default()}
	subs, err := r.ResolveIndices([]string{"NIFTY", "BANKNIFTY"}, "LTP")
	if err != nil {
		t.Fatalf("resolve indices: %v", err)
	}
	if len(subs) != 2 {
		t.Fatalf("expected 2 subscriptions, got %d", len(subs))
	}
}
