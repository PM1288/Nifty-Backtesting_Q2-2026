package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

type tickArchiveSampler struct {
	mu              sync.Mutex
	last            map[string]time.Time
	minimumInterval time.Duration
}

func newTickArchiveSampler(milliseconds int) *tickArchiveSampler {
	return &tickArchiveSampler{last: map[string]time.Time{}, minimumInterval: time.Duration(milliseconds) * time.Millisecond}
}

func (s *tickArchiveSampler) Accept(tick smartapi.Tick) bool {
	if s == nil || s.minimumInterval <= 0 {
		return true
	}
	key := subKey(tick.Exchange, tick.Token)
	s.mu.Lock()
	defer s.mu.Unlock()
	if previous, ok := s.last[key]; ok && tick.ReceivedAt.Sub(previous) < s.minimumInterval {
		return false
	}
	s.last[key] = tick.ReceivedAt
	return true
}

type wsConnectionStat struct {
	LastSequenceByToken map[string]int64
	LastTick            time.Time
	Ticks               int64
	Gaps                int64
}

type wsHealthTracker struct {
	mu                 sync.Mutex
	connections        map[string]wsConnectionStat
	subscriptionCounts map[string]int
	dropped            atomic.Int64
}

func newWSHealthTracker() *wsHealthTracker {
	return &wsHealthTracker{connections: map[string]wsConnectionStat{}, subscriptionCounts: map[string]int{}}
}

func (t *wsHealthTracker) SetSubscriptionCounts(counts map[string]int) {
	if t == nil {
		return
	}
	t.mu.Lock()
	t.subscriptionCounts = make(map[string]int, len(counts))
	for connection, count := range counts {
		t.subscriptionCounts[connection] = count
		if _, exists := t.connections[connection]; !exists {
			t.connections[connection] = wsConnectionStat{LastSequenceByToken: map[string]int64{}}
		}
	}
	t.mu.Unlock()
}

func (t *wsHealthTracker) Mark(tick smartapi.Tick) {
	if t == nil {
		return
	}
	connection := tick.ConnectionID
	if connection == "" {
		connection = "smartapi-ws-unknown"
	}
	t.mu.Lock()
	stat := t.connections[connection]
	if stat.LastSequenceByToken == nil {
		stat.LastSequenceByToken = map[string]int64{}
	}
	tokenKey := subKey(tick.Exchange, tick.Token)
	lastSequence := stat.LastSequenceByToken[tokenKey]
	// SmartAPI exposes an exchange sequence number, not a guaranteed contiguous
	// per-subscription counter. Large positive jumps are therefore expected and
	// must not be reported as packet loss. Count only duplicate/out-of-order
	// observations during a live connection window. A lower sequence after a
	// prolonged silence is treated as a reconnect/reset.
	if lastSequence > 0 && tick.Sequence < lastSequence && (stat.LastTick.IsZero() || tick.ReceivedAt.Sub(stat.LastTick) <= 60*time.Second) {
		stat.Gaps++
	}
	if tick.Sequence > lastSequence || (!stat.LastTick.IsZero() && tick.ReceivedAt.Sub(stat.LastTick) > 60*time.Second) {
		stat.LastSequenceByToken[tokenKey] = tick.Sequence
	}
	stat.LastTick = tick.ReceivedAt
	stat.Ticks++
	t.connections[connection] = stat
	t.mu.Unlock()
}

func (t *wsHealthTracker) Drop() {
	if t != nil {
		t.dropped.Add(1)
	}
}

func (t *wsHealthTracker) Snapshot(ts time.Time, subscriptions int) []store.WebsocketHealth {
	if t == nil {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	rows := make([]store.WebsocketHealth, 0, len(t.connections))
	for connection, stat := range t.connections {
		last := stat.LastTick
		status := "CONNECTED"
		if last.IsZero() || ts.Sub(last) > 60*time.Second {
			status = "STALE"
		}
		subscriptionCount := t.subscriptionCounts[connection]
		if subscriptionCount == 0 {
			subscriptionCount = subscriptions
		}
		detail, _ := json.Marshal(map[string]any{
			"tokens_tracked":         len(stat.LastSequenceByToken),
			"sequence_metric":        "duplicate_or_out_of_order_observations",
			"archive_dropped_global": t.dropped.Load(),
		})
		rows = append(rows, store.WebsocketHealth{Ts: ts, ConnectionID: connection, Status: status,
			SubscriptionsCount: subscriptionCount, LastTickTs: &last, TicksReceived: stat.Ticks,
			SequenceGaps: stat.Gaps, ArchiveDropped: t.dropped.Load(), Detail: detail})
	}
	return rows
}

func marketTickFromSmart(tick smartapi.Tick, phase string) store.MarketTick {
	received := tick.ReceivedAt
	if received.IsZero() {
		received = time.Now().UTC()
	}
	return store.MarketTick{ExchangeTs: tick.Timestamp, ReceivedTs: received,
		ConnectionID: tick.ConnectionID, SequenceNo: tick.Sequence, SubscriptionMode: int16(tick.Mode),
		Exchange: tick.Exchange, SymbolToken: tick.Token, SessionPhase: phase, LTP: tick.LTP,
		LastTradeQty: tick.LastQty, AvgPrice: tick.AvgPrice, DayVolume: tick.CumVolume,
		TotalBuyQty: tick.TotalBuy, TotalSellQty: tick.TotalSell, Open: tick.Open, High: tick.High,
		Low: tick.Low, Close: tick.Close, LastTradeTs: tick.LastTrade, OI: tick.OI,
		OIChangePct: tick.OIChangePct, UpperCircuit: tick.UpperCirc, LowerCircuit: tick.LowerCirc,
		Week52High: tick.WeekHigh, Week52Low: tick.WeekLow, Raw: tick.Raw}
}

func runMarketTickArchive(ctx context.Context, st *store.Store, input <-chan store.MarketTick, batchSize int, logger *slog.Logger) error {
	if batchSize < 1 {
		batchSize = 1000
	}
	buffer := make([]store.MarketTick, 0, batchSize)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	flush := func() {
		if len(buffer) == 0 {
			return
		}
		if err := st.InsertMarketTicks(ctx, buffer); err != nil {
			if logger != nil {
				logger.Warn("market_tick_archive_flush_failed", "rows", len(buffer), "err", err)
			}
			return
		}
		buffer = buffer[:0]
	}
	for {
		select {
		case <-ctx.Done():
			flush()
			return ctx.Err()
		case row := <-input:
			buffer = append(buffer, row)
			if len(buffer) >= batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func runWebsocketHealthArchive(ctx context.Context, cfg *config.Config, st *store.Store, tracker *wsHealthTracker, subs *atomic.Int64, logger *slog.Logger) error {
	interval := time.Duration(cfg.Archive.WebsocketHealthIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-ticker.C:
			for _, row := range tracker.Snapshot(now.UTC().Truncate(time.Second), int(subs.Load())) {
				if err := st.InsertWebsocketHealth(ctx, row); err != nil && logger != nil {
					logger.Warn("websocket_health_archive_failed", "connection", row.ConnectionID, "err", err)
				}
			}
		}
	}
}
