package universe

import (
	"fmt"
	"testing"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
)

func TestInferStrikeStepAndRound(t *testing.T) {
	strikes := []float64{100, 110, 120, 130, 150}
	step := InferStrikeStep(strikes)
	if step != 10 {
		t.Fatalf("expected step 10, got %v", step)
	}
	atm := RoundToStep(1475, 50)
	if atm != 1500 {
		t.Fatalf("expected atm 1500, got %v", atm)
	}
}

func TestResolveDerivativesOptions(t *testing.T) {
	expiry := time.Date(2026, time.January, 30, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCE1450CE", Name: "RELIANCE", SymbolToken: "101", Strike: floatPtr(1450), Expiry: &expiry},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCE1450PE", Name: "RELIANCE", SymbolToken: "102", Strike: floatPtr(1450), Expiry: &expiry},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCE1500CE", Name: "RELIANCE", SymbolToken: "103", Strike: floatPtr(1500), Expiry: &expiry},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCE1500PE", Name: "RELIANCE", SymbolToken: "104", Strike: floatPtr(1500), Expiry: &expiry},
	}
	equitySubs := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "500325", Mode: "LTP", Kind: "EQUITY", TradingSymbol: "RELIANCE-EQ", Underlying: "RELIANCE"},
	}
	cfg := config.UniverseConfig{
		DerivativesExchange: "NFO",
		FNOCurrentMonthOnly: true,
		Options: config.OptionsConfig{
			EnableStockOptions:   true,
			StockUnderlyingsMax:  1,
			ExpiryRankStock:      0,
			StrikesEachSide:      1,
			StrikeRefreshMinutes: 5,
			ATMShiftRebuildSteps: 2,
		},
	}
	wsCfg := config.WSConfig{ModeOptions: "QUOTE"}
	priceProvider := func(underlying string) (float64, bool) { return 1475, true }

	subs, err := ResolveDerivatives(insts, equitySubs, nil, cfg, wsCfg, priceProvider, nil, time.Date(2026, time.January, 11, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(subs) != 4 {
		t.Fatalf("expected 4 option subs, got %d", len(subs))
	}
}

func TestBuildStockDerivativePlanSelectsTwoFuturesAndATMOptions(t *testing.T) {
	expiryCurrent := time.Date(2026, time.January, 27, 0, 0, 0, 0, time.UTC)
	expiryNext := time.Date(2026, time.February, 24, 0, 0, 0, 0, time.UTC)
	optionExpiry := time.Date(2026, time.January, 6, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NFO", InstrumentType: "FUTSTK", TradingSymbol: "RELIANCE27JAN26FUT", Name: "RELIANCE", SymbolToken: "201", Expiry: &expiryCurrent},
		{Exchange: "NFO", InstrumentType: "FUTSTK", TradingSymbol: "RELIANCE24FEB26FUT", Name: "RELIANCE", SymbolToken: "202", Expiry: &expiryNext},
	}
	for idx, strike := range []float64{1400, 1420, 1440, 1460, 1480, 1500, 1520} {
		ceToken := float64(300 + idx*2)
		peToken := float64(301 + idx*2)
		insts = append(insts,
			instruments.Instrument{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: fmt.Sprintf("RELIANCE%.0fCE", strike), Name: "RELIANCE", SymbolToken: intString(int(ceToken)), Strike: floatPtr(strike), Expiry: &optionExpiry},
			instruments.Instrument{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: fmt.Sprintf("RELIANCE%.0fPE", strike), Name: "RELIANCE", SymbolToken: intString(int(peToken)), Strike: floatPtr(strike), Expiry: &optionExpiry},
		)
	}
	byUnderlying := groupByUnderlying(insts)
	equitySubs := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "500325", Mode: "LTP", Kind: "EQUITY", TradingSymbol: "RELIANCE-EQ", Underlying: "RELIANCE"},
	}
	wsCfg := config.WSConfig{ModeFutures: "FULL", ModeOptions: "QUOTE"}
	priceProvider := func(underlying string) (float64, bool) { return 1460, true }

	result, err := BuildStockDerivativePlan(byUnderlying, equitySubs, wsCfg, priceProvider, nil, time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC), true, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.PlanRows) != 16 {
		t.Fatalf("expected 16 plan rows, got %d", len(result.PlanRows))
	}
	futureCount := 0
	optionCount := 0
	var monthlyFutures int
	for _, row := range result.PlanRows {
		switch row.ContractKind {
		case "FUT":
			futureCount++
			if row.IsMonthlyExpiry {
				monthlyFutures++
			}
		case "OPTSTK":
			optionCount++
			if row.SelectionLabel == "option_atm" && row.Strike == nil {
				t.Fatalf("atm option missing strike")
			}
		}
	}
	if futureCount != 2 {
		t.Fatalf("expected 2 futures, got %d", futureCount)
	}
	if optionCount != 14 {
		t.Fatalf("expected 14 options, got %d", optionCount)
	}
	if monthlyFutures != 2 {
		t.Fatalf("expected both futures to be monthly expiries, got %d", monthlyFutures)
	}
}

func TestBuildStockDerivativePlanUsesLastExpiryInMonthForMonthlyFlag(t *testing.T) {
	weekly := time.Date(2026, time.January, 6, 0, 0, 0, 0, time.UTC)
	monthly := time.Date(2026, time.January, 27, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCEWCE", Name: "RELIANCE", SymbolToken: "101", Strike: floatPtr(1400), Expiry: &weekly},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCEWPE", Name: "RELIANCE", SymbolToken: "102", Strike: floatPtr(1400), Expiry: &weekly},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCEMCE", Name: "RELIANCE", SymbolToken: "103", Strike: floatPtr(1400), Expiry: &monthly},
		{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: "RELIANCEMPE", Name: "RELIANCE", SymbolToken: "104", Strike: floatPtr(1400), Expiry: &monthly},
	}
	if isMonthlyExpiry(insts, weekly, time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("expected weekly expiry to not be monthly")
	}
	if !isMonthlyExpiry(insts, monthly, time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("expected last expiry in month to be monthly")
	}
}

func floatPtr(v float64) *float64 {
	return &v
}

func intString(v int) string {
	return fmt.Sprintf("%d", v)
}
