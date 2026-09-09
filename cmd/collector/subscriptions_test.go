package main

import (
	"testing"
	"time"

	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
)

func TestAppendUniqueSubscriptionsKeepsDynamicOIISStock(t *testing.T) {
	base := []store.Subscription{{Exchange: "NSE", SymbolToken: "1", Mode: "LTP"}}
	live := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "1", Mode: "LTP", Reason: "duplicate"},
		{Exchange: "NSE", SymbolToken: "5926", Mode: "LTP", Reason: "oiis_live_watchlist"},
	}
	result := appendUniqueSubscriptions(base, live...)
	if len(result) != 2 {
		t.Fatalf("expected one base and one unique live subscription, got %d", len(result))
	}
	if result[1].SymbolToken != "5926" || result[1].Reason != "oiis_live_watchlist" {
		t.Fatalf("unexpected dynamic subscription: %#v", result[1])
	}
}

func TestReconcileCurrentStockFNOEquitiesAddsMissingCashUnderlying(t *testing.T) {
	expiry := time.Date(2026, time.September, 29, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NSE", SymbolToken: "11184", TradingSymbol: "IDFCFIRSTB-EQ", Name: "IDFCFIRSTB", InstrumentType: "EQ"},
		{Exchange: "NSE", SymbolToken: "757645", TradingSymbol: "ATHERENERG-EQ", Name: "ATHERENERG", InstrumentType: "EQ"},
		{Exchange: "NFO", SymbolToken: "9001", TradingSymbol: "IDFCFIRSTB29SEP26FUT", Name: "IDFCFIRSTB", InstrumentType: "FUTSTK", Expiry: &expiry},
		{Exchange: "NFO", SymbolToken: "9002", TradingSymbol: "ATHERENERG29SEP26700CE", Name: "ATHERENERG", InstrumentType: "OPTSTK", Expiry: &expiry},
	}
	base := []store.Subscription{{Exchange: "NSE", SymbolToken: "11184", Mode: "QUOTE", Kind: "EQUITY", TradingSymbol: "IDFCFIRSTB-EQ", Underlying: "IDFCFIRSTB"}}

	selected, additions := reconcileCurrentStockFNOEquities(insts, base, "NSE", "NFO", "QUOTE", 250, true, true, time.Date(2026, time.September, 9, 12, 0, 0, 0, time.UTC))
	if len(selected) != 2 || len(additions) != 1 {
		t.Fatalf("expected two selected equities and one addition, got selected=%d additions=%d", len(selected), len(additions))
	}
	if got := additions[0]; got.TradingSymbol != "ATHERENERG-EQ" || got.SymbolToken != "757645" || got.Reason != "current_stock_fno_underlying" {
		t.Fatalf("unexpected added subscription: %#v", got)
	}
}

func TestReconcileCurrentStockFNOEquitiesRejectsExpiredOrUnresolved(t *testing.T) {
	expired := time.Date(2026, time.August, 25, 0, 0, 0, 0, time.UTC)
	future := time.Date(2026, time.September, 29, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NSE", SymbolToken: "1", TradingSymbol: "EXPIRED-EQ", Name: "EXPIRED", InstrumentType: "EQ"},
		{Exchange: "NSE", SymbolToken: "4", TradingSymbol: "011NSETEST-EQ", Name: "011NSETEST", InstrumentType: "EQ"},
		{Exchange: "NFO", SymbolToken: "2", TradingSymbol: "EXPIRED25AUG26100CE", Name: "EXPIRED", InstrumentType: "OPTSTK", Expiry: &expired},
		{Exchange: "NFO", SymbolToken: "3", TradingSymbol: "NOCASH29SEP26100CE", Name: "NOCASH", InstrumentType: "OPTSTK", Expiry: &future},
		{Exchange: "NFO", SymbolToken: "5", TradingSymbol: "011NSETEST27NOV36FUT", Name: "011NSETEST", InstrumentType: "FUTSTK", Expiry: &future},
	}

	selected, additions := reconcileCurrentStockFNOEquities(insts, nil, "NSE", "NFO", "QUOTE", 250, false, true, time.Date(2026, time.September, 9, 12, 0, 0, 0, time.UTC))
	if len(selected) != 0 || len(additions) != 0 {
		t.Fatalf("expected no fabricated or expired equities, got selected=%#v additions=%#v", selected, additions)
	}
}

func TestReconcileCurrentStockFNOEquitiesHonoursCapAndPrefersBase(t *testing.T) {
	expiry := time.Date(2026, time.September, 29, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NSE", SymbolToken: "1", TradingSymbol: "ALPHA-EQ", Name: "ALPHA", InstrumentType: "EQ"},
		{Exchange: "NSE", SymbolToken: "2", TradingSymbol: "BETA-EQ", Name: "BETA", InstrumentType: "EQ"},
		{Exchange: "NFO", SymbolToken: "11", TradingSymbol: "ALPHA29SEP26100CE", Name: "ALPHA", InstrumentType: "OPTSTK", Expiry: &expiry},
		{Exchange: "NFO", SymbolToken: "12", TradingSymbol: "BETA29SEP26100CE", Name: "BETA", InstrumentType: "OPTSTK", Expiry: &expiry},
	}
	base := []store.Subscription{{Exchange: "NSE", SymbolToken: "2", Mode: "QUOTE", Kind: "EQUITY", TradingSymbol: "BETA-EQ", Underlying: "BETA"}}

	selected, additions := reconcileCurrentStockFNOEquities(insts, base, "NSE", "NFO", "QUOTE", 1, false, true, time.Date(2026, time.September, 9, 12, 0, 0, 0, time.UTC))
	if len(selected) != 1 || selected[0].Underlying != "BETA" || len(additions) != 0 {
		t.Fatalf("expected configured cap to retain the existing base F&O equity, got selected=%#v additions=%#v", selected, additions)
	}
}

func TestSubscriptionsForAddedFNOIncludesOnlyActiveMatchingMarketData(t *testing.T) {
	additions := []store.Subscription{{Exchange: "NSE", SymbolToken: "2", Mode: "QUOTE", Kind: "EQUITY", TradingSymbol: "BETA-EQ", Underlying: "BETA", Active: true}}
	active := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "1", Kind: "EQUITY", TradingSymbol: "ALPHA-EQ", Underlying: "ALPHA", Active: true},
		{Exchange: "NSE", SymbolToken: "2", Kind: "EQUITY", TradingSymbol: "BETA-EQ", Underlying: "BETA", Active: true},
		{Exchange: "NFO", SymbolToken: "3", Kind: "FUT", TradingSymbol: "BETA29SEP26FUT", Underlying: "BETA", Active: true},
		{Exchange: "NFO", SymbolToken: "4", Kind: "OPTSTK", TradingSymbol: "BETA29SEP26100CE", Underlying: "BETA", Active: true},
		{Exchange: "NFO", SymbolToken: "5", Kind: "OPTSTK", TradingSymbol: "BETA29SEP26100PE", Underlying: "BETA", Active: false},
	}

	got := subscriptionsForAddedFNO(active, additions)
	if len(got) != 3 {
		t.Fatalf("expected cash, future and one active option for added underlying, got %#v", got)
	}
	for _, sub := range got {
		if sub.Underlying != "BETA" || !sub.Active {
			t.Fatalf("unexpected startup repair target: %#v", sub)
		}
	}
}
