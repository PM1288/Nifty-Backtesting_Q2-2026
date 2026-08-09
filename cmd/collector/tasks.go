package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
	"trading-stack/internal/util"
)

type priceCache struct {
	mu     sync.RWMutex
	prices map[string]float64
}

func newPriceCache() *priceCache {
	return &priceCache{prices: map[string]float64{}}
}

func (c *priceCache) Set(key string, price float64) {
	if price <= 0 {
		return
	}
	key = strings.ToUpper(strings.TrimSpace(key))
	if key == "" {
		return
	}
	c.mu.Lock()
	c.prices[key] = price
	c.mu.Unlock()
}

func (c *priceCache) Get(key string) (float64, bool) {
	key = strings.ToUpper(strings.TrimSpace(key))
	if key == "" {
		return 0, false
	}
	c.mu.RLock()
	price, ok := c.prices[key]
	c.mu.RUnlock()
	if ok {
		return price, true
	}
	if key == "NIFTY" {
		return c.Get("NIFTY50")
	}
	return 0, false
}

type oiEntry struct {
	OI        int64
	UpdatedAt time.Time
}

type oiCache struct {
	mu     sync.RWMutex
	values map[string]oiEntry
}

func newOICache() *oiCache {
	return &oiCache{values: map[string]oiEntry{}}
}

func (c *oiCache) Set(exchange, token string, oi int64, ts time.Time) {
	if oi < 0 {
		return
	}
	exchange = strings.ToUpper(strings.TrimSpace(exchange))
	token = strings.TrimSpace(token)
	if exchange == "" || token == "" {
		return
	}
	key := subKey(exchange, token)
	c.mu.Lock()
	c.values[key] = oiEntry{OI: oi, UpdatedAt: ts}
	c.mu.Unlock()
}

func (c *oiCache) Snapshot() map[string]oiEntry {
	c.mu.RLock()
	out := make(map[string]oiEntry, len(c.values))
	for key, entry := range c.values {
		out[key] = entry
	}
	c.mu.RUnlock()
	return out
}

type subscriptionIndex struct {
	mu    sync.RWMutex
	byKey map[string]store.Subscription
}

func newSubscriptionIndex() *subscriptionIndex {
	return &subscriptionIndex{byKey: map[string]store.Subscription{}}
}

func (s *subscriptionIndex) Update(subs []store.Subscription) {
	next := make(map[string]store.Subscription, len(subs))
	for _, sub := range subs {
		next[subKey(sub.Exchange, sub.SymbolToken)] = sub
	}
	s.mu.Lock()
	s.byKey = next
	s.mu.Unlock()
}

func (s *subscriptionIndex) Get(exchange, token string) (store.Subscription, bool) {
	s.mu.RLock()
	sub, ok := s.byKey[subKey(exchange, token)]
	s.mu.RUnlock()
	return sub, ok
}

func (s *subscriptionIndex) Snapshot() []store.Subscription {
	s.mu.RLock()
	subs := make([]store.Subscription, 0, len(s.byKey))
	for _, sub := range s.byKey {
		subs = append(subs, sub)
	}
	s.mu.RUnlock()
	return subs
}

func subKey(exchange, token string) string {
	return strings.ToUpper(strings.TrimSpace(exchange)) + ":" + strings.TrimSpace(token)
}

type quoteRotation struct {
	mu     sync.Mutex
	cursor map[string]int
}

func newQuoteRotation() *quoteRotation {
	return &quoteRotation{cursor: map[string]int{}}
}

func (r *quoteRotation) Take(exchange string, tokens []string, max int) []string {
	if max <= 0 || len(tokens) <= max {
		return tokens
	}
	sort.Strings(tokens)
	r.mu.Lock()
	defer r.mu.Unlock()
	start := r.cursor[exchange]
	if start < 0 || start >= len(tokens) {
		start = 0
	}
	out := make([]string, 0, max)
	for i := 0; i < max && i < len(tokens); i++ {
		idx := (start + i) % len(tokens)
		out = append(out, tokens[idx])
	}
	r.cursor[exchange] = (start + len(out)) % len(tokens)
	return out
}

func normalizeKinds(kinds []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, kind := range kinds {
		kind = strings.ToUpper(strings.TrimSpace(kind))
		if kind == "" {
			continue
		}
		out[kind] = struct{}{}
	}
	return out
}

func normalizeSymbols(symbols []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, symbol := range symbols {
		symbol = strings.ToUpper(strings.TrimSpace(symbol))
		if symbol == "" {
			continue
		}
		out[symbol] = struct{}{}
	}
	return out
}

func splitSubKey(key string) (string, string) {
	parts := strings.SplitN(key, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return "", key
}

func enforceCapacity(subs []store.Subscription, maxConnections, maxTokens int) ([]store.Subscription, []store.Subscription) {
	capacity := maxConnections * maxTokens
	if capacity <= 0 || len(subs) <= capacity {
		return subs, nil
	}
	ordered := make([]store.Subscription, len(subs))
	copy(ordered, subs)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Priority == ordered[j].Priority {
			return ordered[i].TradingSymbol < ordered[j].TradingSymbol
		}
		return ordered[i].Priority < ordered[j].Priority
	})
	keep := ordered[:capacity]
	dropped := ordered[capacity:]
	for i := range dropped {
		dropped[i].Active = false
		if dropped[i].Reason == "" {
			dropped[i].Reason = "capacity_drop"
		}
	}
	return keep, dropped
}

func runQuoteSnapshotsLoop(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, subIndex *subscriptionIndex, priceCache *priceCache, stateCache *instrumentStateCache, queue *restQueue, logger *slog.Logger, enable bool, includeOptions bool, includeNonOptions bool, intervalSeconds int, label string, allowPCR bool, priority jobPriority, rotation *quoteRotation, rotationMax int, primaryKinds map[string]struct{}) error {
	if !enable {
		return nil
	}
	if intervalSeconds <= 0 {
		intervalSeconds = 60
	}
	primarySymbols := normalizeSymbols(cfg.RestTasks.QuoteSnapshotPrimaryIndices)
	rotationBudgets := map[string]int{}
	var rotationOrder []string
	for _, budget := range cfg.RestTasks.QuoteSnapshotRotationBudgets {
		kind := strings.ToUpper(strings.TrimSpace(budget.Kind))
		if kind == "" || budget.MaxTokens <= 0 {
			continue
		}
		rotationBudgets[kind] = budget.MaxTokens
		rotationOrder = append(rotationOrder, kind)
	}
	ticker := time.NewTicker(time.Duration(intervalSeconds) * time.Second)
	defer ticker.Stop()
	var lastPCR time.Time
	pcrWarned := false
	stockWebhook := newStockWebhookClient(cfg.StockWebhook, logger)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			var webhookStocks []stockWebhookQuote
			subs, err := st.ListActiveSubscriptions(ctx)
			if err != nil {
				if logger != nil {
					logger.Warn("quote_snapshot_subs_failed", "job", label, "err", err)
				}
				notifyCollector(ctx, "quote_snapshot_subs_failed", "Data Capture", fmt.Sprintf("Quote snapshot subs failed (%s): %v", label, err))
				continue
			}
			subIndex.Update(subs)
			// Websocket capacity is finite (3 x 1000 tokens). Keep every selected
			// stock option observable by adding capacity-dropped plan rows to the
			// slow REST option rotation; this costs only batched quote calls.
			plannedByKey := map[string]store.Subscription{}
			if includeOptions {
				plan, planErr := st.ListLatestDerivativeTokenPlan(ctx, stockDerivativePlanName)
				if planErr != nil {
					if logger != nil {
						logger.Warn("quote_snapshot_plan_failed", "job", label, "err", planErr)
					}
				} else {
					for _, row := range plan {
						if row.Active || !strings.HasPrefix(strings.ToUpper(row.ContractKind), "OPT") {
							continue
						}
						sub := store.Subscription{Exchange: row.Exchange, SymbolToken: row.SymbolToken, Mode: row.Mode, Kind: "OPTSTK_REST", TradingSymbol: row.TradingSymbol, Underlying: row.Underlying, Expiry: row.Expiry, Strike: row.Strike, Right: row.Right, InstrumentType: row.InstrumentType, Priority: row.Priority, Active: false, Reason: row.Reason}
						subs = append(subs, sub)
						plannedByKey[subKey(sub.Exchange, sub.SymbolToken)] = sub
					}
				}
			}
			pcrEnabled := cfg.RestTasks.EnablePCRSnapshots && allowPCR && includeOptions
			if cfg.RestTasks.EnablePCRSnapshots && allowPCR && !includeOptions && !cfg.RestTasks.EnableOptionQuoteSnapshots && !pcrWarned && logger != nil {
				logger.Warn("pcr_snapshot_disabled", "reason", "options_quotes_disabled", "job", label)
				pcrWarned = true
			}
			batches := buildQuoteBatches(subs, includeOptions, includeNonOptions, cfg.Limits.QuoteMaxSymbolsPerRequest, rotation, rotationMax, primaryKinds, primarySymbols, rotationBudgets, rotationOrder)
			if len(batches) == 0 {
				continue
			}
			ts := time.Now().UTC()
			pcrAccum := map[string]*pcrAgg{}
			for _, batch := range batches {
				done := queue.Submit(restJob{
					endpoint: endpointQuote,
					name:     label,
					priority: priority,
					run: func(jobCtx context.Context) error {
						start := time.Now()
						requested := 0
						for _, batchTokens := range batch {
							requested += len(batchTokens)
						}
						quotes, err := smartapi.FetchQuotes(jobCtx, cfg.SmartAPI, provider, "FULL", batch, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
						latency := time.Since(start)
						recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
							Ts:               start.UTC(),
							Endpoint:         string(endpointQuote),
							Name:             label,
							Success:          err == nil,
							Throttled:        isThrottleErr(err),
							LatencyMs:        latency.Milliseconds(),
							SymbolsRequested: requested,
							SymbolsReturned:  len(quotes),
							ErrorMessage:     errorMessage(err),
						})
						if err != nil {
							return err
						}
						var snapRows []store.QuoteSnapshot
						var depthRows []store.Depth5Snapshot
						oiByTable := map[string][]store.OISnapshot{}
						for _, quote := range quotes {
							sub, ok := subIndex.Get(quote.Exchange, quote.SymbolToken)
							if !ok {
								sub, ok = plannedByKey[subKey(quote.Exchange, quote.SymbolToken)]
							}
							if ok && quote.LTP != nil && sub.Underlying != "" && !strings.HasPrefix(strings.ToUpper(sub.Kind), "OPT") {
								priceCache.Set(sub.Underlying, *quote.LTP)
							}
							if ok {
								if webhookQuote, include := stockWebhookQuoteFromSmartAPI(ts, sub, quote); include {
									webhookStocks = append(webhookStocks, webhookQuote)
								}
							}
							snapRows = append(snapRows, store.QuoteSnapshot{
								Ts:            ts,
								Exchange:      quote.Exchange,
								SymbolToken:   quote.SymbolToken,
								LTP:           quote.LTP,
								Open:          quote.Open,
								High:          quote.High,
								Low:           quote.Low,
								Close:         quote.Close,
								LastTradeQty:  quote.LastTradeQty,
								ExchFeedTime:  quote.ExchFeedTime,
								ExchTradeTime: quote.ExchTradeTime,
								NetChange:     quote.NetChange,
								PercentChange: quote.PercentChange,
								AvgPrice:      quote.AvgPrice,
								Volume:        quote.Volume,
								OI:            quote.OI,
								TotalBuyQty:   quote.TotalBuyQty,
								TotalSellQty:  quote.TotalSellQty,
								UpperCircuit:  quote.UpperCircuit,
								LowerCircuit:  quote.LowerCircuit,
								Week52High:    quote.Week52High,
								Week52Low:     quote.Week52Low,
								Bid:           quote.Bid,
								Ask:           quote.Ask,
								BidQty:        quote.BidQty,
								AskQty:        quote.AskQty,
								Raw:           quote.Raw,
							})
							if len(quote.DepthBuy) > 0 || len(quote.DepthSell) > 0 {
								for idx, level := range quote.DepthBuy {
									price := level.Price
									qty := level.Quantity
									orders := level.Orders
									depthRows = append(depthRows, store.Depth5Snapshot{
										Ts:          ts,
										Exchange:    quote.Exchange,
										SymbolToken: quote.SymbolToken,
										Side:        "B",
										Level:       int16(idx + 1),
										Price:       &price,
										Quantity:    &qty,
										Orders:      &orders,
									})
								}
								for idx, level := range quote.DepthSell {
									price := level.Price
									qty := level.Quantity
									orders := level.Orders
									depthRows = append(depthRows, store.Depth5Snapshot{
										Ts:          ts,
										Exchange:    quote.Exchange,
										SymbolToken: quote.SymbolToken,
										Side:        "S",
										Level:       int16(idx + 1),
										Price:       &price,
										Quantity:    &qty,
										Orders:      &orders,
									})
								}
							}
							if stateCache != nil {
								stateCache.Update(store.InstrumentState{
									Exchange:      quote.Exchange,
									SymbolToken:   quote.SymbolToken,
									LastSeen:      ts,
									LastPrice:     quote.LTP,
									LastSource:    "rest_quote",
									LastBid:       quote.Bid,
									LastAsk:       quote.Ask,
									LastBidQty:    quote.BidQty,
									LastAskQty:    quote.AskQty,
									LastTradeQty:  quote.LastTradeQty,
									LastOpen:      quote.Open,
									LastHigh:      quote.High,
									LastLow:       quote.Low,
									LastClose:     quote.Close,
									LastVolume:    quote.Volume,
									LastOI:        quote.OI,
									TotalBuyQty:   quote.TotalBuyQty,
									TotalSellQty:  quote.TotalSellQty,
									AvgPrice:      quote.AvgPrice,
									NetChange:     quote.NetChange,
									PercentChange: quote.PercentChange,
									UpperCircuit:  quote.UpperCircuit,
									LowerCircuit:  quote.LowerCircuit,
									Week52High:    quote.Week52High,
									Week52Low:     quote.Week52Low,
								})
							}
							if cfg.RestTasks.EnableOISnapshots && quote.OI != nil && ok {
								table := oiTableForKind(sub.Kind)
								if table != "" {
									oiByTable[table] = append(oiByTable[table], store.OISnapshot{
										Ts:          ts,
										Exchange:    quote.Exchange,
										SymbolToken: quote.SymbolToken,
										OI:          quote.OI,
										Raw:         quote.Raw,
									})
								}
								if pcrEnabled && strings.HasPrefix(strings.ToUpper(sub.Kind), "OPT") && sub.Expiry != nil && sub.Right != "" {
									key := sub.Underlying + "|" + sub.Expiry.Format("2006-01-02")
									entry := pcrAccum[key]
									if entry == nil {
										entry = &pcrAgg{Underlying: sub.Underlying, Expiry: *sub.Expiry}
										pcrAccum[key] = entry
									}
									if strings.EqualFold(sub.Right, "CE") {
										entry.CEOI += *quote.OI
									} else if strings.EqualFold(sub.Right, "PE") {
										entry.PEOI += *quote.OI
									}
								}
							}
						}
						if err := st.UpsertQuoteSnapshots(jobCtx, snapRows); err != nil && logger != nil {
							logger.Warn("quote_snapshot_upsert_failed", "job", label, "err", err)
							notifyCollector(ctx, "quote_snapshot_upsert_failed", "Data Capture", fmt.Sprintf("Quote snapshot upsert failed (%s): %v", label, err))
						}
						if err := st.UpsertDepth5Snapshots(jobCtx, depthRows); err != nil && logger != nil {
							logger.Warn("depth_snapshot_upsert_failed", "job", label, "err", err)
						}
						if cfg.RestTasks.EnableOISnapshots {
							for table, rows := range oiByTable {
								if err := st.UpsertOISnapshots(jobCtx, table, rows); err != nil && logger != nil {
									logger.Warn("oi_snapshot_upsert_failed", "table", table, "err", err)
								}
							}
						}
						return nil
					},
				})
				if err := <-done; err != nil {
					if logger != nil {
						logger.Warn("quote_snapshot_failed", "job", label, "err", err)
					}
					notifyCollector(ctx, "quote_snapshot_failed", "Data Capture", fmt.Sprintf("Quote snapshot failed (%s): %v", label, err))
					continue
				}
			}
			if stockWebhook != nil && label == "quote_snapshot" && len(webhookStocks) > 0 {
				payload := stockWebhookPayload{
					EventType: "stock_quote_snapshot", SchemaVersion: "1.0",
					RunID: fmt.Sprintf("stock-quotes-%d", ts.UnixNano()), CollectedAt: ts,
					Source: "smartapi", MarketSession: marketSessionAt(ts, cfg), Stocks: webhookStocks,
				}
				if err := stockWebhook.Send(ctx, payload); err != nil && logger != nil {
					logger.Warn("stock_webhook_failed", "run_id", payload.RunID, "stocks", len(webhookStocks), "err", err)
				}
			}
			if pcrEnabled && time.Since(lastPCR) >= time.Duration(cfg.RestTasks.PCRSnapshotIntervalSeconds)*time.Second {
				pcrRows := buildPCRSnapshots(ts, pcrAccum)
				if err := st.UpsertPCRSnapshots(ctx, pcrRows); err != nil && logger != nil {
					logger.Warn("pcr_snapshot_upsert_failed", "job", label, "err", err)
					notifyCollector(ctx, "pcr_snapshot_upsert_failed", "Data Capture", fmt.Sprintf("PCR snapshot upsert failed (%s): %v", label, err))
				}
				lastPCR = time.Now()
			}
		}
	}
}

func runOISnapshots(ctx context.Context, cfg *config.Config, st *store.Store, subIndex *subscriptionIndex, oiCache *oiCache, logger *slog.Logger) error {
	if !cfg.RestTasks.EnableOISnapshots && !cfg.RestTasks.EnablePCRSnapshots {
		return nil
	}
	interval := time.Duration(cfg.RestTasks.OISnapshotIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 60 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	prev := map[string]int64{}
	var lastPCR time.Time

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if oiCache == nil {
				continue
			}
			snapshots := oiCache.Snapshot()
			if len(snapshots) == 0 {
				continue
			}
			ts := time.Now().UTC()
			oiByTable := map[string][]store.OISnapshot{}
			pcrAccum := map[string]*pcrAgg{}
			for key, entry := range snapshots {
				exchange, token := splitSubKey(key)
				if exchange == "" {
					continue
				}
				sub, ok := subIndex.Get(exchange, token)
				if !ok {
					continue
				}
				table := oiTableForKind(sub.Kind)
				if table == "" {
					continue
				}
				oi := entry.OI
				var oiChange *int64
				var oiChangePct *float64
				if prevVal, ok := prev[key]; ok {
					diff := oi - prevVal
					oiChange = &diff
					if prevVal != 0 {
						pct := float64(diff) / float64(prevVal) * 100
						oiChangePct = &pct
					}
				}
				prev[key] = oi
				rawMap := map[string]any{
					"oi":           oi,
					"exchange":     exchange,
					"symbol_token": token,
					"ts":           ts.Format(time.RFC3339Nano),
				}
				if sub.Underlying != "" {
					rawMap["underlying"] = sub.Underlying
				}
				if sub.Expiry != nil {
					rawMap["expiry"] = sub.Expiry.Format("2006-01-02")
				}
				if sub.Right != "" {
					rawMap["right"] = strings.ToUpper(sub.Right)
				}
				raw, err := json.Marshal(rawMap)
				if err != nil {
					raw = []byte("{}")
				}
				oiByTable[table] = append(oiByTable[table], store.OISnapshot{
					Ts:          ts,
					Exchange:    exchange,
					SymbolToken: token,
					OI:          &oi,
					OIChange:    oiChange,
					OIChangePct: oiChangePct,
					Raw:         raw,
				})
				if cfg.RestTasks.EnablePCRSnapshots && strings.HasPrefix(strings.ToUpper(sub.Kind), "OPT") && sub.Expiry != nil && sub.Right != "" {
					key := sub.Underlying + "|" + sub.Expiry.Format("2006-01-02")
					entry := pcrAccum[key]
					if entry == nil {
						entry = &pcrAgg{Underlying: sub.Underlying, Expiry: *sub.Expiry}
						pcrAccum[key] = entry
					}
					if strings.EqualFold(sub.Right, "CE") {
						entry.CEOI += oi
					} else if strings.EqualFold(sub.Right, "PE") {
						entry.PEOI += oi
					}
				}
			}
			if cfg.RestTasks.EnableOISnapshots {
				for table, rows := range oiByTable {
					if err := st.UpsertOISnapshots(ctx, table, rows); err != nil && logger != nil {
						logger.Warn("oi_snapshot_upsert_failed", "table", table, "err", err)
						notifyCollector(ctx, "oi_snapshot_upsert_failed", "Data Capture", fmt.Sprintf("OI snapshot upsert failed (%s): %v", table, err))
					}
				}
			}
			if cfg.RestTasks.EnablePCRSnapshots && time.Since(lastPCR) >= time.Duration(cfg.RestTasks.PCRSnapshotIntervalSeconds)*time.Second {
				pcrRows := buildPCRSnapshots(ts, pcrAccum)
				if err := st.UpsertPCRSnapshots(ctx, pcrRows); err != nil && logger != nil {
					logger.Warn("pcr_snapshot_upsert_failed", "err", err)
					notifyCollector(ctx, "pcr_snapshot_upsert_failed", "Data Capture", fmt.Sprintf("PCR snapshot upsert failed: %v", err))
				}
				lastPCR = time.Now()
			}
		}
	}
}

type pcrAgg struct {
	Underlying string    `json:"underlying"`
	Expiry     time.Time `json:"expiry"`
	CEOI       int64     `json:"ce_oi"`
	PEOI       int64     `json:"pe_oi"`
}

func buildPCRSnapshots(ts time.Time, accum map[string]*pcrAgg) []store.PCRSnapshot {
	var rows []store.PCRSnapshot
	for _, agg := range accum {
		if agg.CEOI <= 0 {
			continue
		}
		pcr := float64(agg.PEOI) / float64(agg.CEOI)
		raw, _ := json.Marshal(agg)
		rows = append(rows, store.PCRSnapshot{
			Ts:         ts,
			Underlying: agg.Underlying,
			Expiry:     agg.Expiry,
			PCR:        &pcr,
			CEOI:       &agg.CEOI,
			PEOI:       &agg.PEOI,
			Raw:        raw,
		})
	}
	return rows
}

func buildQuoteBatches(subs []store.Subscription, includeOptions bool, includeNonOptions bool, maxTokens int, rotation *quoteRotation, rotationMax int, primaryKinds map[string]struct{}, primarySymbols map[string]struct{}, rotationBudgets map[string]int, rotationBudgetOrder []string) []map[string][]string {
	perExchange := map[string][]string{}
	if rotationMax <= 0 || rotation == nil {
		for _, sub := range subs {
			kind := strings.ToUpper(sub.Kind)
			isOption := strings.HasPrefix(kind, "OPT")
			if isOption && !includeOptions {
				continue
			}
			if !isOption && !includeNonOptions {
				continue
			}
			perExchange[sub.Exchange] = append(perExchange[sub.Exchange], sub.SymbolToken)
		}
		return splitBatches(perExchange, maxTokens)
	}

	if primaryKinds == nil {
		primaryKinds = map[string]struct{}{}
	}
	primaryByExchange := map[string][]string{}
	secondaryByExchange := map[string][]string{}
	secondaryByExchangeKind := map[string]map[string][]string{}
	useBudgets := len(rotationBudgets) > 0

	for _, sub := range subs {
		kind := strings.ToUpper(sub.Kind)
		isOption := strings.HasPrefix(kind, "OPT")
		if isOption && !includeOptions {
			continue
		}
		if !isOption && !includeNonOptions {
			continue
		}
		isPrimary := false
		if _, ok := primaryKinds[kind]; ok {
			isPrimary = true
			if kind == "INDEX" && len(primarySymbols) > 0 {
				primarySymbol := strings.ToUpper(strings.TrimSpace(sub.TradingSymbol))
				primaryUnderlying := strings.ToUpper(strings.TrimSpace(sub.Underlying))
				if _, ok := primarySymbols[primarySymbol]; !ok {
					if _, ok := primarySymbols[primaryUnderlying]; !ok {
						isPrimary = false
					}
				}
			}
		}
		if isPrimary {
			primaryByExchange[sub.Exchange] = append(primaryByExchange[sub.Exchange], sub.SymbolToken)
			continue
		}
		if useBudgets {
			if secondaryByExchangeKind[sub.Exchange] == nil {
				secondaryByExchangeKind[sub.Exchange] = map[string][]string{}
			}
			secondaryByExchangeKind[sub.Exchange][kind] = append(secondaryByExchangeKind[sub.Exchange][kind], sub.SymbolToken)
		} else {
			secondaryByExchange[sub.Exchange] = append(secondaryByExchange[sub.Exchange], sub.SymbolToken)
		}
	}

	if useBudgets {
		for exch, byKind := range secondaryByExchangeKind {
			remaining := rotationMax
			orderedKinds := make([]string, 0, len(byKind))
			seen := map[string]struct{}{}
			for _, kind := range rotationBudgetOrder {
				kind = strings.ToUpper(strings.TrimSpace(kind))
				if kind == "" {
					continue
				}
				if _, ok := byKind[kind]; ok {
					orderedKinds = append(orderedKinds, kind)
					seen[kind] = struct{}{}
				}
			}
			var restKinds []string
			for kind := range byKind {
				if _, ok := seen[kind]; ok {
					continue
				}
				restKinds = append(restKinds, kind)
			}
			sort.Strings(restKinds)
			orderedKinds = append(orderedKinds, restKinds...)

			for _, kind := range orderedKinds {
				if remaining <= 0 {
					break
				}
				tokens := byKind[kind]
				if len(tokens) == 0 {
					continue
				}
				limit := rotationMax
				if budget, ok := rotationBudgets[kind]; ok {
					limit = budget
				}
				if limit <= 0 {
					continue
				}
				if limit > remaining {
					limit = remaining
				}
				selected := rotation.Take(exch+":"+kind, tokens, limit)
				if len(selected) == 0 {
					continue
				}
				primaryByExchange[exch] = append(primaryByExchange[exch], selected...)
				remaining -= len(selected)
			}
		}
	} else {
		for exch, tokens := range secondaryByExchange {
			selected := rotation.Take(exch, tokens, rotationMax)
			if len(selected) == 0 {
				continue
			}
			primaryByExchange[exch] = append(primaryByExchange[exch], selected...)
		}
	}

	return splitBatches(primaryByExchange, maxTokens)
}

func splitBatches(perExchange map[string][]string, maxTokens int) []map[string][]string {
	var batches []map[string][]string
	for exch, tokens := range perExchange {
		for len(tokens) > 0 {
			chunk := tokens
			if maxTokens > 0 && len(tokens) > maxTokens {
				chunk = tokens[:maxTokens]
				tokens = tokens[maxTokens:]
			} else {
				tokens = nil
			}
			batches = append(batches, map[string][]string{exch: chunk})
		}
	}
	return batches
}

func clonePayload(payload map[string]any) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(payload))
	for k, v := range payload {
		out[k] = v
	}
	return out
}

func marshalPayload(payload map[string]any) []byte {
	if len(payload) == 0 {
		return []byte("{}")
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

func payloadValue(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			if value == nil {
				continue
			}
			return strings.TrimSpace(fmt.Sprintf("%v", value))
		}
	}
	return ""
}

func payloadLabel(payload map[string]any) string {
	label := payloadValue(payload, "label", "type", "category", "sorttype", "sortType", "datatype", "dataType")
	label = strings.TrimSpace(strings.ToUpper(label))
	return label
}

func normalizePayloadKey(payload map[string]any, from, to string) {
	if payload == nil {
		return
	}
	if _, ok := payload[to]; ok {
		return
	}
	if value, ok := payload[from]; ok {
		payload[to] = value
	}
}

func normalizeExpiryPayload(payload map[string]any, now time.Time) {
	expiry := payloadValue(payload, "expiry", "expirydate", "expiryDate")
	if expiry == "" {
		return
	}
	parsed, err := time.ParseInLocation("2006-01-02", expiry, now.Location())
	if err != nil {
		return
	}
	if !parsed.After(now) {
		delete(payload, "expiry")
		delete(payload, "expirydate")
		delete(payload, "expiryDate")
		payload["expirytype"] = "NEAR"
		payload["expiryType"] = "NEAR"
	}
}

func normalizeGainersLosersPayload(payload map[string]any) {
	sortType := strings.ToUpper(payloadValue(payload, "sorttype", "sortType"))
	dataType := payloadValue(payload, "datatype", "dataType")
	expiryType := strings.ToUpper(payloadValue(payload, "expirytype", "expiryType"))
	if expiryType == "" {
		payload["expirytype"] = "NEAR"
		payload["expiryType"] = "NEAR"
	} else {
		payload["expirytype"] = expiryType
		payload["expiryType"] = expiryType
	}
	if dataType == "" && sortType != "" {
		switch sortType {
		case "GAINER":
			dataType = "PercPriceGainers"
		case "LOSER":
			dataType = "PercPriceLosers"
		}
	}
	if dataType != "" {
		payload["datatype"] = canonicalGainersLosersType(dataType)
	}
	normalizePayloadKey(payload, "expirytype", "expiryType")
	delete(payload, "sorttype")
	delete(payload, "sortType")
}

func normalizeOIBuildupPayload(payload map[string]any, now time.Time) {
	normalizePayloadKey(payload, "type", "datatype")
	normalizePayloadKey(payload, "expirytype", "expiryType")
	expiryType := strings.ToUpper(payloadValue(payload, "expirytype", "expiryType"))
	if expiryType == "" {
		payload["expirytype"] = "NEAR"
		payload["expiryType"] = "NEAR"
	} else {
		payload["expirytype"] = expiryType
		payload["expiryType"] = expiryType
	}
	dataType := payloadValue(payload, "datatype", "dataType", "type")
	if dataType != "" {
		payload["datatype"] = canonicalOIBuildupType(dataType)
	}
	delete(payload, "type")
	delete(payload, "dataType")
	normalizeExpiryPayload(payload, now)
}

func canonicalGainersLosersType(value string) string {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(value, " ", ""), "_", ""))
	switch normalized {
	case "percoigainers":
		return "PercOIGainers"
	case "percoilosers":
		return "PercOILosers"
	case "percpricegainers", "percchangegainers":
		return "PercPriceGainers"
	case "percpricelosers", "percchangelosers":
		return "PercPriceLosers"
	case "percchange":
		return "PercPriceGainers"
	default:
		return strings.TrimSpace(value)
	}
}

func canonicalOIBuildupType(value string) string {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(value, " ", ""), "_", ""))
	switch normalized {
	case "longbuildup":
		return "Long Built Up"
	case "shortbuildup":
		return "Short Built Up"
	case "shortcovering":
		return "Short Covering"
	case "longunwinding":
		return "Long Unwinding"
	default:
		return strings.TrimSpace(value)
	}
}

func isNoDataErr(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "no data")
}

func optionGreekAliases(underlying string) []string {
	switch strings.ToUpper(strings.TrimSpace(underlying)) {
	case "NIFTY50":
		return []string{"NIFTY"}
	default:
		return nil
	}
}

func oiTableForKind(kind string) string {
	switch strings.ToUpper(kind) {
	case "EQUITY":
		return "oi_snapshots_equity"
	case "INDEX":
		return "oi_snapshots_index"
	case "FUT":
		return "oi_snapshots_futures"
	case "OPTIDX", "OPTSTK", "OPTSTK_REST":
		return "oi_snapshots_options"
	default:
		return ""
	}
}

func runOptionGreeks(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, logger *slog.Logger, loc *time.Location) error {
	if !cfg.RestTasks.EnableOptionGreeks {
		return nil
	}
	ticker := time.NewTicker(time.Duration(cfg.RestTasks.OptionGreeksIntervalSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			subs, err := st.ListActiveSubscriptions(ctx)
			if err != nil {
				if logger != nil {
					logger.Warn("option_greeks_subs_failed", "err", err)
				}
				continue
			}
			expiryByUnderlying := map[string]time.Time{}
			for _, sub := range subs {
				if !strings.HasPrefix(strings.ToUpper(sub.Kind), "OPT") || sub.Expiry == nil {
					continue
				}
				if existing, ok := expiryByUnderlying[sub.Underlying]; !ok || sub.Expiry.Before(existing) {
					expiryByUnderlying[sub.Underlying] = *sub.Expiry
				}
			}
			for _, underlying := range cfg.RestTasks.OptionGreeksUnderlyings {
				normalized := universe.NormalizeIndexUnderlying(underlying)
				expiry, ok := expiryByUnderlying[normalized]
				if !ok {
					continue
				}
				expiryCode := expiry.In(loc).Format("02Jan2006")
				expiryCode = strings.ToUpper(expiryCode)
				targets := append([]string{normalized}, optionGreekAliases(normalized)...)
				done := queue.Submit(restJob{
					endpoint: endpointGreeks,
					name:     "option_greeks",
					priority: priorityLow,
					run: func(jobCtx context.Context) error {
						start := time.Now()
						var rows []smartapi.OptionGreekRow
						var err error
						for idx, target := range targets {
							rows, err = smartapi.FetchOptionGreeks(jobCtx, cfg.SmartAPI, provider, target, expiryCode, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
							if err != nil {
								if idx < len(targets)-1 && isNoDataErr(err) {
									continue
								}
								return err
							}
							break
						}
						recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
							Ts:               start.UTC(),
							Endpoint:         string(endpointGreeks),
							Name:             "option_greeks",
							Success:          err == nil,
							Throttled:        isThrottleErr(err),
							LatencyMs:        time.Since(start).Milliseconds(),
							SymbolsRequested: 1,
							SymbolsReturned:  len(rows),
							ErrorMessage:     errorMessage(err),
						})
						var snaps []store.OptionGreek
						ts := time.Now().UTC()
						for _, row := range rows {
							snaps = append(snaps, store.OptionGreek{
								Ts:            ts,
								Underlying:    normalized,
								Expiry:        expiry,
								TradingSymbol: row.TradingSymbol,
								Strike:        row.Strike,
								Right:         strings.ToUpper(row.Right),
								IV:            row.IV,
								Delta:         row.Delta,
								Gamma:         row.Gamma,
								Theta:         row.Theta,
								Vega:          row.Vega,
								LTP:           row.LTP,
								TradeVolume:   row.TradeVolume,
								Raw:           row.Raw,
							})
						}
						if err := st.UpsertOptionGreeks(jobCtx, snaps); err != nil && logger != nil {
							logger.Warn("option_greeks_upsert_failed", "err", err)
							notifyCollector(ctx, "option_greeks_upsert_failed", "Data Capture", fmt.Sprintf("Option greeks upsert failed: %v", err))
						}
						return nil
					},
				})
				if err := <-done; err != nil {
					if logger != nil {
						logger.Warn("option_greeks_failed", "underlying", normalized, "err", err)
					}
					notifyCollector(ctx, "option_greeks_failed", "Data Capture", fmt.Sprintf("Option greeks failed (%s): %v", normalized, err))
					continue
				}
			}
		}
	}
}

func runGainersLosers(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, logger *slog.Logger) error {
	if !cfg.RestTasks.EnableGainersLosers {
		return nil
	}
	if len(cfg.RestTasks.GainersLosersPayloads) == 0 {
		if logger != nil {
			logger.Warn("gainers_losers_disabled", "reason", "payloads_empty")
		}
		return nil
	}
	interval := time.Duration(cfg.RestTasks.GainersLosersIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 300 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			ts := time.Now().UTC()
			for _, payload := range cfg.RestTasks.GainersLosersPayloads {
				payloadCopy := clonePayload(payload)
				normalizeGainersLosersPayload(payloadCopy)
				paramsRaw := marshalPayload(payloadCopy)
				exchange := payloadValue(payloadCopy, "exchange", "exch", "exchangeType", "segment")
				label := payloadLabel(payloadCopy)
				if exchange == "" {
					exchange = "NA"
				}
				if label == "" {
					label = "DEFAULT"
				}
				done := queue.Submit(restJob{
					endpoint: endpointAggregates,
					name:     "gainers_losers",
					priority: priorityLow,
					run: func(jobCtx context.Context) error {
						start := time.Now()
						raw, err := smartapi.FetchGainersLosers(jobCtx, cfg.SmartAPI, provider, payloadCopy, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
						recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
							Ts:               start.UTC(),
							Endpoint:         string(endpointAggregates),
							Name:             "gainers_losers",
							Success:          err == nil,
							Throttled:        isThrottleErr(err),
							LatencyMs:        time.Since(start).Milliseconds(),
							SymbolsRequested: 0,
							SymbolsReturned:  0,
							ErrorMessage:     errorMessage(err),
						})
						if err != nil {
							return err
						}
						return st.UpsertGainersLosersSnapshots(jobCtx, []store.GainersLosersSnapshot{{
							Ts:       ts,
							Exchange: exchange,
							Label:    label,
							Params:   paramsRaw,
							Raw:      raw,
						}})
					},
				})
				if err := <-done; err != nil && logger != nil {
					logger.Warn("gainers_losers_failed", "label", label, "err", err)
					notifyCollector(ctx, "gainers_losers_failed", "Data Capture", fmt.Sprintf("Gainers/losers failed (%s): %v", label, err))
				}
			}
		}
	}
}

func runOIBuildup(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, logger *slog.Logger) error {
	if !cfg.RestTasks.EnableOIBuildup {
		return nil
	}
	loc, err := time.LoadLocation(cfg.Runtime.Timezone)
	if err != nil {
		loc = time.FixedZone("IST", 5*60*60+30*60)
	}
	if len(cfg.RestTasks.OIBuildupPayloads) == 0 {
		if logger != nil {
			logger.Warn("oi_buildup_disabled", "reason", "payloads_empty")
		}
		return nil
	}
	interval := time.Duration(cfg.RestTasks.OIBuildupIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 300 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			ts := time.Now().UTC()
			for _, payload := range cfg.RestTasks.OIBuildupPayloads {
				payloadCopy := clonePayload(payload)
				normalizeOIBuildupPayload(payloadCopy, time.Now().In(loc))
				paramsRaw := marshalPayload(payloadCopy)
				exchange := payloadValue(payloadCopy, "exchange", "exch", "exchangeType", "segment")
				label := payloadLabel(payloadCopy)
				if exchange == "" {
					exchange = "NA"
				}
				if label == "" {
					label = "DEFAULT"
				}
				done := queue.Submit(restJob{
					endpoint: endpointAggregates,
					name:     "oi_buildup",
					priority: priorityLow,
					run: func(jobCtx context.Context) error {
						start := time.Now()
						raw, err := smartapi.FetchOIBuildup(jobCtx, cfg.SmartAPI, provider, payloadCopy, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
						recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
							Ts:               start.UTC(),
							Endpoint:         string(endpointAggregates),
							Name:             "oi_buildup",
							Success:          err == nil,
							Throttled:        isThrottleErr(err),
							LatencyMs:        time.Since(start).Milliseconds(),
							SymbolsRequested: 0,
							SymbolsReturned:  0,
							ErrorMessage:     errorMessage(err),
						})
						if err != nil {
							return err
						}
						return st.UpsertOIBuildupSnapshots(jobCtx, []store.OIBuildupSnapshot{{
							Ts:       ts,
							Exchange: exchange,
							Label:    label,
							Params:   paramsRaw,
							Raw:      raw,
						}})
					},
				})
				if err := <-done; err != nil && logger != nil {
					logger.Warn("oi_buildup_failed", "label", label, "err", err)
					notifyCollector(ctx, "oi_buildup_failed", "Data Capture", fmt.Sprintf("OI buildup failed (%s): %v", label, err))
				}
			}
		}
	}
}

func runPutCallRatio(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, logger *slog.Logger) error {
	if !cfg.RestTasks.EnablePutCallRatio {
		return nil
	}
	interval := time.Duration(cfg.RestTasks.PutCallRatioIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 300 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			ts := time.Now().UTC()
			done := queue.Submit(restJob{
				endpoint: endpointAggregates,
				name:     "put_call_ratio",
				priority: priorityLow,
				run: func(jobCtx context.Context) error {
					start := time.Now()
					raw, err := smartapi.FetchPutCallRatio(jobCtx, cfg.SmartAPI, provider, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
					recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
						Ts:               start.UTC(),
						Endpoint:         string(endpointAggregates),
						Name:             "put_call_ratio",
						Success:          err == nil,
						Throttled:        isThrottleErr(err),
						LatencyMs:        time.Since(start).Milliseconds(),
						SymbolsRequested: 0,
						SymbolsReturned:  0,
						ErrorMessage:     errorMessage(err),
					})
					if err != nil {
						return err
					}
					return st.UpsertPutCallRatioSnapshots(jobCtx, []store.PutCallRatioSnapshot{{
						Ts:     ts,
						Label:  "PCR",
						Params: []byte("{}"),
						Raw:    raw,
					}})
				},
			})
			if err := <-done; err != nil && logger != nil {
				logger.Warn("put_call_ratio_failed", "err", err)
				notifyCollector(ctx, "put_call_ratio_failed", "Data Capture", fmt.Sprintf("Put/call ratio failed: %v", err))
			}
		}
	}
}

func runRestFallback1m(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, subIndex *subscriptionIndex, queue *restQueue, ticks *tickTracker, stateCache *instrumentStateCache, loc *time.Location, logger *slog.Logger) error {
	if !cfg.RestTasks.EnableRestFallback {
		return nil
	}
	interval := time.Duration(cfg.RestTasks.RestFallbackIntervalSeconds) * time.Second
	staleThreshold := time.Duration(cfg.RestTasks.RestFallbackStaleSeconds) * time.Second
	lookbackMinutes := cfg.RestTasks.RestFallbackLookbackMinutes
	if lookbackMinutes < 1 {
		lookbackMinutes = 2
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			now := time.Now().In(loc)
			// REST fallback is a live-session repair path. Replaying the final
			// minute every minute overnight/weekends wastes the candle quota and
			// competes with the governed historical backfill.
			if outsideMarketHours(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc) {
				continue
			}
			referenceDay := now
			end := now
			if cfg.Runtime.WeekendPullLastWorkingDay && outsideMarketHours(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc) {
				day := lastWorkingDay(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc)
				referenceDay = day
				if _, tradingEnd, err := tradingWindow(day, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc); err == nil {
					end = tradingEnd
				} else {
					end = day
				}
			}
			end = time.Date(end.Year(), end.Month(), end.Day(), end.Hour(), end.Minute(), 0, 0, loc).Add(-time.Minute)
			if end.IsZero() {
				continue
			}
			start := end.Add(-time.Duration(lookbackMinutes-1) * time.Minute)
			staleCutoff := time.Now().Add(-staleThreshold)
			lastTick := ticks.LastTickAt()
			broadOutage := lastTick.IsZero() || time.Since(lastTick) >= staleThreshold

			eligibleSubs := filterRestFallbackSubscriptions(subIndex.Snapshot())
			candidates := map[string]store.Subscription{}
			if broadOutage {
				for _, sub := range eligibleSubs {
					candidates[subKey(sub.Exchange, sub.SymbolToken)] = sub
				}
			} else {
				for _, sub := range eligibleSubs {
					lastSymbolTick := ticks.LastTickFor(sub.Exchange, sub.SymbolToken)
					if lastSymbolTick.IsZero() || !lastSymbolTick.Before(staleCutoff) {
						continue
					}
					candidates[subKey(sub.Exchange, sub.SymbolToken)] = sub
				}
				if marketOpen, _, err := tradingWindow(referenceDay, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc); err == nil {
					staleWatermarks, err := st.ListSubscriptionsWithStaleWatermarks(ctx, util.MinuteStartUTC(end, loc), marketOpen.UTC(), []string{"EQUITY", "INDEX"})
					if err != nil {
						if logger != nil {
							logger.Warn("rest_fallback_watermarks_failed", "err", err)
						}
					} else {
						for _, sub := range staleWatermarks {
							candidates[subKey(sub.Exchange, sub.SymbolToken)] = sub
						}
					}
				}
			}
			if len(candidates) == 0 {
				continue
			}

			age := -1.0
			if !lastTick.IsZero() {
				age = time.Since(lastTick).Seconds()
			}
			if logger != nil {
				if broadOutage {
					logger.Warn("rest_fallback_active", "mode", "global", "last_tick_ago_seconds", age, "symbols", len(candidates), "start", start.Format(time.RFC3339), "end", end.Format(time.RFC3339))
				} else {
					logger.Warn("rest_fallback_active", "mode", "partial", "last_tick_ago_seconds", age, "symbols", len(candidates), "start", start.Format(time.RFC3339), "end", end.Format(time.RFC3339))
				}
			}
			if broadOutage {
				notifyCollector(ctx, "rest_fallback_active", "Data Capture", fmt.Sprintf("REST fallback active (tick age %.0fs)", age))
			}

			for _, sub := range candidates {
				subCopy := sub
				startCopy := start
				endCopy := end
				done := queue.Submit(restJob{
					endpoint: endpointCandles,
					name:     "rest_fallback_1m",
					priority: priorityHigh,
					run: func(jobCtx context.Context) error {
						startCall := time.Now()
						candles, err := smartapi.FetchCandles(jobCtx, cfg.SmartAPI, provider, subCopy.Exchange, subCopy.SymbolToken, "ONE_MINUTE", startCopy, endCopy, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second, loc)
						recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
							Ts:               startCall.UTC(),
							Endpoint:         string(endpointCandles),
							Name:             "rest_fallback_1m",
							Success:          err == nil,
							Throttled:        isThrottleErr(err),
							LatencyMs:        time.Since(startCall).Milliseconds(),
							SymbolsRequested: 1,
							SymbolsReturned:  len(candles),
							ErrorMessage:     errorMessage(err),
						})
						if err != nil {
							return err
						}
						if len(candles) == 0 {
							return nil
						}
						bars := make([]store.Bar, 0, len(candles))
						for _, candle := range candles {
							bars = append(bars, store.Bar{
								Ts:          util.MinuteStartUTC(candle.Timestamp, loc),
								Exchange:    subCopy.Exchange,
								SymbolToken: subCopy.SymbolToken,
								Open:        candle.Open,
								High:        candle.High,
								Low:         candle.Low,
								Close:       candle.Close,
								Volume:      candle.Volume,
								Source:      "rest_fallback",
							})
							if stateCache != nil {
								price := candle.Close
								open := candle.Open
								high := candle.High
								low := candle.Low
								closeVal := candle.Close
								volume := candle.Volume
								stateCache.Update(store.InstrumentState{
									Exchange:    subCopy.Exchange,
									SymbolToken: subCopy.SymbolToken,
									LastSeen:    util.MinuteStartUTC(candle.Timestamp, loc),
									LastPrice:   &price,
									LastSource:  "rest_fallback",
									LastOpen:    &open,
									LastHigh:    &high,
									LastLow:     &low,
									LastClose:   &closeVal,
									LastVolume:  &volume,
								})
							}
						}
						if err := st.UpsertBars(jobCtx, bars); err != nil {
							return err
						}
						return st.UpsertWatermarks(jobCtx, bars)
					},
				})
				if err := <-done; err != nil && logger != nil {
					logger.Warn("rest_fallback_failed", "token", subCopy.SymbolToken, "err", err)
					notifyCollector(ctx, "rest_fallback_failed", "Data Capture", fmt.Sprintf("REST fallback failed (%s): %v", subCopy.SymbolToken, err))
				}
			}
		}
	}
}

func filterRestFallbackSubscriptions(subs []store.Subscription) []store.Subscription {
	filtered := make([]store.Subscription, 0, len(subs))
	for _, sub := range subs {
		switch strings.ToUpper(sub.Kind) {
		case "EQUITY", "INDEX":
			filtered = append(filtered, sub)
		}
	}
	return filtered
}

func runDailyHistory(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, loc *time.Location, logger *slog.Logger) error {
	if !cfg.History.EnableDaily {
		return nil
	}

	for {
		if err := runDailyHistoryOnce(ctx, cfg, provider, st, queue, loc, logger); err != nil && logger != nil {
			logger.Warn("daily_history_failed", "err", err)
			notifyCollector(ctx, "daily_history_failed", "Data Capture", fmt.Sprintf("Daily history failed: %v", err))
		}
		next := nextDailyRun(time.Now().In(loc), cfg.History.DailyRunTimeIST, loc)
		wait := time.Until(next)
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func runDailyHistoryOnce(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, loc *time.Location, logger *slog.Logger) error {
	subs, err := st.ListActiveSubscriptions(ctx)
	if err != nil {
		return err
	}
	trackKinds := map[string]struct{}{}
	for _, k := range cfg.History.TrackKinds {
		trackKinds[strings.ToUpper(k)] = struct{}{}
	}
	now := time.Now().In(loc)
	end := now
	if cfg.Runtime.WeekendPullLastWorkingDay && outsideMarketHours(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc) {
		end = lastWorkingDay(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc)
		if logger != nil {
			logger.Info("daily_history_end_adjusted", "reason", "outside_market_hours", "end", end.Format("2006-01-02"))
		}
	}
	end = time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 0, 0, loc)
	defaultStart := time.Date(end.Year()-cfg.History.DailyYears, end.Month(), end.Day(), 0, 0, 0, 0, loc)
	for _, sub := range subs {
		if _, ok := trackKinds[strings.ToUpper(sub.Kind)]; !ok {
			continue
		}
		start := defaultStart
		latest, err := st.LatestBar1DDate(ctx, sub.Exchange, sub.SymbolToken)
		if err != nil {
			if logger != nil {
				logger.Warn("daily_history_checkpoint_failed", "token", sub.SymbolToken, "err", err)
			}
		} else if latest != nil {
			next := time.Date(latest.Year(), latest.Month(), latest.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1)
			if next.After(start) {
				start = next
			}
		}
		if start.After(end) {
			continue
		}
		chunks := splitDateRange(start, end, cfg.History.DailyChunkDays, loc)
		for _, chunk := range chunks {
			done := queue.Submit(restJob{
				endpoint: endpointCandles,
				name:     "daily_history",
				priority: priorityLow,
				run: func(jobCtx context.Context) error {
					startCall := time.Now()
					candles, err := smartapi.FetchCandles(jobCtx, cfg.SmartAPI, provider, sub.Exchange, sub.SymbolToken, "ONE_DAY", chunk.start, chunk.end, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second, loc)
					recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
						Ts:               startCall.UTC(),
						Endpoint:         string(endpointCandles),
						Name:             "daily_history",
						Success:          err == nil,
						Throttled:        isThrottleErr(err),
						LatencyMs:        time.Since(startCall).Milliseconds(),
						SymbolsRequested: 1,
						SymbolsReturned:  len(candles),
						ErrorMessage:     errorMessage(err),
					})
					if err != nil {
						return err
					}
					var bars []store.Bar1D
					for _, candle := range candles {
						tradeDate := time.Date(candle.Timestamp.In(loc).Year(), candle.Timestamp.In(loc).Month(), candle.Timestamp.In(loc).Day(), 0, 0, 0, 0, time.UTC)
						bars = append(bars, store.Bar1D{
							TradeDate:   tradeDate,
							Exchange:    sub.Exchange,
							SymbolToken: sub.SymbolToken,
							Open:        candle.Open,
							High:        candle.High,
							Low:         candle.Low,
							Close:       candle.Close,
							Volume:      candle.Volume,
							Source:      "rest",
						})
					}
					if err := st.UpsertBars1D(jobCtx, bars); err != nil && logger != nil {
						logger.Warn("daily_history_upsert_failed", "err", err)
					}
					return nil
				},
			})
			if err := <-done; err != nil {
				if logger != nil {
					logger.Warn("daily_history_candles_failed", "token", sub.SymbolToken, "err", err)
				}
				continue
			}
		}
	}
	return nil
}

type dateRange struct {
	start time.Time
	end   time.Time
}

func splitDateRange(start, end time.Time, chunkDays int, loc *time.Location) []dateRange {
	if chunkDays <= 0 {
		chunkDays = 365
	}
	var ranges []dateRange
	cursor := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, loc)
	last := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 0, 0, loc)
	for cursor.Before(last) {
		next := cursor.AddDate(0, 0, chunkDays)
		if next.After(last) {
			next = last
		}
		ranges = append(ranges, dateRange{start: cursor, end: next})
		cursor = next.AddDate(0, 0, 1)
	}
	return ranges
}

func nextDailyRun(now time.Time, clock string, loc *time.Location) time.Time {
	parsed, err := time.ParseInLocation("15:04", clock, loc)
	if err != nil {
		return now.Add(6 * time.Hour)
	}
	next := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc)
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func isThrottleErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "429") || strings.Contains(msg, "rate") || strings.Contains(msg, "throttle") {
		return true
	}
	if strings.Contains(msg, "403") && strings.Contains(msg, "access") {
		return true
	}
	return false
}

func isRetryableErr(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) && (netErr.Timeout() || netErr.Temporary()) {
		return true
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "timeout") || strings.Contains(msg, "temporar") {
		return true
	}
	if strings.Contains(msg, "connection reset") || strings.Contains(msg, "connection refused") || strings.Contains(msg, "eof") {
		return true
	}
	if strings.Contains(msg, "something went wrong") || strings.Contains(msg, "try after sometime") || strings.Contains(msg, "try after some time") {
		return true
	}
	return strings.Contains(msg, " 500") || strings.Contains(msg, " 502") || strings.Contains(msg, " 503") || strings.Contains(msg, " 504")
}
