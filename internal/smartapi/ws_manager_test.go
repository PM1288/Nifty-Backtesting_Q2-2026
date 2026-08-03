package smartapi

import (
	"testing"

	"trading-stack/internal/store"
)

func TestApplyCapacityLimits(t *testing.T) {
	subs := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "1", Mode: "LTP", Kind: "INDEX", TradingSymbol: "IDX", Priority: 10},
		{Exchange: "NSE", SymbolToken: "2", Mode: "LTP", Kind: "EQUITY", TradingSymbol: "AAA", Priority: 20},
		{Exchange: "NSE", SymbolToken: "3", Mode: "LTP", Kind: "FUT", TradingSymbol: "BBB", Priority: 30},
		{Exchange: "NSE", SymbolToken: "4", Mode: "LTP", Kind: "OPT", TradingSymbol: "CCC", Priority: 40},
	}
	keep, dropped := applyCapacityLimits(subs, 1, 2)
	if len(keep) != 2 {
		t.Fatalf("expected 2 keep, got %d", len(keep))
	}
	if len(dropped) != 2 {
		t.Fatalf("expected 2 dropped, got %d", len(dropped))
	}
	if keep[0].Priority > keep[1].Priority {
		t.Fatalf("expected keep sorted by priority")
	}
	for _, sub := range dropped {
		if sub.Active {
			t.Fatalf("expected dropped to be inactive")
		}
	}
}
