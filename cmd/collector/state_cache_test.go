package main

import (
	"testing"
	"time"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

func TestStateRetryPreservesNewerObservation(t *testing.T) {
	cache := newInstrumentStateCache()
	oldPrice, newPrice, volume := 100.0, 102.0, int64(50)
	old := store.InstrumentState{Exchange: "NSE", SymbolToken: "1", LastSeen: time.Unix(100, 0), LastPrice: &oldPrice, LastVolume: &volume, LastSource: "rest"}
	cache.Update(old)
	failed := cache.Flush()
	cache.Update(store.InstrumentState{Exchange: "NSE", SymbolToken: "1", LastSeen: time.Unix(102, 0), LastPrice: &newPrice, LastSource: "ws"})
	for _, state := range failed {
		cache.Update(state)
	}
	rows := cache.Flush()
	if len(rows) != 1 || *rows[0].LastPrice != newPrice || rows[0].LastSeen.Unix() != 102 || rows[0].LastSource != "ws" {
		t.Fatalf("retry overwrote newer state: %+v", rows)
	}
	if rows[0].LastVolume == nil || *rows[0].LastVolume != volume {
		t.Fatal("retry lost available volume")
	}
	if len(cache.Flush()) != 0 {
		t.Fatal("successful flush must drain cache")
	}
}

func TestQuoteFreshnessUsesExchangeTime(t *testing.T) {
	observed := time.Unix(100, 0)
	if got := quoteObservedAt(smartapi.Quote{ExchFeedTime: &observed}); !got.Equal(observed) {
		t.Fatal(got)
	}
	if got := quoteObservedAt(smartapi.Quote{ExchTradeTime: &observed}); !got.Equal(observed) {
		t.Fatal(got)
	}
	if !quoteObservedAt(smartapi.Quote{}).IsZero() {
		t.Fatal("missing exchange time must not become now")
	}
}
