package main

import (
	"context"
	"log/slog"
	"sync/atomic"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

func subscriptionRefreshLoop(ctx context.Context, cfg *config.Config, st *store.Store, insts []instruments.Instrument, baseSubs []store.Subscription, prices *priceCache, subIndex *subscriptionIndex, optionStates *optionStateIndex, wsTracker *wsHealthTracker, subsCount *atomic.Int64, logger *slog.Logger, triggers <-chan string, loc *time.Location) error {
	interval := time.Duration(cfg.Universe.Options.StrikeRefreshMinutes) * time.Minute
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	lastRefresh := time.Now()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case reason := <-triggers:
			// ATM monitoring runs every 30 seconds, but subscription plans must not
			// churn faster than the configured strike refresh cadence. Repeated
			// unsubscribe/subscribe storms can overload all three broker sockets.
			if time.Since(lastRefresh) < interval {
				if logger != nil {
					logger.Debug("options_refresh_deferred", "reason", reason, "next_in", interval-time.Since(lastRefresh))
				}
				continue
			}
			if logger != nil {
				logger.Info("options_refresh_triggered", "reason", reason)
			}
		case <-ticker.C:
			// An ATM trigger can become ready at the same instant as this ticker.
			// Coalesce the two events so only one subscription plan is applied.
			if time.Since(lastRefresh) < interval {
				continue
			}
		}
		active, err := refreshSubscriptions(ctx, st, insts, baseSubs, cfg, prices, logger, time.Now().In(loc))
		if err != nil {
			if logger != nil {
				logger.Warn("subscriptions_refresh_failed", "err", err)
			}
			continue
		}
		subIndex.Update(active)
		subsCount.Store(int64(len(active)))
		if wsTracker != nil {
			wsTracker.SetSubscriptionCounts(smartapi.SubscriptionCounts(active, cfg.WS.MaxConnections, cfg.WS.MaxTokensPerConnection))
		}
		optionStates.Update(buildOptionStates(active, prices, time.Now().In(loc)))
		lastRefresh = time.Now()
	}
}

func atmShiftMonitor(ctx context.Context, cfg *config.Config, optionStates *optionStateIndex, prices *priceCache, triggers chan<- string, logger *slog.Logger) error {
	if cfg.Universe.Options.ATMShiftRebuildSteps <= 0 {
		return nil
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			for _, state := range optionStates.Snapshot() {
				if state.NeedsRefresh(prices, cfg.Universe.Options.ATMShiftRebuildSteps) {
					select {
					case triggers <- "atm_shift":
					default:
					}
					if logger != nil {
						logger.Info("options_refresh_needed", "underlying", state.Underlying)
					}
					break
				}
			}
		}
	}
}
