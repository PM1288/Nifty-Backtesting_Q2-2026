package smartapi

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type SubscriptionSource func(ctx context.Context) ([]store.Subscription, error)

type WSManager struct {
	cfg       config.SmartAPIConfig
	wsCfg     config.WSConfig
	provider  TokenProvider
	logger    *slog.Logger
	reconcile time.Duration
}

func NewWSManager(cfg config.SmartAPIConfig, wsCfg config.WSConfig, provider TokenProvider, logger *slog.Logger) *WSManager {
	return &WSManager{
		cfg:       cfg,
		wsCfg:     wsCfg,
		provider:  provider,
		logger:    logger,
		reconcile: 30 * time.Second,
	}
}

func (m *WSManager) Run(ctx context.Context, source SubscriptionSource, out chan<- Tick) error {
	subscriptions, err := source(ctx)
	if err != nil {
		return err
	}
	active, dropped := applyCapacityLimits(subscriptions, m.wsCfg.MaxConnections, m.wsCfg.MaxTokensPerConnection)
	if len(dropped) > 0 && m.logger != nil {
		m.logger.Warn("ws_capacity_drop", "dropped", len(dropped))
	}

	shards := partitionSubscriptions(active, m.wsCfg.MaxConnections, m.wsCfg.MaxTokensPerConnection)
	updates := make([]chan []store.Subscription, len(shards))

	eg, egCtx := errgroup.WithContext(ctx)
	for i, shardSubs := range shards {
		ch := make(chan []store.Subscription, 1)
		updates[i] = ch
		streamer := NewStreamer(m.cfg, m.wsCfg, m.provider, m.logger)
		eg.Go(func() error {
			return runShard(egCtx, streamer, shardSubs, ch, out, m.logger)
		})
	}

	eg.Go(func() error {
		ticker := time.NewTicker(m.reconcile)
		defer ticker.Stop()
		for {
			select {
			case <-egCtx.Done():
				return egCtx.Err()
			case <-ticker.C:
				subs, err := source(egCtx)
				if err != nil {
					if m.logger != nil {
						m.logger.Warn("ws_reconcile_failed", "err", err)
					}
					continue
				}
				active, dropped := applyCapacityLimits(subs, m.wsCfg.MaxConnections, m.wsCfg.MaxTokensPerConnection)
				if len(dropped) > 0 && m.logger != nil {
					m.logger.Warn("ws_capacity_drop", "dropped", len(dropped))
				}
				parts := partitionSubscriptions(active, m.wsCfg.MaxConnections, m.wsCfg.MaxTokensPerConnection)
				for i := range updates {
					var next []store.Subscription
					if i < len(parts) {
						next = parts[i]
					}
					select {
					case updates[i] <- next:
					default:
						<-updates[i]
						updates[i] <- next
					}
				}
			}
		}
	})

	return eg.Wait()
}

type wsShard struct {
	connSubs map[string]store.Subscription
	desired  []store.Subscription
}

func runShard(ctx context.Context, streamer *Streamer, initial []store.Subscription, updates <-chan []store.Subscription, out chan<- Tick, logger *slog.Logger) error {
	backoff := time.Second
	maxBackoff := time.Duration(streamer.wsCfg.MaxReconnectBackoffSeconds) * time.Second
	state := &wsShard{connSubs: map[string]store.Subscription{}, desired: initial}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if len(state.desired) == 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case next := <-updates:
				state.desired = next
				continue
			case <-time.After(2 * time.Second):
				continue
			}
		}

		conn, err := streamer.connect(ctx)
		if err != nil {
			if logger != nil {
				logger.Warn("ws_connect_failed", "err", err)
			}
			time.Sleep(backoff)
			backoff = minDuration(maxBackoff, backoff*2)
			continue
		}
		backoff = time.Second
		streamer.connected.Store(true)

		if err := streamer.subscribeAll(conn, state.desired); err != nil {
			if logger != nil {
				logger.Warn("ws_subscribe_failed", "err", err)
			}
			_ = conn.Close()
			streamer.connected.Store(false)
			continue
		}
		state.connSubs = map[string]store.Subscription{}
		for _, sub := range state.desired {
			state.connSubs[subKey(sub)] = sub
		}

		readErr := make(chan error, 1)
		go func() { readErr <- streamer.readLoop(ctx, conn, out) }()

		for {
			select {
			case <-ctx.Done():
				_ = conn.Close()
				streamer.connected.Store(false)
				return ctx.Err()
			case err := <-readErr:
				streamer.connected.Store(false)
				_ = conn.Close()
				if err != nil && logger != nil && err != context.Canceled {
					logger.Warn("ws_read_loop_exit", "err", err)
				}
				if err != nil && IsAuthError(err) {
					if _, refreshErr := streamer.provider.Refresh(ctx, "ws_read"); refreshErr != nil && logger != nil {
						logger.Warn("ws_refresh_failed", "err", refreshErr)
					}
				}
				goto Reconnect
			case next := <-updates:
				state.desired = next
				add, remove := diffSubs(state.connSubs, next)
				if len(remove) > 0 {
					_ = streamer.unsubscribeAll(conn, remove)
				}
				if len(add) > 0 {
					_ = streamer.subscribeAll(conn, add)
				}
				state.connSubs = map[string]store.Subscription{}
				for _, sub := range next {
					state.connSubs[subKey(sub)] = sub
				}
			}
		}
	Reconnect:
		continue
	}
}

func diffSubs(current map[string]store.Subscription, next []store.Subscription) (add []store.Subscription, remove []store.Subscription) {
	nextMap := map[string]store.Subscription{}
	for _, sub := range next {
		nextMap[subKey(sub)] = sub
		if _, ok := current[subKey(sub)]; !ok {
			add = append(add, sub)
		}
	}
	for key, sub := range current {
		if _, ok := nextMap[key]; !ok {
			remove = append(remove, sub)
		}
	}
	return add, remove
}

func subKey(sub store.Subscription) string {
	return strings.Join([]string{sub.Exchange, sub.SymbolToken, strings.ToUpper(sub.Mode)}, ":")
}

func applyCapacityLimits(subs []store.Subscription, maxConnections, maxTokens int) ([]store.Subscription, []store.Subscription) {
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

func partitionSubscriptions(subs []store.Subscription, maxConnections, maxTokens int) [][]store.Subscription {
	if maxConnections < 1 {
		return nil
	}
	shards := make([][]store.Subscription, maxConnections)
	var options []store.Subscription
	var primary []store.Subscription
	for _, sub := range subs {
		kind := strings.ToUpper(sub.Kind)
		if strings.HasPrefix(kind, "OPT") {
			options = append(options, sub)
		} else {
			primary = append(primary, sub)
		}
	}
	shards[0] = append(shards[0], primary...)
	if maxConnections == 1 {
		shards[0] = append(shards[0], options...)
		return []([]store.Subscription){truncate(shards[0], maxTokens)}
	}

	shards[1] = append(shards[1], options...)
	if maxTokens <= 0 {
		return shards
	}

	overflow0 := []store.Subscription{}
	if len(shards[0]) > maxTokens {
		overflow0 = append(overflow0, shards[0][maxTokens:]...)
		shards[0] = shards[0][:maxTokens]
	}

	if maxConnections == 2 {
		shards[1] = truncate(shards[1], maxTokens)
		return shards
	}

	overflow1 := []store.Subscription{}
	if len(shards[1]) > maxTokens {
		overflow1 = append(overflow1, shards[1][maxTokens:]...)
		shards[1] = shards[1][:maxTokens]
	}
	shards[2] = append(shards[2], overflow0...)
	shards[2] = append(shards[2], overflow1...)

	cap0 := maxTokens - len(shards[0])
	if cap0 > 0 && len(shards[2]) > 0 {
		move := minInt(cap0, len(shards[2]))
		shards[0] = append(shards[0], shards[2][:move]...)
		shards[2] = shards[2][move:]
	}

	shards[2] = truncate(shards[2], maxTokens)
	return shards
}

func truncate(src []store.Subscription, limit int) []store.Subscription {
	if limit <= 0 || len(src) <= limit {
		return src
	}
	return src[:limit]
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
