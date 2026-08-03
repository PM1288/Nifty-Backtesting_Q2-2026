package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type niftyWatcherState struct {
	Strategy        string    `json:"strategy"`
	TradeDate       string    `json:"trade_date"`
	Open            bool      `json:"open"`
	Tracking        bool      `json:"tracking"`
	EntryTs         time.Time `json:"entry_ts"`
	ExitTs          time.Time `json:"exit_ts"`
	ExitReason      string    `json:"exit_reason"`
	Underlying      string    `json:"underlying"`
	UnderlyingPrice float64   `json:"underlying_price"`
	Level           float64   `json:"level"`
	Strike          float64   `json:"strike"`
	CEToken         string    `json:"ce_token"`
	PEToken         string    `json:"pe_token"`
	CEExchange      string    `json:"ce_exchange"`
	PEExchange      string    `json:"pe_exchange"`
	CEPrice         float64   `json:"ce_price"`
	PEPrice         float64   `json:"pe_price"`
	Qty             int64     `json:"qty"`
	LotSize         int       `json:"lot_size"`
	Lots            int       `json:"lots"`
	MaxPnL          float64   `json:"max_pnl"`
	MaxPnLTs        time.Time `json:"max_pnl_ts"`
	MaxLoss         float64   `json:"max_loss"`
	MaxLossTs       time.Time `json:"max_loss_ts"`
	RunID           int64     `json:"run_id"`
	LastEntryKey    string    `json:"last_entry_key"`
	EODRecorded     bool      `json:"eod_recorded"`
}

var niftyWatcherStrategies = []string{
	"equilibrium_diff_gt60",
	"rsi80_willr40",
	"near_100_rsi_low",
	"near_100_rsi_high",
}

const manualOptionDefaultTargetRupees = 400.0
const manualOptionDefaultStrategy = "option_manual_paper"

func normalizeValue(value, min, max float64) float64 {
	if max <= min {
		return 50
	}
	norm := (value - min) / (max - min) * 100
	if norm < 0 {
		return 0
	}
	if norm > 100 {
		return 100
	}
	return norm
}

func (e *Engine) runNiftyWatcher(ctx context.Context, now time.Time) error {
	cfg := e.cfg.NiftyWatcher
	if !cfg.Enable || e.loc == nil {
		return nil
	}

	local := now.In(e.loc)
	dateKey := local.Format("2006-01-02")
	entryStart, err := parseDailyTime(local, cfg.EntryStart, e.loc)
	if err != nil {
		return err
	}
	entryEnd, err := parseDailyTime(local, cfg.EntryEnd, e.loc)
	if err != nil {
		return err
	}
	exitAt, err := parseDailyTime(local, cfg.ExitTime, e.loc)
	if err != nil {
		return err
	}
	runManual := func() error {
		return e.runManualNiftyWatcher(ctx, now, local, entryStart, entryEnd, exitAt, cfg)
	}

	token := strings.TrimSpace(cfg.IndexToken)
	if token == "" {
		return runManual()
	}

	priceMap, err := fetchInstrumentPrices(ctx, e.store, "NSE", []string{token})
	if err != nil {
		return err
	}
	price := priceMap[token]
	if price <= 0 {
		return runManual()
	}

	lookback := time.Duration(cfg.LookbackMinutes) * time.Minute
	start := local.Add(-lookback)
	barsByToken, err := fetchMinuteBars(ctx, e.store, "NSE", []string{token}, start)
	if err != nil {
		return err
	}
	bars := barsByToken[token]
	closes := extractMinuteCloses(bars)
	highs := extractMinuteHighs(bars)
	lows := extractMinuteLows(bars)
	rsiVal := rsi(closes, cfg.RSIPeriod)
	willrVal := willr(highs, lows, closes, cfg.WILLRPeriod)

	step := cfg.Step
	if step <= 0 {
		step = 100
	}
	buffer := cfg.Buffer
	if buffer < 0 {
		buffer = 0
	}
	level := math.Round(price/step) * step
	nearLevel := math.Abs(price-level) <= buffer

	underlying := strings.ToUpper(strings.TrimSpace(cfg.Underlying))
	if underlying == "" {
		underlying = "NIFTY50"
	}

	contractsByUnderlying, err := fetchOptionContracts(ctx, e.store, []string{underlying})
	if err != nil {
		return err
	}
	contracts := filterOptionContractsByKind(contractsByUnderlying[underlying], "OPTIDX")
	if len(contracts) == 0 {
		return runManual()
	}

	ceATM, okCE := selectOptionContract(contracts, price, "CE", cfg.ExpiryRank, 0, now, e.loc)
	_, okPE := selectOptionContract(contracts, price, "PE", cfg.ExpiryRank, 0, now, e.loc)
	if !okCE || !okPE {
		return runManual()
	}

	expiry := ceATM.Expiry
	strike := ceATM.Strike

	ce := pickOptionByStrike(contracts, expiry, strike, "CE")
	pe := pickOptionByStrike(contracts, expiry, strike, "PE")
	if ce.Token == "" || pe.Token == "" {
		return runManual()
	}

	tokensByExchange := map[string][]string{ce.Exchange: {ce.Token}, pe.Exchange: {pe.Token}}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return err
	}
	ceQuote := quotes[ce.Token]
	peQuote := quotes[pe.Token]
	if ceQuote.Price <= 0 || peQuote.Price <= 0 {
		return runManual()
	}

	normClock := cfg.NormalizationStart
	if strings.TrimSpace(normClock) == "" {
		normClock = "09:15"
	}
	normStart, err := parseDailyTime(local, normClock, e.loc)
	if err != nil {
		return err
	}
	openStart, err := parseDailyTime(local, "09:15", e.loc)
	if err != nil {
		return err
	}

	var ceNorm, peNorm, normDiff float64
	var ceNormPtr, peNormPtr, normDiffPtr *float64

	ceMin, ceMax, ok, err := fetchMinuteCloseMinMax(ctx, e.store, ce.Exchange, ce.Token, normStart)
	if err != nil {
		return err
	}
	if !ok {
		ceMin, ceMax, ok, err = fetchMinuteCloseMinMax(ctx, e.store, ce.Exchange, ce.Token, openStart)
		if err != nil {
			return err
		}
	}
	if ok {
		v := normalizeValue(ceQuote.Price, ceMin, ceMax)
		ceNorm = v
		ceNormPtr = &ceNorm
	}

	peMin, peMax, ok, err := fetchMinuteCloseMinMax(ctx, e.store, pe.Exchange, pe.Token, normStart)
	if err != nil {
		return err
	}
	if !ok {
		peMin, peMax, ok, err = fetchMinuteCloseMinMax(ctx, e.store, pe.Exchange, pe.Token, openStart)
		if err != nil {
			return err
		}
	}
	if ok {
		v := normalizeValue(peQuote.Price, peMin, peMax)
		peNorm = v
		peNormPtr = &peNorm
	}

	if ceNormPtr != nil && peNormPtr != nil {
		normDiff = math.Abs(ceNorm - peNorm)
		normDiffPtr = &normDiff
	}

	ceAngle, peAngle := math.NaN(), math.NaN()
	if cfg.SlopeGuardEnable {
		ceBarsByToken, err := fetchMinuteBars(ctx, e.store, ce.Exchange, []string{ce.Token}, normStart)
		if err == nil {
			ceAngle = slopeAngleFromBars(ceBarsByToken[ce.Token], normStart, local)
		}
		peBarsByToken, err := fetchMinuteBars(ctx, e.store, pe.Exchange, []string{pe.Token}, normStart)
		if err == nil {
			peAngle = slopeAngleFromBars(peBarsByToken[pe.Token], normStart, local)
		}
		if slopeGuardBlocks(ceAngle, peAngle, cfg.SlopeGuardMinAngle) {
			return runManual()
		}
	}

	lotSizes, _ := fetchInstrumentLotSizes(ctx, e.store, []string{ce.Token, pe.Token})
	lotSize := lotSizes[ce.Token]
	if lotSize == 0 {
		lotSize = lotSizes[pe.Token]
	}
	if lotSize == 0 {
		lotSize = cfg.LotSize
	}
	lots := cfg.Lots
	if lots <= 0 {
		lots = 1
	}
	qty := int64(lotSize * lots)
	if qty <= 0 {
		return runManual()
	}

	scenarioHits := map[string]bool{
		"equilibrium_diff_gt60": normDiffPtr != nil && normDiff >= cfg.EquilibriumDiffThreshold && cfg.EquilibriumDiffThreshold > 0,
		"rsi80_willr40":         cfg.IncludeRSI80WillR40 && rsiVal > 80 && willrVal > -40,
		"near_100_rsi_low":      nearLevel && rsiVal > 0 && rsiVal < cfg.RSILowThreshold,
		"near_100_rsi_high":     nearLevel && rsiVal > cfg.RSIHighThreshold,
	}

	for _, strategyName := range niftyWatcherStrategies {
		state, _ := e.loadNiftyWatcherState(ctx, strategyName)
		if state == nil {
			state = &niftyWatcherState{Strategy: strategyName}
		}
		if state.TradeDate != dateKey && !state.Open && !state.Tracking {
			state = &niftyWatcherState{Strategy: strategyName}
		}
		state.TradeDate = dateKey

		if state.Open {
			if err := e.updateWatcherMax(ctx, state, ceQuote.Price, peQuote.Price, qty, local); err != nil {
				return err
			}
			exited, err := e.maybeExitWatcher(ctx, state, ceQuote.Price, peQuote.Price, qty, local, exitAt, cfg)
			if err != nil {
				return err
			}
			if exited {
				if e.logger != nil {
					e.logger.Info("nifty_watcher_exit", "strategy", strategyName, "reason", state.ExitReason, "pnl", state.MaxPnL)
				}
			}
			continue
		}

		if state.Tracking {
			if err := e.updateWatcherMax(ctx, state, ceQuote.Price, peQuote.Price, qty, local); err != nil {
				return err
			}
			if !state.EODRecorded && !local.Before(exitAt) {
				if err := e.finalizeWatcherEOD(ctx, state, ceQuote.Price, peQuote.Price, qty, local); err != nil {
					return err
				}
			}
			continue
		}

		if local.Before(entryStart) || local.After(entryEnd) {
			continue
		}
		if !scenarioHits[strategyName] {
			continue
		}

		entryKey := dateKey
		if strategyName == "near_100_rsi_low" || strategyName == "near_100_rsi_high" {
			entryKey = fmt.Sprintf("%s-%.0f", dateKey, level)
		}
		if state.LastEntryKey == entryKey {
			continue
		}

		entryTs := now.UTC()
		entryCombo := ceQuote.Price + peQuote.Price

		orders, trades, positions := buildWatcherEntryOrders(strategyName, ce, pe, ceQuote.Price, peQuote.Price, qty, entryTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps, map[string]any{
			"strategy":      strategyName,
			"manual_trade":  false,
			"underlying":    underlying,
			"price":         price,
			"level":         level,
			"strike":        strike,
			"rsi":           rsiVal,
			"willr":         willrVal,
			"ce_norm":       ceNorm,
			"pe_norm":       peNorm,
			"norm_diff":     normDiff,
			"ce_slope":      ceAngle,
			"pe_slope":      peAngle,
			"max_pnl":       0,
			"max_loss":      0,
			"target_rupees": cfg.TargetRupees,
		})
		if len(orders) == 0 {
			continue
		}
		if err := e.store.RecordPaperBatch(ctx, orders, trades, positions); err != nil {
			return err
		}
		runID, err := e.store.InsertNiftyWatcherRun(ctx, store.NiftyWatcherRun{
			Strategy:        strategyName,
			TradeDate:       time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC),
			EntryTs:         entryTs,
			Underlying:      underlying,
			UnderlyingPrice: &price,
			Level:           &level,
			Strike:          &strike,
			CEToken:         &ce.Token,
			PEToken:         &pe.Token,
			CESymbol:        &ce.TradingSymbol,
			PESymbol:        &pe.TradingSymbol,
			CEPrice:         &ceQuote.Price,
			PEPrice:         &peQuote.Price,
			Qty:             qty,
			EntryCombo:      &entryCombo,
			MaxLoss:         floatPtr(0),
			MaxLossTs:       &entryTs,
			RSI:             &rsiVal,
			WILLR:           &willrVal,
			CENorm:          ceNormPtr,
			PENorm:          peNormPtr,
			NormDiff:        normDiffPtr,
			TargetRupees:    &cfg.TargetRupees,
			Raw:             mustJSON(map[string]any{"strategy": strategyName, "entry": entryCombo}),
		})
		if err != nil {
			return err
		}

		state.Open = true
		state.Tracking = true
		state.EntryTs = entryTs
		state.ExitTs = time.Time{}
		state.ExitReason = ""
		state.Underlying = underlying
		state.UnderlyingPrice = price
		state.Level = level
		state.Strike = strike
		state.CEToken = ce.Token
		state.PEToken = pe.Token
		state.CEExchange = ce.Exchange
		state.PEExchange = pe.Exchange
		state.CEPrice = ceQuote.Price
		state.PEPrice = peQuote.Price
		state.Qty = qty
		state.LotSize = lotSize
		state.Lots = lots
		state.MaxPnL = 0
		state.MaxPnLTs = entryTs
		state.MaxLoss = 0
		state.MaxLossTs = entryTs
		state.RunID = runID
		state.LastEntryKey = entryKey
		state.EODRecorded = false

		if e.logger != nil {
			e.logger.Info("nifty_watcher_entry", "strategy", strategyName, "price", price, "strike", strike, "ce", ce.TradingSymbol, "pe", pe.TradingSymbol)
		}
		e.sendNiftyWatcherAlert(ctx, "ENTRY", strategyName, fmt.Sprintf("NIFTY %.2f L%.0f S%.0f RSI %.1f W %.1f ND %.1f", price, level, strike, rsiVal, willrVal, normDiff))
		if err := e.persistNiftyWatcherState(ctx, now, state, "open"); err != nil {
			return err
		}
	}
	return runManual()
}

func (e *Engine) maybeExitWatcher(ctx context.Context, state *niftyWatcherState, cePrice, pePrice float64, qty int64, local, exitAt time.Time, cfg config.NiftyWatcherConfig) (bool, error) {
	gross := (cePrice - state.CEPrice + pePrice - state.PEPrice) * float64(qty)
	exitReason := ""
	if cfg.TargetRupees > 0 && (gross >= cfg.TargetRupees || state.MaxPnL >= cfg.TargetRupees) {
		exitReason = "target"
	} else if !local.Before(exitAt) {
		exitReason = "eod"
	}
	if exitReason == "" {
		return false, nil
	}

	exitTs := local.UTC()
	state.ExitReason = exitReason
	exitMeta := map[string]any{
		"strategy":       state.Strategy,
		"exit_reason":    state.ExitReason,
		"underlying":     state.Underlying,
		"underlying_px":  state.UnderlyingPrice,
		"strike":         state.Strike,
		"rsi":            nil,
		"willr":          nil,
		"ce_norm":        nil,
		"pe_norm":        nil,
		"norm_diff":      nil,
		"max_pnl":        state.MaxPnL,
		"max_loss":       state.MaxLoss,
		"entry_time":     state.EntryTs.UTC().Format(time.RFC3339),
		"exit_time":      exitTs.UTC().Format(time.RFC3339),
		"trade_pnl":      gross,
		"target_rupees":  cfg.TargetRupees,
		"manual_trade":   false,
		"watcher_run_id": state.RunID,
	}
	exitOrders, exitTrades, posUpdates := buildWatcherExitOrders(state.Strategy, state, cePrice, pePrice, exitTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps, exitMeta)
	if len(exitOrders) == 0 {
		return false, nil
	}
	if err := e.store.RecordPaperBatch(ctx, exitOrders, exitTrades, posUpdates); err != nil {
		return false, err
	}

	if state.RunID > 0 {
		exitCombo := cePrice + pePrice
		if err := e.store.UpdateNiftyWatcherRunExit(ctx, state.RunID, exitTs, exitReason, exitCombo, gross, state.MaxPnL, optionalTime(state.MaxPnLTs), state.MaxLoss, optionalTime(state.MaxLossTs)); err != nil {
			return false, err
		}
	}

	state.Open = false
	state.ExitTs = exitTs
	if exitReason == "eod" {
		state.Tracking = false
		state.EODRecorded = true
	}

	e.sendNiftyWatcherAlert(ctx, "EXIT", state.Strategy, fmt.Sprintf("%s pnl=%.2f max=%.2f min=%.2f", strings.ToUpper(exitReason), gross, state.MaxPnL, state.MaxLoss))
	return true, e.persistNiftyWatcherState(ctx, exitTs, state, "closed")
}

func (e *Engine) updateWatcherMax(ctx context.Context, state *niftyWatcherState, cePrice, pePrice float64, qty int64, local time.Time) error {
	gross := (cePrice - state.CEPrice + pePrice - state.PEPrice) * float64(qty)
	changed := false
	if gross > state.MaxPnL {
		state.MaxPnL = gross
		state.MaxPnLTs = local.UTC()
		changed = true
	}
	if gross < state.MaxLoss {
		state.MaxLoss = gross
		state.MaxLossTs = local.UTC()
		changed = true
	}
	if !changed {
		return nil
	}
	if state.RunID > 0 {
		if err := e.store.UpdateNiftyWatcherRunTrack(ctx, state.RunID, state.MaxPnL, optionalTime(state.MaxPnLTs), state.MaxLoss, optionalTime(state.MaxLossTs)); err != nil {
			return err
		}
	}
	return e.persistNiftyWatcherState(ctx, local, state, "tracking")
}

func (e *Engine) updateManualWatcherMax(ctx context.Context, state *store.ManualOptionTradeState, local time.Time) error {
	changed := false
	if state.PnL > state.MaxPnL {
		state.MaxPnL = state.PnL
		ts := local.UTC()
		state.MaxPnLTs = &ts
		changed = true
	}
	if state.PnL < state.MaxLoss {
		state.MaxLoss = state.PnL
		ts := local.UTC()
		state.MaxLossTs = &ts
		changed = true
	}
	if !changed {
		return nil
	}
	if state.RunID > 0 {
		if err := e.store.UpdateNiftyWatcherRunTrack(ctx, state.RunID, state.MaxPnL, state.MaxPnLTs, state.MaxLoss, state.MaxLossTs); err != nil {
			return err
		}
	}
	return nil
}

func (e *Engine) mapManualToWatcherState(state *store.ManualOptionTradeState) *niftyWatcherState {
	entryTs := state.RequestedAt
	if state.OpenedAt != nil && !state.OpenedAt.IsZero() {
		entryTs = *state.OpenedAt
	}
	maxPnLTs := time.Time{}
	if state.MaxPnLTs != nil {
		maxPnLTs = *state.MaxPnLTs
	}
	maxLossTs := time.Time{}
	if state.MaxLossTs != nil {
		maxLossTs = *state.MaxLossTs
	}
	return &niftyWatcherState{
		Strategy:        state.Strategy,
		EntryTs:         entryTs,
		ExitReason:      state.CloseReason,
		Underlying:      state.Underlying,
		UnderlyingPrice: state.NiftyPrice,
		Level:           0,
		Strike:          state.Strike,
		CEToken:         state.CEToken,
		PEToken:         state.PEToken,
		CEExchange:      state.CEExchange,
		PEExchange:      state.PEExchange,
		CEPrice:         state.EntryCE,
		PEPrice:         state.EntryPE,
		Qty:             state.Qty,
		LotSize:         state.LotSize,
		Lots:            state.Lots,
		MaxPnL:          state.MaxPnL,
		MaxPnLTs:        maxPnLTs,
		MaxLoss:         state.MaxLoss,
		MaxLossTs:       maxLossTs,
		RunID:           state.RunID,
	}
}

func (e *Engine) manualStateValue(state *store.ManualOptionTradeState) string {
	status := strings.ToLower(strings.TrimSpace(state.Status))
	switch status {
	case "open", "tracking", "closed", "error":
		return status
	default:
		return "pending"
	}
}

func (e *Engine) persistManualOptionState(ctx context.Context, ts time.Time, state *store.ManualOptionTradeState) error {
	if state == nil {
		return nil
	}
	state.ID = strings.TrimSpace(state.ID)
	if state.ID == "" {
		return nil
	}
	state.UpdatedAt = ts.UTC()
	if state.CreatedAt.IsZero() {
		state.CreatedAt = ts.UTC()
	}
	raw, _ := json.Marshal(state)
	return e.store.UpsertStrategyStates(ctx, []store.StrategyState{{
		Ts:    ts.UTC(),
		Name:  store.ManualOptionStateName(state.ID),
		Value: e.manualStateValue(state),
		Raw:   raw,
	}})
}

func (e *Engine) loadManualOptionStates(ctx context.Context, limit int) ([]store.ManualOptionTradeState, error) {
	latest, err := e.store.ListLatestStrategyStatesByPrefix(ctx, store.ManualOptionStatePrefix, limit)
	if err != nil {
		return nil, err
	}
	out := make([]store.ManualOptionTradeState, 0, len(latest))
	for _, st := range latest {
		var state store.ManualOptionTradeState
		if len(st.Raw) > 0 {
			if err := json.Unmarshal(st.Raw, &state); err != nil {
				continue
			}
		}
		state.ID = strings.TrimSpace(state.ID)
		if state.ID == "" {
			state.ID = strings.TrimPrefix(strings.TrimSpace(st.Name), store.ManualOptionStatePrefix)
		}
		if state.ID == "" {
			continue
		}
		if state.CreatedAt.IsZero() {
			state.CreatedAt = st.Ts.UTC()
		}
		if state.UpdatedAt.IsZero() {
			state.UpdatedAt = st.Ts.UTC()
		}
		if state.RequestedAt.IsZero() {
			state.RequestedAt = state.CreatedAt
		}
		out = append(out, state)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].RequestedAt.Before(out[j].RequestedAt)
	})
	return out, nil
}

func (e *Engine) runManualNiftyWatcher(ctx context.Context, now, local, entryStart, entryEnd, exitAt time.Time, cfg config.NiftyWatcherConfig) error {
	states, err := e.loadManualOptionStates(ctx, 500)
	if err != nil || len(states) == 0 {
		return err
	}
	for i := range states {
		state := &states[i]
		status := strings.ToLower(strings.TrimSpace(state.Status))
		if status == "" {
			status = "pending"
		}
		state.Status = status
		if strings.TrimSpace(state.Strategy) == "" {
			state.Strategy = manualOptionDefaultStrategy
		}
		if state.TargetRupees <= 0 {
			state.TargetRupees = manualOptionDefaultTargetRupees
		}
		if state.Lots <= 0 {
			state.Lots = 1
		}
		if state.LotSize <= 0 {
			if cfg.LotSize > 0 {
				state.LotSize = cfg.LotSize
			} else {
				state.LotSize = 65
			}
		}
		if strings.TrimSpace(state.Underlying) == "" {
			state.Underlying = strings.ToUpper(strings.TrimSpace(cfg.Underlying))
			if state.Underlying == "" {
				state.Underlying = "NIFTY50"
			}
		} else {
			state.Underlying = strings.ToUpper(strings.TrimSpace(state.Underlying))
		}
		if strings.TrimSpace(state.IndexToken) == "" {
			state.IndexToken = strings.TrimSpace(cfg.IndexToken)
		}
		if state.RequestedAt.IsZero() {
			state.RequestedAt = now.UTC()
		}

		switch status {
		case "closed", "error":
			continue
		case "pending":
			if state.CloseRequested {
				state.Status = "closed"
				state.CloseReason = "cancelled"
				closedAt := now.UTC()
				state.ClosedAt = &closedAt
				if err := e.persistManualOptionState(ctx, now, state); err != nil {
					return err
				}
				continue
			}
			if local.Before(entryStart) || local.After(entryEnd) {
				continue
			}
			if err := e.openManualNiftyWatcherTrade(ctx, now, local, state, cfg); err != nil {
				state.Status = "error"
				state.Error = err.Error()
				_ = e.persistManualOptionState(ctx, now, state)
				continue
			}
			if err := e.persistManualOptionState(ctx, now, state); err != nil {
				return err
			}
		default:
			if err := e.trackManualNiftyWatcherTrade(ctx, now, local, exitAt, state, cfg); err != nil {
				state.Status = "error"
				state.Error = err.Error()
				_ = e.persistManualOptionState(ctx, now, state)
				continue
			}
			if err := e.persistManualOptionState(ctx, now, state); err != nil {
				return err
			}
		}
	}
	return nil
}

func (e *Engine) openManualNiftyWatcherTrade(ctx context.Context, now, local time.Time, state *store.ManualOptionTradeState, cfg config.NiftyWatcherConfig) error {
	token := strings.TrimSpace(state.IndexToken)
	price := state.NiftyPrice
	if token != "" {
		priceMap, err := fetchInstrumentPrices(ctx, e.store, "NSE", []string{token})
		if err != nil {
			return err
		}
		if px := priceMap[token]; px > 0 {
			price = px
		}
	}
	if price <= 0 && state.Strike > 0 {
		price = state.Strike
	}
	if price <= 0 {
		return fmt.Errorf("underlying price unavailable")
	}

	contractsByUnderlying, err := fetchOptionContracts(ctx, e.store, []string{state.Underlying})
	if err != nil {
		return err
	}
	contracts := filterOptionContractsByKind(contractsByUnderlying[state.Underlying], "OPTIDX")
	if len(contracts) == 0 {
		contracts = contractsByUnderlying[state.Underlying]
	}
	if len(contracts) == 0 {
		return fmt.Errorf("no option contracts for %s", state.Underlying)
	}

	ceATM, okCE := selectOptionContract(contracts, price, "CE", cfg.ExpiryRank, 0, now, e.loc)
	_, okPE := selectOptionContract(contracts, price, "PE", cfg.ExpiryRank, 0, now, e.loc)
	if !okCE || !okPE {
		return fmt.Errorf("unable to resolve ATM contracts")
	}
	expiry := ceATM.Expiry
	if state.Expiry != nil && !state.Expiry.IsZero() {
		expiry = *state.Expiry
	}
	strike := state.Strike
	if strike <= 0 {
		strike = ceATM.Strike
	}
	ce := pickOptionByStrike(contracts, expiry, strike, "CE")
	pe := pickOptionByStrike(contracts, expiry, strike, "PE")
	if ce.Token == "" {
		ce = pickNearestOptionByStrike(contracts, expiry, strike, "CE")
	}
	if pe.Token == "" {
		pe = pickNearestOptionByStrike(contracts, expiry, strike, "PE")
	}
	if ce.Token == "" || pe.Token == "" {
		allQuotes, err := fetchQuotesForContracts(ctx, e.store, contracts)
		if err != nil {
			return err
		}
		liquidCE, liquidPE, _, _, ok := pickLiquidOptionPair(contracts, allQuotes, expiry, strike)
		if !ok {
			return fmt.Errorf("unable to resolve CE/PE contracts")
		}
		ce, pe = liquidCE, liquidPE
		expiry = ce.Expiry
		strike = ce.Strike
	}

	tokensByExchange := map[string][]string{ce.Exchange: {ce.Token}, pe.Exchange: {pe.Token}}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return err
	}
	ceQuote := quotes[ce.Token]
	peQuote := quotes[pe.Token]
	if ceQuote.Price <= 0 || peQuote.Price <= 0 {
		allQuotes, err := fetchQuotesForContracts(ctx, e.store, contracts)
		if err != nil {
			return err
		}
		liquidCE, liquidPE, liquidCEQuote, liquidPEQuote, ok := pickLiquidOptionPair(contracts, allQuotes, expiry, strike)
		if !ok {
			return fmt.Errorf("live CE/PE prices unavailable")
		}
		ce = liquidCE
		pe = liquidPE
		ceQuote = liquidCEQuote
		peQuote = liquidPEQuote
		expiry = ce.Expiry
		strike = ce.Strike
	}

	var rsiPtr, willrPtr *float64
	lookback := time.Duration(cfg.LookbackMinutes) * time.Minute
	start := local.Add(-lookback)
	if token != "" {
		barsByToken, err := fetchMinuteBars(ctx, e.store, "NSE", []string{token}, start)
		if err == nil {
			bars := barsByToken[token]
			closes := extractMinuteCloses(bars)
			highs := extractMinuteHighs(bars)
			lows := extractMinuteLows(bars)
			if len(closes) >= cfg.RSIPeriod+1 {
				v := rsi(closes, cfg.RSIPeriod)
				rsiPtr = &v
			}
			if len(closes) >= cfg.WILLRPeriod+1 {
				v := willr(highs, lows, closes, cfg.WILLRPeriod)
				willrPtr = &v
			}
		}
	}

	normClock := cfg.NormalizationStart
	if strings.TrimSpace(normClock) == "" {
		normClock = "09:15"
	}
	normStart, err := parseDailyTime(local, normClock, e.loc)
	if err != nil {
		return err
	}
	openStart, err := parseDailyTime(local, "09:15", e.loc)
	if err != nil {
		return err
	}
	var ceNorm, peNorm, normDiff float64
	var ceNormPtr, peNormPtr, normDiffPtr *float64
	ceMin, ceMax, ok, err := fetchMinuteCloseMinMax(ctx, e.store, ce.Exchange, ce.Token, normStart)
	if err != nil {
		return err
	}
	if !ok {
		ceMin, ceMax, ok, err = fetchMinuteCloseMinMax(ctx, e.store, ce.Exchange, ce.Token, openStart)
		if err != nil {
			return err
		}
	}
	if ok {
		v := normalizeValue(ceQuote.Price, ceMin, ceMax)
		ceNorm = v
		ceNormPtr = &ceNorm
	}
	peMin, peMax, ok, err := fetchMinuteCloseMinMax(ctx, e.store, pe.Exchange, pe.Token, normStart)
	if err != nil {
		return err
	}
	if !ok {
		peMin, peMax, ok, err = fetchMinuteCloseMinMax(ctx, e.store, pe.Exchange, pe.Token, openStart)
		if err != nil {
			return err
		}
	}
	if ok {
		v := normalizeValue(peQuote.Price, peMin, peMax)
		peNorm = v
		peNormPtr = &peNorm
	}
	if ceNormPtr != nil && peNormPtr != nil {
		v := math.Abs(ceNorm - peNorm)
		normDiff = v
		normDiffPtr = &normDiff
	}

	if cfg.SlopeGuardEnable {
		ceBarsByToken, _ := fetchMinuteBars(ctx, e.store, ce.Exchange, []string{ce.Token}, normStart)
		peBarsByToken, _ := fetchMinuteBars(ctx, e.store, pe.Exchange, []string{pe.Token}, normStart)
		ceAngle := slopeAngleFromBars(ceBarsByToken[ce.Token], normStart, local)
		peAngle := slopeAngleFromBars(peBarsByToken[pe.Token], normStart, local)
		if slopeGuardBlocks(ceAngle, peAngle, cfg.SlopeGuardMinAngle) {
			return fmt.Errorf("entry blocked by slope guard (ce=%.1f pe=%.1f)", ceAngle, peAngle)
		}
	}

	lotSizes, _ := fetchInstrumentLotSizes(ctx, e.store, []string{ce.Token, pe.Token})
	lotSize := lotSizes[ce.Token]
	if lotSize == 0 {
		lotSize = lotSizes[pe.Token]
	}
	if lotSize == 0 {
		lotSize = state.LotSize
	}
	if lotSize == 0 {
		lotSize = cfg.LotSize
	}
	if lotSize == 0 {
		lotSize = 65
	}
	lots := state.Lots
	if lots <= 0 {
		lots = 1
	}
	qty := int64(lotSize * lots)
	if qty <= 0 {
		return fmt.Errorf("invalid quantity")
	}

	entryTs := now.UTC()
	entryCombo := ceQuote.Price + peQuote.Price
	meta := map[string]any{
		"strategy":        state.Strategy,
		"manual_trade":    true,
		"manual_trade_id": state.ID,
		"underlying":      state.Underlying,
		"price":           price,
		"strike":          strike,
		"entry_time":      entryTs.Format(time.RFC3339),
		"rsi":             rsiPtr,
		"willr":           willrPtr,
		"ce_norm":         ceNormPtr,
		"pe_norm":         peNormPtr,
		"norm_diff":       normDiffPtr,
		"target_rupees":   state.TargetRupees,
	}
	orders, trades, positions := buildWatcherEntryOrders(state.Strategy, ce, pe, ceQuote.Price, peQuote.Price, qty, entryTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps, meta)
	if len(orders) == 0 {
		return fmt.Errorf("no entry orders generated")
	}
	if err := e.store.RecordPaperBatch(ctx, orders, trades, positions); err != nil {
		return err
	}

	runID, err := e.store.InsertNiftyWatcherRun(ctx, store.NiftyWatcherRun{
		Strategy:        state.Strategy,
		TradeDate:       time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC),
		EntryTs:         entryTs,
		Underlying:      state.Underlying,
		UnderlyingPrice: &price,
		Strike:          &strike,
		CEToken:         &ce.Token,
		PEToken:         &pe.Token,
		CESymbol:        &ce.TradingSymbol,
		PESymbol:        &pe.TradingSymbol,
		CEPrice:         &ceQuote.Price,
		PEPrice:         &peQuote.Price,
		Qty:             qty,
		EntryCombo:      &entryCombo,
		MaxLoss:         floatPtr(0),
		MaxLossTs:       &entryTs,
		RSI:             rsiPtr,
		WILLR:           willrPtr,
		CENorm:          ceNormPtr,
		PENorm:          peNormPtr,
		NormDiff:        normDiffPtr,
		TargetRupees:    &state.TargetRupees,
		Raw:             mustJSON(map[string]any{"manual_trade": true, "manual_trade_id": state.ID}),
	})
	if err != nil {
		return err
	}

	state.RunID = runID
	state.Status = "open"
	state.Error = ""
	state.NiftyPrice = price
	state.Strike = strike
	expiryUTC := expiry.UTC()
	state.Expiry = &expiryUTC
	state.CEExchange = ce.Exchange
	state.PEExchange = pe.Exchange
	state.CEToken = ce.Token
	state.PEToken = pe.Token
	state.CESymbol = ce.TradingSymbol
	state.PESymbol = pe.TradingSymbol
	state.EntryCE = ceQuote.Price
	state.EntryPE = peQuote.Price
	state.EntryCombo = entryCombo
	state.CurrentCE = ceQuote.Price
	state.CurrentPE = peQuote.Price
	state.CurrentCombo = entryCombo
	state.LotSize = lotSize
	state.Lots = lots
	state.Qty = qty
	state.RSI = rsiPtr
	state.WILLR = willrPtr
	state.CENorm = ceNormPtr
	state.PENorm = peNormPtr
	state.NormDiff = normDiffPtr
	state.PnL = 0
	state.MaxPnL = 0
	state.MaxLoss = 0
	state.OpenedAt = &entryTs
	state.ClosedAt = nil
	state.CloseReason = ""
	state.CloseRequested = false
	state.MaxPnLTs = &entryTs
	state.MaxLossTs = &entryTs

	e.sendNiftyWatcherAlert(ctx, "ENTRY", state.Strategy, fmt.Sprintf("MANUAL %s S%.0f combo=%.2f target=%.2f", state.Underlying, state.Strike, state.EntryCombo, state.TargetRupees))
	return nil
}

func (e *Engine) trackManualNiftyWatcherTrade(ctx context.Context, now, local, exitAt time.Time, state *store.ManualOptionTradeState, cfg config.NiftyWatcherConfig) error {
	if strings.TrimSpace(state.CEToken) == "" || strings.TrimSpace(state.PEToken) == "" {
		return fmt.Errorf("manual trade missing CE/PE tokens")
	}
	if strings.TrimSpace(state.CEExchange) == "" || strings.TrimSpace(state.PEExchange) == "" {
		return fmt.Errorf("manual trade missing CE/PE exchange")
	}
	tokensByExchange := map[string][]string{
		state.CEExchange: {state.CEToken},
		state.PEExchange: {state.PEToken},
	}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return nil
	}
	ceQuote := quotes[state.CEToken]
	peQuote := quotes[state.PEToken]
	if ceQuote.Price <= 0 || peQuote.Price <= 0 {
		return nil
	}

	state.CurrentCE = ceQuote.Price
	state.CurrentPE = peQuote.Price
	state.CurrentCombo = ceQuote.Price + peQuote.Price
	state.PnL = (state.CurrentCE - state.EntryCE + state.CurrentPE - state.EntryPE) * float64(state.Qty)
	state.Status = "open"
	if err := e.updateManualWatcherMax(ctx, state, local); err != nil {
		return err
	}

	exitReason := ""
	if state.CloseRequested {
		exitReason = "manual_close"
	} else if state.TargetRupees > 0 && (state.PnL >= state.TargetRupees || state.MaxPnL >= state.TargetRupees) {
		exitReason = "target"
	} else if !local.Before(exitAt) {
		exitReason = "eod"
	}
	if exitReason == "" {
		return nil
	}

	exitTs := now.UTC()
	tmpState := e.mapManualToWatcherState(state)
	tmpState.ExitReason = exitReason
	exitMeta := map[string]any{
		"strategy":        state.Strategy,
		"manual_trade":    true,
		"manual_trade_id": state.ID,
		"underlying":      state.Underlying,
		"underlying_px":   state.NiftyPrice,
		"strike":          state.Strike,
		"entry_time":      tmpState.EntryTs.UTC().Format(time.RFC3339),
		"exit_time":       exitTs.UTC().Format(time.RFC3339),
		"rsi":             state.RSI,
		"willr":           state.WILLR,
		"ce_norm":         state.CENorm,
		"pe_norm":         state.PENorm,
		"norm_diff":       state.NormDiff,
		"max_pnl":         state.MaxPnL,
		"max_loss":        state.MaxLoss,
		"trade_pnl":       state.PnL,
		"target_rupees":   state.TargetRupees,
		"exit_reason":     exitReason,
	}
	exitOrders, exitTrades, posUpdates := buildWatcherExitOrders(state.Strategy, tmpState, ceQuote.Price, peQuote.Price, exitTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps, exitMeta)
	if len(exitOrders) == 0 {
		return fmt.Errorf("no exit orders generated")
	}
	if err := e.store.RecordPaperBatch(ctx, exitOrders, exitTrades, posUpdates); err != nil {
		return err
	}
	if state.RunID > 0 {
		if err := e.store.UpdateNiftyWatcherRunExit(ctx, state.RunID, exitTs, exitReason, state.CurrentCombo, state.PnL, state.MaxPnL, state.MaxPnLTs, state.MaxLoss, state.MaxLossTs); err != nil {
			return err
		}
	}

	state.Status = "closed"
	state.CloseReason = exitReason
	state.CloseRequested = false
	state.ClosedAt = &exitTs
	e.sendNiftyWatcherAlert(ctx, "EXIT", state.Strategy, fmt.Sprintf("MANUAL %s S%.0f %s pnl=%.2f max=%.2f min=%.2f", state.Underlying, state.Strike, strings.ToUpper(exitReason), state.PnL, state.MaxPnL, state.MaxLoss))
	return nil
}

func (e *Engine) finalizeWatcherEOD(ctx context.Context, state *niftyWatcherState, cePrice, pePrice float64, qty int64, local time.Time) error {
	eodPnL := (cePrice - state.CEPrice + pePrice - state.PEPrice) * float64(qty)
	eodTs := local.UTC()
	if state.RunID > 0 {
		if err := e.store.UpdateNiftyWatcherRunEOD(ctx, state.RunID, eodTs, eodPnL, state.MaxPnL, optionalTime(state.MaxPnLTs), state.MaxLoss, optionalTime(state.MaxLossTs)); err != nil {
			return err
		}
	}
	state.EODRecorded = true
	state.Tracking = false
	if err := e.persistNiftyWatcherState(ctx, eodTs, state, "eod"); err != nil {
		return err
	}
	e.sendNiftyWatcherAlert(ctx, "EOD", state.Strategy, fmt.Sprintf("eod=%.2f max=%.2f min=%.2f", eodPnL, state.MaxPnL, state.MaxLoss))
	return nil
}

func (e *Engine) loadNiftyWatcherState(ctx context.Context, strategy string) (*niftyWatcherState, error) {
	st, err := e.store.GetLatestStrategyState(ctx, "nifty_watcher:"+strategy)
	if err != nil || st == nil || len(st.Raw) == 0 {
		return nil, err
	}
	var state niftyWatcherState
	if err := json.Unmarshal(st.Raw, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (e *Engine) persistNiftyWatcherState(ctx context.Context, now time.Time, state *niftyWatcherState, value string) error {
	raw, _ := json.Marshal(state)
	return e.store.UpsertStrategyStates(ctx, []store.StrategyState{{
		Ts:    now.UTC(),
		Name:  "nifty_watcher:" + state.Strategy,
		Value: value,
		Raw:   raw,
	}})
}

func (e *Engine) sendNiftyWatcherAlert(ctx context.Context, kind, strategy, message string) {
	if e.niftyWatcherAlerts == nil {
		return
	}
	title := fmt.Sprintf("%s OPTIONS %s %s", strings.TrimSpace(e.cfg.NiftyWatcher.Alerts.TitlePrefix), strings.ToUpper(strategy), strings.ToUpper(kind))
	title = strings.TrimSpace(title)
	if err := e.niftyWatcherAlerts.Send(ctx, title, message); err != nil && e.logger != nil {
		e.logger.Error("nifty_watcher_alert_failed", "title", title, "error", err)
	}
}

func pickOptionByStrike(contracts []optionContract, expiry time.Time, strike float64, right string) optionContract {
	right = strings.ToUpper(strings.TrimSpace(right))
	best := optionContract{}
	for _, c := range contracts {
		if !c.Expiry.Equal(expiry) {
			continue
		}
		if strings.ToUpper(c.Right) != right {
			continue
		}
		if math.Abs(c.Strike-strike) < 0.1 {
			return c
		}
		if best.Token == "" {
			best = c
		}
	}
	return best
}

func pickNearestOptionByStrike(contracts []optionContract, expiry time.Time, strike float64, right string) optionContract {
	right = strings.ToUpper(strings.TrimSpace(right))
	best := optionContract{}
	bestDiff := math.MaxFloat64
	for _, c := range contracts {
		if !c.Expiry.Equal(expiry) {
			continue
		}
		if strings.ToUpper(c.Right) != right {
			continue
		}
		diff := math.Abs(c.Strike - strike)
		if diff < bestDiff {
			best = c
			bestDiff = diff
		}
	}
	return best
}

func fetchQuotesForContracts(ctx context.Context, st *store.Store, contracts []optionContract) (map[string]instrumentQuote, error) {
	tokensByExchange := map[string][]string{}
	seen := map[string]struct{}{}
	for _, c := range contracts {
		key := strings.ToUpper(strings.TrimSpace(c.Exchange)) + ":" + strings.TrimSpace(c.Token)
		if c.Exchange == "" || c.Token == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		tokensByExchange[c.Exchange] = append(tokensByExchange[c.Exchange], c.Token)
	}
	return fetchInstrumentQuotesMulti(ctx, st, tokensByExchange)
}

func pickLiquidOptionPair(contracts []optionContract, quotes map[string]instrumentQuote, desiredExpiry time.Time, desiredStrike float64) (optionContract, optionContract, instrumentQuote, instrumentQuote, bool) {
	type expiryRank struct {
		Expiry time.Time
		Score  float64
	}
	expiries := map[time.Time]struct{}{}
	for _, c := range contracts {
		if c.Expiry.IsZero() {
			continue
		}
		expiries[c.Expiry] = struct{}{}
	}
	orderedExpiries := make([]expiryRank, 0, len(expiries))
	for expiry := range expiries {
		score := 0.0
		if !desiredExpiry.IsZero() {
			score = math.Abs(expiry.Sub(desiredExpiry).Hours())
		}
		orderedExpiries = append(orderedExpiries, expiryRank{Expiry: expiry, Score: score})
	}
	sort.SliceStable(orderedExpiries, func(i, j int) bool {
		if orderedExpiries[i].Score == orderedExpiries[j].Score {
			return orderedExpiries[i].Expiry.Before(orderedExpiries[j].Expiry)
		}
		return orderedExpiries[i].Score < orderedExpiries[j].Score
	})

	for _, expiryItem := range orderedExpiries {
		expiry := expiryItem.Expiry
		type pair struct {
			ce      optionContract
			pe      optionContract
			ceQuote instrumentQuote
			peQuote instrumentQuote
		}
		byStrike := map[float64]*pair{}
		for _, c := range contracts {
			if !c.Expiry.Equal(expiry) {
				continue
			}
			q, ok := quotes[c.Token]
			if !ok || q.Price <= 0 {
				continue
			}
			item := byStrike[c.Strike]
			if item == nil {
				item = &pair{}
				byStrike[c.Strike] = item
			}
			switch strings.ToUpper(strings.TrimSpace(c.Right)) {
			case "CE":
				item.ce = c
				item.ceQuote = q
			case "PE":
				item.pe = c
				item.peQuote = q
			}
		}
		bestDiff := math.MaxFloat64
		var bestPair *pair
		for strike, item := range byStrike {
			if item == nil || item.ce.Token == "" || item.pe.Token == "" {
				continue
			}
			diff := math.Abs(strike - desiredStrike)
			if bestPair == nil || diff < bestDiff {
				bestPair = item
				bestDiff = diff
			}
		}
		if bestPair != nil {
			return bestPair.ce, bestPair.pe, bestPair.ceQuote, bestPair.peQuote, true
		}
	}
	return optionContract{}, optionContract{}, instrumentQuote{}, instrumentQuote{}, false
}

func buildWatcherEntryOrders(strategy string, ce optionContract, pe optionContract, cePrice, pePrice float64, qty int64, entryTs time.Time, brokerage float64, slippageBps float64, meta map[string]any) ([]store.PaperOrder, []store.PaperTrade, []store.PaperPosition) {
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	positions := []store.PaperPosition{}

	legs := []struct {
		option optionContract
		price  float64
	}{{ce, cePrice}, {pe, pePrice}}

	for _, leg := range legs {
		if leg.price <= 0 {
			continue
		}
		price := applySlippage(leg.price, "BUY", slippageBps)
		orderID := newRunID()
		tradeID := newRunID()
		payload := map[string]any{
			"strategy":   strategy,
			"leg":        leg.option.Right,
			"entry_time": entryTs.UTC().Format(time.RFC3339),
		}
		for k, v := range meta {
			payload[k] = v
		}
		raw := mustJSON(payload)
		orders = append(orders, store.PaperOrder{
			OrderID:     orderID,
			CreatedAt:   entryTs,
			Strategy:    strategy,
			Exchange:    leg.option.Exchange,
			SymbolToken: leg.option.Token,
			Side:        "BUY",
			Qty:         qty,
			OrderType:   "MARKET",
			Price:       price,
			Status:      "FILLED",
			FilledQty:   qty,
			FilledPrice: price,
			Raw:         raw,
		})
		trades = append(trades, store.PaperTrade{
			TradeID:     tradeID,
			OrderID:     orderID,
			Ts:          entryTs,
			Strategy:    strategy,
			Exchange:    leg.option.Exchange,
			SymbolToken: leg.option.Token,
			Side:        "BUY",
			Qty:         qty,
			Price:       price,
			Fees:        brokerage,
			Raw:         raw,
		})
		positions = append(positions, store.PaperPosition{
			Exchange:      leg.option.Exchange,
			SymbolToken:   leg.option.Token,
			Strategy:      strategy,
			Side:          "BUY",
			Qty:           qty,
			AvgPrice:      price,
			EntryPrice:    &price,
			EntryTs:       &entryTs,
			RealizedPNL:   -brokerage,
			UnrealizedPNL: 0,
			UpdatedAt:     entryTs,
		})
	}
	return orders, trades, positions
}

func buildWatcherExitOrders(strategy string, state *niftyWatcherState, cePrice, pePrice float64, exitTs time.Time, brokerage float64, slippageBps float64, meta map[string]any) ([]store.PaperOrder, []store.PaperTrade, []store.PaperPosition) {
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	positions := []store.PaperPosition{}
	legs := []struct {
		token    string
		exchange string
		price    float64
	}{{state.CEToken, state.CEExchange, cePrice}, {state.PEToken, state.PEExchange, pePrice}}

	for _, leg := range legs {
		if leg.token == "" || leg.price <= 0 || leg.exchange == "" {
			continue
		}
		exitPrice := applySlippage(leg.price, "SELL", slippageBps)
		orderID := newRunID()
		tradeID := newRunID()
		payload := map[string]any{"strategy": strategy, "exit_reason": state.ExitReason}
		for k, v := range meta {
			payload[k] = v
		}
		raw := mustJSON(payload)
		orders = append(orders, store.PaperOrder{
			OrderID:     orderID,
			CreatedAt:   exitTs,
			Strategy:    strategy,
			Exchange:    leg.exchange,
			SymbolToken: leg.token,
			Side:        "SELL",
			Qty:         state.Qty,
			OrderType:   "MARKET",
			Price:       exitPrice,
			Status:      "FILLED",
			FilledQty:   state.Qty,
			FilledPrice: exitPrice,
			Raw:         raw,
		})
		trades = append(trades, store.PaperTrade{
			TradeID:     tradeID,
			OrderID:     orderID,
			Ts:          exitTs,
			Strategy:    strategy,
			Exchange:    leg.exchange,
			SymbolToken: leg.token,
			Side:        "SELL",
			Qty:         state.Qty,
			Price:       exitPrice,
			Fees:        brokerage,
			Raw:         raw,
		})
		realized := (exitPrice - pickWatcherEntryPrice(state, leg.token)) * float64(state.Qty)
		realized -= brokerage * 2
		positions = append(positions, store.PaperPosition{
			Exchange:      leg.exchange,
			SymbolToken:   leg.token,
			Strategy:      strategy,
			Side:          "BUY",
			Qty:           0,
			AvgPrice:      pickWatcherEntryPrice(state, leg.token),
			EntryPrice:    floatPtr(pickWatcherEntryPrice(state, leg.token)),
			EntryTs:       &state.EntryTs,
			RealizedPNL:   realized,
			UnrealizedPNL: 0,
			UpdatedAt:     exitTs,
		})
	}
	return orders, trades, positions
}

func pickWatcherEntryPrice(state *niftyWatcherState, token string) float64 {
	if token == state.CEToken {
		return state.CEPrice
	}
	return state.PEPrice
}

func optionalTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func slopeAngleFromBars(bars []minuteBar, from time.Time, to time.Time) float64 {
	fromUTC := from.UTC()
	toUTC := to.UTC()
	var first minuteBar
	var last minuteBar
	found := false
	for _, bar := range bars {
		ts := bar.Ts.UTC()
		if ts.Before(fromUTC) || ts.After(toUTC) {
			continue
		}
		if !found {
			first = bar
			found = true
		}
		last = bar
	}
	if !found {
		return math.NaN()
	}
	deltaMin := last.Ts.Sub(first.Ts).Minutes()
	if deltaMin <= 0 {
		return 0
	}
	slope := (last.Close - first.Close) / deltaMin
	return math.Atan(slope) * 180 / math.Pi
}

func slopeGuardBlocks(ceAngle, peAngle, minAngle float64) bool {
	threshold := math.Abs(minAngle)
	if threshold == 0 {
		return false
	}
	ceDown := !math.IsNaN(ceAngle) && ceAngle <= -threshold
	peDown := !math.IsNaN(peAngle) && peAngle <= -threshold
	return ceDown || peDown
}
