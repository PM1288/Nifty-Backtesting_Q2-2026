package universe

import (
	"fmt"
	"testing"
	"time"
	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
)

func TestExpandedStockAndCurrentNextIndexCoverage(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	current := now.AddDate(0, 0, 11)
	next := now.AddDate(0, 1, 10)
	var insts []instruments.Instrument
	for index, expiry := range []time.Time{current, next} {
		e := expiry
		insts = append(insts, instruments.Instrument{Exchange: "NFO", InstrumentType: "FUTIDX", Name: "NIFTY", TradingSymbol: fmt.Sprintf("NIFTY%dFUT", index), SymbolToken: fmt.Sprint(index), Expiry: &e})
	}
	for strike := 80; strike <= 120; strike++ {
		for _, right := range []string{"CE", "PE"} {
			s := float64(strike)
			insts = append(insts, instruments.Instrument{Exchange: "NFO", InstrumentType: "OPTSTK", Name: "TEST", TradingSymbol: fmt.Sprintf("TEST%d%s", strike, right), SymbolToken: fmt.Sprintf("%d%s", strike, right), Strike: &s, Expiry: &current})
		}
	}
	cfg := config.UniverseConfig{DerivativesExchange: "NFO", FNOCurrentMonthOnly: true, Futures: config.FuturesConfig{EnableIndexFutures: true}, Options: config.OptionsConfig{EnableStockOptions: true, StockStrikesEachSide: 10}}
	result, err := ResolveDerivativeSelection(insts, []store.Subscription{{Underlying: "TEST"}}, []store.Subscription{{Underlying: "NIFTY"}}, cfg, config.WSConfig{}, func(string) (float64, bool) { return 100, true }, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Subscriptions) != 44 {
		t.Fatalf("wanted 42 options and 2 futures, got %d", len(result.Subscriptions))
	}
	if len(result.PlanRows) != 42 {
		t.Fatalf("all selected options must remain in persisted plan, got %d", len(result.PlanRows))
	}
	for _, row := range result.PlanRows {
		if *row.Strike < 90 || *row.Strike > 110 {
			t.Fatalf("outside ATM +/-10: %v", *row.Strike)
		}
	}
}
