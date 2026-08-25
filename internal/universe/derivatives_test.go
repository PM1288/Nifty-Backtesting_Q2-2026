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

func TestBuildStockDerivativePlanMatchesHyphenatedUnderlying(t *testing.T) {
	expiry := time.Date(2026, time.August, 25, 0, 0, 0, 0, time.UTC)
	insts := []instruments.Instrument{
		{Exchange: "NFO", InstrumentType: "FUTSTK", TradingSymbol: "BAJAJ-AUTO25AUG26FUT", Name: "BAJAJ-AUTO", SymbolToken: "501", Expiry: &expiry},
	}
	equities := []store.Subscription{
		{Exchange: "NSE", SymbolToken: "16669", Mode: "LTP", Kind: "EQUITY", TradingSymbol: "BAJAJ-AUTO-EQ", Underlying: "BAJAJ-AUTO"},
	}

	result, err := BuildStockDerivativePlan(
		groupByUnderlying(insts), equities, config.WSConfig{ModeFutures: "FULL"},
		nil, nil, time.Date(2026, time.August, 23, 0, 0, 0, 0, time.UTC), true, false,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.PlanRows) != 1 || result.PlanRows[0].Underlying != "BAJAJ-AUTO" {
		t.Fatalf("expected hyphenated underlying plan row, got %#v", result.PlanRows)
	}
}

func TestBuildStockDerivativePlanHandlesAdjustedInterleavedStrikeLadders(t *testing.T) {
	expiry := time.Date(2026, time.August, 25, 0, 0, 0, 0, time.UTC)
	var insts []instruments.Instrument
	// This mirrors a corporate-action chain such as HINDPETRO where adjusted
	// .75 strikes coexist with the standard ten-point ladder.
	strikes := []float64{340, 340.75, 350, 350.75, 360, 360.75, 370, 370.75, 380, 380.75, 390}
	for idx, strike := range strikes {
		insts = append(insts,
			instruments.Instrument{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: fmt.Sprintf("HINDPETRO%dCE", idx), Name: "HINDPETRO", SymbolToken: fmt.Sprintf("8%d0", idx), Strike: floatPtr(strike), Expiry: &expiry},
			instruments.Instrument{Exchange: "NFO", InstrumentType: "OPTSTK", TradingSymbol: fmt.Sprintf("HINDPETRO%dPE", idx), Name: "HINDPETRO", SymbolToken: fmt.Sprintf("8%d1", idx), Strike: floatPtr(strike), Expiry: &expiry},
		)
	}
	equities := []store.Subscription{{Exchange: "NSE", SymbolToken: "1406", Mode: "LTP", Kind: "EQUITY", TradingSymbol: "HINDPETRO-EQ", Underlying: "HINDPETRO"}}
	priceProvider := func(string) (float64, bool) { return 369.8, true }

	result, err := BuildStockDerivativePlan(
		groupByUnderlying(insts), equities, config.WSConfig{ModeOptions: "SNAPQUOTE"},
		priceProvider, nil, time.Date(2026, time.August, 24, 0, 0, 0, 0, time.UTC), false, true,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.PlanRows) != 14 {
		t.Fatalf("expected 14 option rows around the actual ATM ladder, got %d", len(result.PlanRows))
	}
	for _, row := range result.PlanRows {
		if row.Strike == nil || row.Right == "" {
			t.Fatalf("adjusted-chain row missing strike/right: %#v", row)
		}
	}
}

func floatPtr(v float64) *float64 {
	return &v
}

func intString(v int) string {
	return fmt.Sprintf("%d", v)
}
