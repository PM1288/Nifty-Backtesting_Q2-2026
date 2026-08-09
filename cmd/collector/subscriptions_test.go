package main

import (
	"testing"

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
