package main

import (
	"testing"
	"time"

	"trading-stack/internal/store"
)

func TestSelectTargetsKeepsExactExpiryAndNearestStrikeWindow(t *testing.T) {
	expiry := time.Date(2026, time.September, 29, 0, 0, 0, 0, time.UTC)
	other := time.Date(2026, time.October, 6, 0, 0, 0, 0, time.UTC)
	var subs []store.Subscription
	for _, strike := range []float64{23250, 23300, 23350, 23400, 23450} {
		strike := strike
		for _, right := range []string{"CE", "PE"} {
			subs = append(subs, store.Subscription{Active: true, Exchange: "NFO", SymbolToken: right, Kind: "OPTIDX", Underlying: "NIFTY50", Expiry: &expiry, Strike: &strike, Right: right})
		}
	}
	strike := 23350.0
	subs = append(subs,
		store.Subscription{Active: true, Kind: "OPTIDX", Underlying: "NIFTY50", Expiry: &other, Strike: &strike, Right: "CE"},
		store.Subscription{Active: true, Kind: "OPTSTK", Underlying: "NIFTY50", Expiry: &expiry, Strike: &strike, Right: "CE"},
	)
	targets := selectTargets(subs, "NIFTY50", expiry, 23340, 1)
	if len(targets) != 6 {
		t.Fatalf("expected three paired strikes, got %d: %#v", len(targets), targets)
	}
	if *targets[0].Strike != 23300 || *targets[len(targets)-1].Strike != 23400 {
		t.Fatalf("unexpected strike window %.0f..%.0f", *targets[0].Strike, *targets[len(targets)-1].Strike)
	}
}
