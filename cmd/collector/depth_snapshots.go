package main

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

type depthSnapshotEntry struct {
	Exchange     string
	SymbolToken  string
	Timestamp    time.Time
	Buy          []smartapi.DepthLevel
	Sell         []smartapi.DepthLevel
	SessionPhase string
}

type depthSnapshotCache struct {
	mu      sync.Mutex
	entries map[string]depthSnapshotEntry
}

func newDepthSnapshotCache() *depthSnapshotCache {
	return &depthSnapshotCache{
		mu:      sync.Mutex{},
		entries: make(map[string]depthSnapshotEntry),
	}
}

func (c *depthSnapshotCache) Update(exchange, token string, ts time.Time, sessionPhase string, buy, sell []smartapi.DepthLevel) {
	exchange = strings.ToUpper(strings.TrimSpace(exchange))
	token = strings.TrimSpace(token)
	if exchange == "" || token == "" {
		return
	}
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	entry := depthSnapshotEntry{
		Exchange:     exchange,
		SymbolToken:  token,
		Timestamp:    ts,
		Buy:          append([]smartapi.DepthLevel(nil), buy...),
		Sell:         append([]smartapi.DepthLevel(nil), sell...),
		SessionPhase: sessionPhase,
	}
	key := exchange + ":" + token
	c.mu.Lock()
	c.entries[key] = entry
	c.mu.Unlock()
}

func (c *depthSnapshotCache) Flush() ([]store.Depth5Snapshot, []store.Depth5Metric) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) == 0 {
		return nil, nil
	}
	rows := make([]store.Depth5Snapshot, 0, len(c.entries)*10)
	metrics := make([]store.Depth5Metric, 0, len(c.entries))
	for _, entry := range c.entries {
		ts := entry.Timestamp
		if ts.IsZero() {
			ts = time.Now().UTC()
		}
		rows = appendDepthRows(rows, entry.Exchange, entry.SymbolToken, ts, entry.SessionPhase, "B", entry.Buy)
		rows = appendDepthRows(rows, entry.Exchange, entry.SymbolToken, ts, entry.SessionPhase, "S", entry.Sell)
		metrics = append(metrics, calculateDepthMetric(entry.Exchange, entry.SymbolToken, ts, entry.SessionPhase, entry.Buy, entry.Sell))
	}
	c.entries = make(map[string]depthSnapshotEntry)
	return rows, metrics
}

func appendDepthRows(rows []store.Depth5Snapshot, exchange, token string, ts time.Time, sessionPhase, side string, levels []smartapi.DepthLevel) []store.Depth5Snapshot {
	maxLevels := 5
	if len(levels) < maxLevels {
		maxLevels = len(levels)
	}
	var cumulativeQty int64
	var cumulativeNotional float64
	for i := 0; i < maxLevels; i++ {
		level := levels[i]
		price := level.Price
		qty := level.Quantity
		orders := level.Orders
		cumulativeQty += qty
		cumulativeNotional += price * float64(qty)
		cumQty := cumulativeQty
		cumNotional := cumulativeNotional
		rows = append(rows, store.Depth5Snapshot{
			Ts:                 ts,
			Exchange:           exchange,
			SymbolToken:        token,
			Side:               side,
			Level:              int16(i + 1),
			Price:              &price,
			Quantity:           &qty,
			Orders:             &orders,
			CumulativeQuantity: &cumQty,
			CumulativeNotional: &cumNotional,
			SessionPhase:       sessionPhase,
		})
	}
	return rows
}

func calculateDepthMetric(exchange, token string, ts time.Time, sessionPhase string, buy, sell []smartapi.DepthLevel) store.Depth5Metric {
	metric := store.Depth5Metric{Ts: ts, Exchange: exchange, SymbolToken: token, SessionPhase: sessionPhase}
	var bidNotional, askNotional float64
	var bidQty, askQty int64
	for i, level := range buy {
		if i >= 5 {
			break
		}
		bidNotional += level.Price * float64(level.Quantity)
		bidQty += level.Quantity
	}
	for i, level := range sell {
		if i >= 5 {
			break
		}
		askNotional += level.Price * float64(level.Quantity)
		askQty += level.Quantity
	}
	metric.BidNotional5 = &bidNotional
	metric.AskNotional5 = &askNotional
	if bidQty+askQty > 0 {
		value := float64(bidQty-askQty) / float64(bidQty+askQty)
		metric.DepthImbalance = &value
	}
	if len(buy) > 0 && len(sell) > 0 && buy[0].Price > 0 && sell[0].Price > 0 {
		bid, ask := buy[0].Price, sell[0].Price
		midpoint, spread := (bid+ask)/2, ask-bid
		metric.BestBid, metric.BestAsk = &bid, &ask
		metric.Midpoint, metric.Spread = &midpoint, &spread
		if midpoint > 0 {
			spreadPct := spread / midpoint
			metric.SpreadPct = &spreadPct
		}
		levelQty := buy[0].Quantity + sell[0].Quantity
		if levelQty > 0 {
			microprice := (ask*float64(buy[0].Quantity) + bid*float64(sell[0].Quantity)) / float64(levelQty)
			metric.Microprice = &microprice
		}
	}
	return metric
}

func runDepthSnapshotFlush(ctx context.Context, cfg *config.Config, st *store.Store, cache *depthSnapshotCache, logger *slog.Logger) error {
	if cfg == nil || st == nil || cache == nil {
		return nil
	}
	if !cfg.WS.EnableDepthSnapshots {
		return nil
	}
	interval := time.Duration(cfg.WS.DepthSnapshotIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 5 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	flush := func() {
		rows, metrics := cache.Flush()
		if len(rows) == 0 {
			return
		}
		if err := st.UpsertDepth5Snapshots(ctx, rows); err != nil && logger != nil {
			logger.Warn("depth_snapshot_flush_failed", "err", err)
		}
		if err := st.UpsertDepth5Metrics(ctx, metrics); err != nil && logger != nil {
			logger.Warn("depth_metric_flush_failed", "err", err)
		}
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return ctx.Err()
		case <-ticker.C:
			flush()
		}
	}
}
