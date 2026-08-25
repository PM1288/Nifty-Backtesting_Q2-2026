package universe

import (
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
)

type PriceProvider func(underlying string) (float64, bool)

type DerivativeSelection struct {
	Subscriptions []store.Subscription
	PlanRows      []store.DerivativeTokenPlanEntry
}

func ResolveDerivatives(insts []instruments.Instrument, equities []store.Subscription, indices []store.Subscription, cfg config.UniverseConfig, wsCfg config.WSConfig, priceProvider PriceProvider, logger *slog.Logger, now time.Time) ([]store.Subscription, error) {
	result, err := ResolveDerivativeSelection(insts, equities, indices, cfg, wsCfg, priceProvider, logger, now)
	if err != nil {
		return nil, err
	}
	return result.Subscriptions, nil
}

func ResolveDerivativeSelection(insts []instruments.Instrument, equities []store.Subscription, indices []store.Subscription, cfg config.UniverseConfig, wsCfg config.WSConfig, priceProvider PriceProvider, logger *slog.Logger, now time.Time) (DerivativeSelection, error) {
	var subs []store.Subscription
	var planRows []store.DerivativeTokenPlanEntry
	if cfg.DerivativesExchange == "" {
		return DerivativeSelection{Subscriptions: subs, PlanRows: planRows}, nil
	}

	fno := filterExchange(insts, cfg.DerivativesExchange)
	byUnderlying := groupByUnderlying(fno)

	if cfg.Futures.EnableStockFutures || cfg.Options.EnableStockOptions {
		stockPlan, err := BuildStockDerivativePlan(byUnderlying, equities, wsCfg, priceProvider, logger, now, cfg.Futures.EnableStockFutures, cfg.Options.EnableStockOptions)
		if err != nil {
			return DerivativeSelection{}, err
		}
		subs = append(subs, stockPlan.Subscriptions...)
		planRows = append(planRows, stockPlan.PlanRows...)
	}

	if cfg.Futures.EnableIndexFutures {
		for _, idx := range indices {
			underlying := NormalizeIndexUnderlying(idx.Underlying)
			futs := filterInstrumentType(byUnderlying[underlying], "FUTIDX")
			if sub := chooseFuture(futs, cfg.Futures.ExpiryRank, cfg.FNOCurrentMonthOnly, now, wsCfg.ModeFutures, "FUT", 30); sub != nil {
				sub.Underlying = underlying
				subs = append(subs, *sub)
			}
		}
	}

	if cfg.Options.EnableIndexOptions {
		for _, name := range cfg.Options.IndexUnderlyings {
			underlying := NormalizeIndexUnderlying(name)
			opts := filterInstrumentType(byUnderlying[underlying], "OPTIDX")
			optSubs := buildOptions(underlying, opts, cfg.Options.ExpiryRankIndex, cfg.FNOCurrentMonthOnly, now, wsCfg.ModeOptions, "OPTIDX", 40, cfg.Options.StrikesEachSide, priceProvider, logger)
			subs = append(subs, optSubs...)
		}
	}

	if cfg.Options.EnableStockOptions {
		// Stock options are now sourced from the persisted stock derivative plan.
	}

	return DerivativeSelection{Subscriptions: subs, PlanRows: planRows}, nil
}

func filterExchange(insts []instruments.Instrument, exchange string) []instruments.Instrument {
	var out []instruments.Instrument
	for _, inst := range insts {
		if strings.EqualFold(inst.Exchange, exchange) {
			out = append(out, inst)
		}
	}
	return out
}

func groupByUnderlying(insts []instruments.Instrument) map[string][]instruments.Instrument {
	out := map[string][]instruments.Instrument{}
	for _, inst := range insts {
		underlying := NormalizeIndexUnderlying(inst.Name)
		if underlying == "" {
			continue
		}
		out[underlying] = append(out[underlying], inst)
	}
	return out
}

func filterInstrumentType(insts []instruments.Instrument, instrumentType string) []instruments.Instrument {
	var out []instruments.Instrument
	for _, inst := range insts {
		if strings.EqualFold(inst.InstrumentType, instrumentType) {
			out = append(out, inst)
		}
	}
	return out
}

func chooseFuture(insts []instruments.Instrument, rank int, currentMonthOnly bool, now time.Time, mode, kind string, priority int) *store.Subscription {
	expiries := sortedExpiries(insts, currentMonthOnly, now)
	if len(expiries) == 0 || rank >= len(expiries) {
		return nil
	}
	expiry := expiries[rank]
	var chosen *instruments.Instrument
	for _, inst := range insts {
		if inst.Expiry != nil && inst.Expiry.Equal(expiry) {
			if chosen == nil || inst.TradingSymbol < chosen.TradingSymbol {
				copyInst := inst
				chosen = &copyInst
			}
		}
	}
	if chosen == nil {
		return nil
	}
	return &store.Subscription{
		Exchange:       chosen.Exchange,
		SymbolToken:    chosen.SymbolToken,
		Mode:           mode,
		Kind:           kind,
		TradingSymbol:  chosen.TradingSymbol,
		Expiry:         chosen.Expiry,
		InstrumentType: chosen.InstrumentType,
		Priority:       priority,
		Active:         true,
	}
}

func BuildStockDerivativePlan(byUnderlying map[string][]instruments.Instrument, equities []store.Subscription, wsCfg config.WSConfig, priceProvider PriceProvider, logger *slog.Logger, now time.Time, enableFutures bool, enableOptions bool) (DerivativeSelection, error) {
	const optionStrikesEachSide = 3
	var result DerivativeSelection
	seen := map[string]struct{}{}
	for _, eq := range equities {
		underlying := strings.ToUpper(strings.TrimSpace(eq.Underlying))
		if underlying == "" {
			underlying = strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(eq.TradingSymbol)), "-EQ")
		}
		if underlying == "" {
			continue
		}
		if _, ok := seen[underlying]; ok {
			continue
		}
		seen[underlying] = struct{}{}

		// Instrument-master grouping normalises separators (for example
		// BAJAJ-AUTO -> BAJAJAUTO). Apply the same normalisation to the cash
		// underlying before lookup so hyphenated F&O names are not omitted.
		chain := byUnderlying[NormalizeIndexUnderlying(underlying)]
		if len(chain) == 0 {
			continue
		}

		if enableFutures {
			futures := filterInstrumentType(chain, "FUTSTK")
			for _, sel := range buildFutureSelections(underlying, futures, wsCfg.ModeFutures, now) {
				result.Subscriptions = append(result.Subscriptions, sel.Subscription)
				result.PlanRows = append(result.PlanRows, sel.PlanRow)
			}
		}

		if enableOptions {
			options := filterInstrumentType(chain, "OPTSTK")
			optionSelections := buildStockOptionSelections(underlying, options, wsCfg.ModeOptions, optionStrikesEachSide, priceProvider, logger, now)
			for _, sel := range optionSelections {
				result.Subscriptions = append(result.Subscriptions, sel.Subscription)
				result.PlanRows = append(result.PlanRows, sel.PlanRow)
			}
		}
	}
	return result, nil
}

type stockDerivativeSelection struct {
	Subscription store.Subscription
	PlanRow      store.DerivativeTokenPlanEntry
}

func buildFutureSelections(underlying string, insts []instruments.Instrument, mode string, now time.Time) []stockDerivativeSelection {
	expiries := sortedExpiries(insts, false, now)
	if len(expiries) == 0 {
		return nil
	}
	limit := 2
	if len(expiries) < limit {
		limit = len(expiries)
	}
	var out []stockDerivativeSelection
	for rank := 0; rank < limit; rank++ {
		expiry := expiries[rank]
		chosen := chooseInstrumentForExpiry(insts, expiry)
		if chosen == nil {
			continue
		}
		label := "future_current"
		priority := 30
		if rank == 1 {
			label = "future_next"
			priority = 31
		}
		sub := store.Subscription{
			Exchange:       chosen.Exchange,
			SymbolToken:    chosen.SymbolToken,
			Mode:           mode,
			Kind:           "FUT",
			TradingSymbol:  chosen.TradingSymbol,
			Underlying:     underlying,
			Expiry:         chosen.Expiry,
			InstrumentType: chosen.InstrumentType,
			Priority:       priority,
			Active:         true,
		}
		out = append(out, stockDerivativeSelection{
			Subscription: sub,
			PlanRow: store.DerivativeTokenPlanEntry{
				Underlying:      underlying,
				Exchange:        chosen.Exchange,
				SymbolToken:     chosen.SymbolToken,
				Mode:            mode,
				TradingSymbol:   chosen.TradingSymbol,
				ContractKind:    "FUT",
				SelectionLabel:  label,
				Expiry:          chosen.Expiry,
				ExpiryRank:      rank,
				IsMonthlyExpiry: isMonthlyExpiry(insts, expiry, now),
				InstrumentType:  chosen.InstrumentType,
				LotSize:         chosen.LotSize,
				Priority:        priority,
				Active:          true,
			},
		})
	}
	return out
}

func buildStockOptionSelections(underlying string, insts []instruments.Instrument, mode string, strikesEachSide int, priceProvider PriceProvider, logger *slog.Logger, now time.Time) []stockDerivativeSelection {
	expiries := sortedExpiries(insts, false, now)
	if len(expiries) == 0 {
		return nil
	}
	// Use the first expiry that has an internally complete CE/PE ladder. The
	// instrument master can temporarily publish an incomplete front expiry
	// around expiry/corporate-action transitions; that must not suppress the
	// underlying's entire options feed.
	var expiry time.Time
	var strikeSet map[float64]struct{}
	var optionsByRight map[string]map[float64]instruments.Instrument
	for _, candidateExpiry := range expiries {
		candidateStrikes := map[float64]struct{}{}
		candidateByRight := map[string]map[float64]instruments.Instrument{}
		for _, inst := range insts {
			if inst.Expiry == nil || !inst.Expiry.Equal(candidateExpiry) || inst.Strike == nil {
				continue
			}
			right := optionRight(inst.TradingSymbol)
			if right == "" {
				continue
			}
			if candidateByRight[right] == nil {
				candidateByRight[right] = map[float64]instruments.Instrument{}
			}
			candidateByRight[right][*inst.Strike] = inst
			candidateStrikes[*inst.Strike] = struct{}{}
		}
		for strike := range candidateStrikes {
			_, hasCE := candidateByRight["CE"][strike]
			_, hasPE := candidateByRight["PE"][strike]
			if hasCE && hasPE {
				expiry = candidateExpiry
				strikeSet = candidateStrikes
				optionsByRight = candidateByRight
				break
			}
		}
		if !expiry.IsZero() {
			break
		}
	}
	if expiry.IsZero() {
		return nil
	}

	// Select from strikes that have both a call and a put. Stock chains can
	// temporarily contain two interleaved ladders after a corporate action
	// (for example 360 and 360.75). Inferring one global step and rounding the
	// spot to it can therefore produce a strike that does not exist, dropping
	// the whole underlying from collection. Walking the actual common strike
	// ladder keeps the ATM neighbourhood valid for both regular and adjusted
	// chains.
	strikes := make([]float64, 0, len(strikeSet))
	for strike := range strikeSet {
		if _, hasCE := optionsByRight["CE"][strike]; !hasCE {
			continue
		}
		if _, hasPE := optionsByRight["PE"][strike]; !hasPE {
			continue
		}
		strikes = append(strikes, strike)
	}
	sort.Float64s(strikes)
	if len(strikes) == 0 {
		return nil
	}
	step := InferStrikeStep(strikes)
	ltp, ok := priceProvider(underlying)
	if !ok || ltp <= 0 {
		if logger != nil {
			logger.Warn("stock_option_plan_missing_price", "underlying", underlying)
		}
		return nil
	}
	atmIndex := nearestStrikeIndex(strikes, ltp)
	var out []stockDerivativeSelection
	start := atmIndex - strikesEachSide
	if start < 0 {
		start = 0
	}
	end := atmIndex + strikesEachSide
	if end >= len(strikes) {
		end = len(strikes) - 1
	}
	for strikeIndex := start; strikeIndex <= end; strikeIndex++ {
		target := strikes[strikeIndex]
		offset := strikeIndex - atmIndex
		for _, right := range []string{"CE", "PE"} {
			inst, ok := optionsByRight[right][target]
			if !ok {
				continue
			}
			label := optionSelectionLabel(offset)
			offsetCopy := offset
			stepCopy := step
			ltpCopy := ltp
			sub := store.Subscription{
				Exchange:       inst.Exchange,
				SymbolToken:    inst.SymbolToken,
				Mode:           mode,
				Kind:           "OPTSTK",
				TradingSymbol:  inst.TradingSymbol,
				Underlying:     underlying,
				Expiry:         inst.Expiry,
				Strike:         inst.Strike,
				Right:          right,
				InstrumentType: inst.InstrumentType,
				Priority:       50 + abs(offset),
				Active:         true,
			}
			out = append(out, stockDerivativeSelection{
				Subscription: sub,
				PlanRow: store.DerivativeTokenPlanEntry{
					Underlying:      underlying,
					Exchange:        inst.Exchange,
					SymbolToken:     inst.SymbolToken,
					Mode:            mode,
					TradingSymbol:   inst.TradingSymbol,
					ContractKind:    "OPTSTK",
					SelectionLabel:  label,
					Expiry:          inst.Expiry,
					ExpiryRank:      0,
					IsMonthlyExpiry: isMonthlyExpiry(insts, expiry, now),
					Strike:          inst.Strike,
					Right:           right,
					StrikeStep:      &stepCopy,
					StrikeOffset:    &offsetCopy,
					UnderlyingPrice: &ltpCopy,
					InstrumentType:  inst.InstrumentType,
					LotSize:         inst.LotSize,
					Priority:        50 + abs(offset),
					Active:          true,
				},
			})
		}
	}
	return out
}

func nearestStrikeIndex(strikes []float64, price float64) int {
	bestIndex := 0
	bestDistance := math.Inf(1)
	for i, strike := range strikes {
		distance := math.Abs(strike - price)
		// Match normal half-up ATM behaviour when two strikes are equidistant.
		if distance < bestDistance || (distance == bestDistance && strike > strikes[bestIndex]) {
			bestIndex = i
			bestDistance = distance
		}
	}
	return bestIndex
}

func chooseInstrumentForExpiry(insts []instruments.Instrument, expiry time.Time) *instruments.Instrument {
	var chosen *instruments.Instrument
	for _, inst := range insts {
		if inst.Expiry != nil && inst.Expiry.Equal(expiry) {
			if chosen == nil || inst.TradingSymbol < chosen.TradingSymbol {
				copyInst := inst
				chosen = &copyInst
			}
		}
	}
	return chosen
}

func isMonthlyExpiry(insts []instruments.Instrument, expiry time.Time, now time.Time) bool {
	expiries := sortedExpiries(insts, false, now)
	var lastInMonth *time.Time
	for _, candidate := range expiries {
		if candidate.Year() != expiry.Year() || candidate.Month() != expiry.Month() {
			continue
		}
		copyCandidate := candidate
		lastInMonth = &copyCandidate
	}
	return lastInMonth != nil && lastInMonth.Equal(expiry)
}

func optionSelectionLabel(offset int) string {
	switch {
	case offset == 0:
		return "option_atm"
	case offset > 0:
		return fmt.Sprintf("option_offset_plus_%d", offset)
	default:
		return fmt.Sprintf("option_offset_minus_%d", -offset)
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func buildOptions(underlying string, insts []instruments.Instrument, expiryRank int, currentMonthOnly bool, now time.Time, mode, kind string, priority int, strikesEachSide int, priceProvider PriceProvider, logger *slog.Logger) []store.Subscription {
	expiries := sortedExpiries(insts, currentMonthOnly, now)
	if len(expiries) == 0 || expiryRank >= len(expiries) {
		return nil
	}
	expiry := expiries[expiryRank]

	strikeSet := map[float64]struct{}{}
	optionsByRight := map[string]map[float64]instruments.Instrument{}
	for _, inst := range insts {
		if inst.Expiry == nil || !inst.Expiry.Equal(expiry) || inst.Strike == nil {
			continue
		}
		right := optionRight(inst.TradingSymbol)
		if right == "" {
			continue
		}
		if optionsByRight[right] == nil {
			optionsByRight[right] = map[float64]instruments.Instrument{}
		}
		optionsByRight[right][*inst.Strike] = inst
		strikeSet[*inst.Strike] = struct{}{}
	}
	if len(strikeSet) == 0 {
		return nil
	}

	strikes := make([]float64, 0, len(strikeSet))
	for strike := range strikeSet {
		strikes = append(strikes, strike)
	}
	sort.Float64s(strikes)
	step := InferStrikeStep(strikes)
	if step <= 0 {
		return nil
	}
	ltp, ok := priceProvider(underlying)
	if !ok || ltp <= 0 {
		if logger != nil {
			logger.Warn("option_atm_missing_price", "underlying", underlying)
		}
		return nil
	}
	atm := RoundToStep(ltp, step)

	selected := map[float64]struct{}{}
	for i := -strikesEachSide; i <= strikesEachSide; i++ {
		target := atm + float64(i)*step
		target = RoundToStep(target, step)
		if _, ok := strikeSet[target]; ok {
			selected[target] = struct{}{}
		}
	}

	var subs []store.Subscription
	for strike := range selected {
		for _, right := range []string{"CE", "PE"} {
			inst, ok := optionsByRight[right][strike]
			if !ok {
				continue
			}
			subs = append(subs, store.Subscription{
				Exchange:       inst.Exchange,
				SymbolToken:    inst.SymbolToken,
				Mode:           mode,
				Kind:           kind,
				TradingSymbol:  inst.TradingSymbol,
				Underlying:     underlying,
				Expiry:         inst.Expiry,
				Strike:         inst.Strike,
				Right:          right,
				InstrumentType: inst.InstrumentType,
				Priority:       priority,
				Active:         true,
			})
		}
	}
	return subs
}

func sortedExpiries(insts []instruments.Instrument, currentMonthOnly bool, now time.Time) []time.Time {
	unique := map[time.Time]struct{}{}
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	for _, inst := range insts {
		if inst.Expiry == nil {
			continue
		}
		expiry := inst.Expiry.In(now.Location())
		if expiry.Before(start) {
			continue
		}
		if currentMonthOnly && (expiry.Year() != now.Year() || expiry.Month() != now.Month()) {
			continue
		}
		unique[expiry] = struct{}{}
	}
	if len(unique) == 0 {
		return nil
	}
	expiries := make([]time.Time, 0, len(unique))
	for expiry := range unique {
		expiries = append(expiries, expiry)
	}
	sort.Slice(expiries, func(i, j int) bool { return expiries[i].Before(expiries[j]) })
	return expiries
}

func InferStrikeStep(strikes []float64) float64 {
	if len(strikes) < 2 {
		return 0
	}
	diffs := map[float64]int{}
	for i := 1; i < len(strikes); i++ {
		diff := strikes[i] - strikes[i-1]
		if diff <= 0 {
			continue
		}
		key := math.Round(diff*100) / 100
		diffs[key]++
	}
	var best float64
	bestCount := 0
	for diff, count := range diffs {
		if count > bestCount || (count == bestCount && diff < best) {
			best = diff
			bestCount = count
		}
	}
	return best
}

func RoundToStep(value, step float64) float64 {
	if step <= 0 {
		return value
	}
	return math.Round(value/step) * step
}

func optionRight(symbol string) string {
	upper := strings.ToUpper(symbol)
	if strings.HasSuffix(upper, "CE") {
		return "CE"
	}
	if strings.HasSuffix(upper, "PE") {
		return "PE"
	}
	return ""
}

func NormalizeIndexUnderlying(value string) string {
	norm := normalizeIndexKey(value)
	switch norm {
	case "NIFTY50", "NIFTY":
		return "NIFTY50"
	case "BANKNIFTY":
		return "BANKNIFTY"
	default:
		if norm == "" {
			return ""
		}
		return norm
	}
}

func ValidateDerivativeUniverse(cfg config.UniverseConfig) error {
	if cfg.DerivativesExchange == "" {
		return fmt.Errorf("derivatives_exchange is required for derivatives")
	}
	return nil
}
