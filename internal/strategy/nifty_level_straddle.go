package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type niftyLevelStraddleState struct {
	Open            bool      `json:"open"`
	Level           float64   `json:"level"`
	Underlying      string    `json:"underlying"`
	UnderlyingPrice float64   `json:"underlying_price"`
	Expiry          string    `json:"expiry"`
	CEToken         string    `json:"ce_token"`
	PEToken         string    `json:"pe_token"`
	CEExchange      string    `json:"ce_exchange"`
	PEExchange      string    `json:"pe_exchange"`
	CEPrice         float64   `json:"ce_price"`
	PEPrice         float64   `json:"pe_price"`
	Qty             int64     `json:"qty"`
	LotSize         int       `json:"lot_size"`
	Lots            int       `json:"lots"`
	EntryTs         time.Time `json:"entry_ts"`
	ExitTs          time.Time `json:"exit_ts"`
	ExitReason      string    `json:"exit_reason"`
	LastEntryKey    string    `json:"last_entry_key"`
	LastExitKey     string    `json:"last_exit_key"`
}

func (e *Engine) evaluateNiftyLevelStraddle(ctx context.Context, now time.Time, cfg config.StrategyConfig, positions map[string]store.PaperPosition) error {
	if !cfg.NiftyLevelStraddleEnable {
		return nil
	}
	if e.loc == nil {
		return nil
	}

	state, _ := e.loadNiftyLevelStraddleState(ctx)
	if state == nil {
		state = &niftyLevelStraddleState{}
	}

	local := now.In(e.loc)
	exitAt, err := parseDailyTime(local, cfg.NiftyLevelStraddleExitTime, e.loc)
	if err != nil {
		return err
	}

	if state.Open {
		return e.manageNiftyLevelStraddleExit(ctx, local, exitAt, cfg, state, positions)
	}

	if outsideMarketHours(local, e.cfg.Runtime.TradingStart, e.cfg.Runtime.TradingEnd, e.loc) {
		return nil
	}
	if !local.Before(exitAt) {
		return nil
	}

	token := strings.TrimSpace(cfg.NiftyLevelStraddleToken)
	if token == "" {
		return nil
	}
	prices, err := fetchInstrumentPrices(ctx, e.store, "NSE", []string{token})
	if err != nil {
		return err
	}
	price := prices[token]
	if price <= 0 {
		return nil
	}

	step := cfg.NiftyLevelStraddleStep
	if step <= 0 {
		step = 100
	}
	buffer := cfg.NiftyLevelStraddleBuffer
	if buffer < 0 {
		buffer = 0
	}
	level := math.Round(price/step) * step
	nearLevel := math.Abs(price-level) <= buffer
	if !nearLevel {
		return nil
	}

	underlying := strings.ToUpper(strings.TrimSpace(cfg.NiftyLevelStraddleUnderlying))
	if underlying == "" {
		underlying = "NIFTY50"
	}
	contractsByUnderlying, err := fetchOptionContracts(ctx, e.store, []string{underlying})
	if err != nil {
		return err
	}
	contracts := contractsByUnderlying[underlying]
	if len(contracts) == 0 {
		return nil
	}
	contracts = filterOptionContractsByKind(contracts, "OPTIDX")
	if len(contracts) == 0 {
		return nil
	}
	ce, okCE := selectOptionContract(contracts, price, "CE", cfg.NiftyLevelStraddleExpiryRank, 0, now, e.loc)
	pe, okPE := selectOptionContract(contracts, price, "PE", cfg.NiftyLevelStraddleExpiryRank, 0, now, e.loc)
	if !okCE || !okPE {
		return nil
	}
	dateKey := local.Format("2006-01-02")
	entryKey := fmt.Sprintf("%s-%.0f", dateKey, level)
	if state.LastEntryKey == entryKey {
		return nil
	}
	tokensByExchange := map[string][]string{ce.Exchange: {ce.Token}, pe.Exchange: {pe.Token}}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return err
	}
	ceQuote := quotes[ce.Token]
	peQuote := quotes[pe.Token]
	if ceQuote.Price <= 0 || peQuote.Price <= 0 {
		return nil
	}

	lotSizes, _ := fetchInstrumentLotSizes(ctx, e.store, []string{ce.Token, pe.Token})
	lotSize := lotSizes[ce.Token]
	if lotSize == 0 {
		lotSize = lotSizes[pe.Token]
	}
	if lotSize == 0 {
		lotSize = cfg.NiftyLevelStraddleLotSize
	}
	lots := cfg.NiftyLevelStraddleLots
	if lots <= 0 {
		lots = 1
	}
	qty := int64(lotSize * lots)
	if qty <= 0 {
		return nil
	}

	entryTs := now.UTC()
	orders, trades, positionsUpdate := buildPaperEntryOrders("nifty_level_straddle", ce, pe, ceQuote.Price, peQuote.Price, qty, entryTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps)
	if len(orders) == 0 {
		return nil
	}
	if err := e.store.RecordPaperBatch(ctx, orders, trades, positionsUpdate); err != nil {
		return err
	}
	for _, pos := range positionsUpdate {
		positions[positionKey(pos.Exchange, pos.SymbolToken)] = pos
	}

	state.Open = true
	state.Level = level
	state.Underlying = underlying
	state.UnderlyingPrice = price
	state.Expiry = ce.Expiry.Format("2006-01-02")
	state.CEToken = ce.Token
	state.PEToken = pe.Token
	state.CEPrice = ceQuote.Price
	state.PEPrice = peQuote.Price
	state.CEExchange = ce.Exchange
	state.PEExchange = pe.Exchange
	state.Qty = qty
	state.LotSize = lotSize
	state.Lots = lots
	state.EntryTs = entryTs
	state.ExitTs = time.Time{}
	state.ExitReason = ""
	state.LastEntryKey = entryKey

	if e.logger != nil {
		e.logger.Info("nifty_level_straddle_entered", "level", level, "price", price, "ce", ce.TradingSymbol, "pe", pe.TradingSymbol, "qty", qty)
	}
	return e.persistNiftyLevelStraddleState(ctx, now, state, "open")
}

func (e *Engine) manageNiftyLevelStraddleExit(ctx context.Context, now time.Time, exitAt time.Time, cfg config.StrategyConfig, state *niftyLevelStraddleState, positions map[string]store.PaperPosition) error {
	if state.CEToken == "" || state.PEToken == "" || state.Qty <= 0 {
		state.Open = false
		return e.persistNiftyLevelStraddleState(ctx, now, state, "closed")
	}
	tokensByExchange := map[string][]string{}
	if state.CEExchange != "" && state.CEToken != "" {
		tokensByExchange[state.CEExchange] = append(tokensByExchange[state.CEExchange], state.CEToken)
	}
	if state.PEExchange != "" && state.PEToken != "" {
		tokensByExchange[state.PEExchange] = append(tokensByExchange[state.PEExchange], state.PEToken)
	}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return err
	}
	ceQuote := quotes[state.CEToken]
	peQuote := quotes[state.PEToken]
	if ceQuote.Price <= 0 || peQuote.Price <= 0 {
		return nil
	}

	gross := (ceQuote.Price - state.CEPrice + peQuote.Price - state.PEPrice) * float64(state.Qty)
	target := cfg.NiftyLevelStraddleTargetRupees
	stop := cfg.NiftyLevelStraddleStopRupees
	exitReason := ""
	if target != 0 && gross >= target {
		exitReason = "target"
	} else if stop != 0 && gross <= stop {
		exitReason = "stop"
	} else if !now.Before(exitAt) {
		exitReason = "eod"
	}

	if exitReason == "" {
		return nil
	}

	exitTs := now.UTC()
	state.ExitReason = exitReason
	exitOrders, exitTrades, posUpdates := buildPaperExitOrders("nifty_level_straddle", state, ceQuote.Price, peQuote.Price, exitTs, e.cfg.Paper.BrokeragePerTrade, e.cfg.Paper.SlippageBps)
	if len(exitOrders) == 0 {
		return nil
	}
	if err := e.store.RecordPaperBatch(ctx, exitOrders, exitTrades, posUpdates); err != nil {
		return err
	}
	for _, pos := range posUpdates {
		positions[positionKey(pos.Exchange, pos.SymbolToken)] = pos
	}

	state.Open = false
	state.ExitTs = exitTs
	state.LastExitKey = fmt.Sprintf("%s-%s", now.In(e.loc).Format("2006-01-02"), exitReason)

	if e.logger != nil {
		e.logger.Info("nifty_level_straddle_exited", "reason", exitReason, "gross", gross)
	}
	return e.persistNiftyLevelStraddleState(ctx, now, state, "closed")
}

func (e *Engine) loadNiftyLevelStraddleState(ctx context.Context) (*niftyLevelStraddleState, error) {
	st, err := e.store.GetLatestStrategyState(ctx, "nifty_level_straddle")
	if err != nil || st == nil || len(st.Raw) == 0 {
		return nil, err
	}
	var state niftyLevelStraddleState
	if err := json.Unmarshal(st.Raw, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (e *Engine) persistNiftyLevelStraddleState(ctx context.Context, now time.Time, state *niftyLevelStraddleState, value string) error {
	raw, _ := json.Marshal(state)
	return e.store.UpsertStrategyStates(ctx, []store.StrategyState{{
		Ts:    now.UTC(),
		Name:  "nifty_level_straddle",
		Value: value,
		Raw:   raw,
	}})
}

func buildPaperEntryOrders(strategy string, ce optionContract, pe optionContract, cePrice, pePrice float64, qty int64, entryTs time.Time, brokerage float64, slippageBps float64) ([]store.PaperOrder, []store.PaperTrade, []store.PaperPosition) {
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
		raw := mustJSON(map[string]any{
			"strategy": "nifty_level_straddle",
			"leg":      leg.option.Right,
		})
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

func buildPaperExitOrders(strategy string, state *niftyLevelStraddleState, cePrice, pePrice float64, exitTs time.Time, brokerage float64, slippageBps float64) ([]store.PaperOrder, []store.PaperTrade, []store.PaperPosition) {
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
		raw := mustJSON(map[string]any{
			"strategy":    "nifty_level_straddle",
			"exit_reason": state.ExitReason,
		})
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
		realized := (exitPrice - pickEntryPrice(state, leg.token)) * float64(state.Qty)
		realized -= brokerage * 2
		positions = append(positions, store.PaperPosition{
			Exchange:      leg.exchange,
			SymbolToken:   leg.token,
			Strategy:      strategy,
			Side:          "BUY",
			Qty:           0,
			AvgPrice:      pickEntryPrice(state, leg.token),
			EntryPrice:    floatPtr(pickEntryPrice(state, leg.token)),
			EntryTs:       &state.EntryTs,
			RealizedPNL:   realized,
			UnrealizedPNL: 0,
			UpdatedAt:     exitTs,
		})
	}
	return orders, trades, positions
}

func pickEntryPrice(state *niftyLevelStraddleState, token string) float64 {
	if token == state.CEToken {
		return state.CEPrice
	}
	return state.PEPrice
}

func floatPtr(v float64) *float64 {
	return &v
}
