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
	Exchange    string
	SymbolToken string
	Timestamp   time.Time
	Buy         []smartapi.DepthLevel
	Sell        []smartapi.DepthLevel
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

func (c *depthSnapshotCache) Update(exchange, token string, ts time.Time, buy, sell []smartapi.DepthLevel) {
	exchange = strings.ToUpper(strings.TrimSpace(exchange))
	token = strings.TrimSpace(token)
	if exchange == "" || token == "" {
		return
	}
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	entry := depthSnapshotEntry{
		Exchange:    exchange,
		SymbolToken: token,
		Timestamp:   ts,
		Buy:         append([]smartapi.DepthLevel(nil), buy...),
		Sell:        append([]smartapi.DepthLevel(nil), sell...),
	}
	key := exchange + ":" + token
	c.mu.Lock()
	c.entries[key] = entry
	c.mu.Unlock()
}

func (c *depthSnapshotCache) Flush() []store.Depth5Snapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) == 0 {
		return nil
	}
	rows := make([]store.Depth5Snapshot, 0, len(c.entries)*10)
	for _, entry := range c.entries {
		ts := entry.Timestamp
		if ts.IsZero() {
			ts = time.Now().UTC()
		}
		rows = appendDepthRows(rows, entry.Exchange, entry.SymbolToken, ts, "B", entry.Buy)
		rows = appendDepthRows(rows, entry.Exchange, entry.SymbolToken, ts, "S", entry.Sell)
	}
	c.entries = make(map[string]depthSnapshotEntry)
	return rows
}

func appendDepthRows(rows []store.Depth5Snapshot, exchange, token string, ts time.Time, side string, levels []smartapi.DepthLevel) []store.Depth5Snapshot {
	maxLevels := 5
	if len(levels) < maxLevels {
		maxLevels = len(levels)
	}
	for i := 0; i < maxLevels; i++ {
		level := levels[i]
		price := level.Price
		qty := level.Quantity
		orders := level.Orders
		rows = append(rows, store.Depth5Snapshot{
			Ts:          ts,
			Exchange:    exchange,
			SymbolToken: token,
			Side:        side,
			Level:       int16(i + 1),
			Price:       &price,
			Quantity:    &qty,
			Orders:      &orders,
		})
	}
	return rows
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
		rows := cache.Flush()
		if len(rows) == 0 {
			return
		}
		if err := st.UpsertDepth5Snapshots(ctx, rows); err != nil && logger != nil {
			logger.Warn("depth_snapshot_flush_failed", "err", err)
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
