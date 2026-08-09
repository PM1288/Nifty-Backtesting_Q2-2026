package main

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

const stockDerivativePlanName = "NIFTY250_STOCK_DERIVATIVES"

func refreshSubscriptions(ctx context.Context, st *store.Store, insts []instruments.Instrument, baseSubs []store.Subscription, cfg *config.Config, prices *priceCache, logger *slog.Logger, now time.Time) ([]store.Subscription, error) {
	equities := filterKinds(baseSubs, "EQUITY")
	indices := filterKinds(baseSubs, "INDEX")
	liveSubs, liveErr := st.ListOIISLiveSubscriptions(ctx)
	if liveErr != nil && logger != nil {
		logger.Warn("oiis_live_watchlist_load_failed", "err", liveErr)
	}
	selection, err := universe.ResolveDerivativeSelection(insts, equities, indices, cfg.Universe, cfg.WS, priceProvider(prices), logger, now)
	if err != nil {
		return nil, err
	}
	desired := append([]store.Subscription{}, baseSubs...)
	desired = appendUniqueSubscriptions(desired, liveSubs...)
	desired = append(desired, selection.Subscriptions...)
	for i := range desired {
		desired[i].Active = true
	}
	keep, dropped := enforceCapacity(desired, cfg.WS.MaxConnections, cfg.WS.MaxTokensPerConnection)
	planRows := applyDerivativePlanActivity(selection.PlanRows, keep)
	combined := append([]store.Subscription{}, keep...)
	combined = append(combined, dropped...)
	removed, err := diffRemoved(ctx, st, combined)
	if err != nil {
		return nil, err
	}
	updates := append([]store.Subscription{}, keep...)
	updates = append(updates, dropped...)
	updates = append(updates, removed...)
	if err := st.UpsertSubscriptions(ctx, updates); err != nil {
		return nil, err
	}
	if err := st.ReplaceDerivativeTokenPlan(ctx, stockDerivativePlanName, derivativePlanDate(now), planRows); err != nil {
		return nil, err
	}
	if cfg.Metrics.Enable {
		entries := buildInstrumentUniverseEntries(keep)
		if err := st.SyncInstrumentUniverse(ctx, entries); err != nil && logger != nil {
			logger.Warn("instrument_universe_sync_failed", "err", err)
		}
	}
	if logger != nil {
		logger.Info("subscriptions_refreshed",
			"base", len(baseSubs),
			"oiis_live", len(liveSubs),
			"derivatives", len(selection.Subscriptions),
			"stock_derivative_plan", len(planRows),
			"active", len(keep),
			"dropped", len(dropped),
			"removed", len(removed),
		)
	}
	return keep, nil
}

func appendUniqueSubscriptions(base []store.Subscription, extra ...store.Subscription) []store.Subscription {
	seen := make(map[string]struct{}, len(base)+len(extra))
	for _, sub := range base {
		seen[subscriptionKey(sub)] = struct{}{}
	}
	for _, sub := range extra {
		if _, exists := seen[subscriptionKey(sub)]; exists {
			continue
		}
		base = append(base, sub)
		seen[subscriptionKey(sub)] = struct{}{}
	}
	return base
}

func diffRemoved(ctx context.Context, st *store.Store, desired []store.Subscription) ([]store.Subscription, error) {
	active, err := st.ListActiveSubscriptions(ctx)
	if err != nil {
		return nil, err
	}
	desiredKeys := map[string]struct{}{}
	for _, sub := range desired {
		desiredKeys[subscriptionKey(sub)] = struct{}{}
	}
	var removed []store.Subscription
	for _, sub := range active {
		if _, ok := desiredKeys[subscriptionKey(sub)]; !ok {
			sub.Active = false
			if sub.Reason == "" {
				sub.Reason = "refresh_drop"
			}
			removed = append(removed, sub)
		}
	}
	return removed, nil
}

func subscriptionKey(sub store.Subscription) string {
	return strings.ToUpper(strings.TrimSpace(sub.Exchange)) + ":" + strings.TrimSpace(sub.SymbolToken) + ":" + strings.ToUpper(strings.TrimSpace(sub.Mode))
}

func priceProvider(prices *priceCache) universe.PriceProvider {
	return func(underlying string) (float64, bool) {
		if prices == nil {
			return 0, false
		}
		if value, ok := prices.Get(underlying); ok {
			return value, true
		}
		return prices.Get(universe.NormalizeIndexUnderlying(underlying))
	}
}

func filterKinds(subs []store.Subscription, kind string) []store.Subscription {
	var out []store.Subscription
	upper := strings.ToUpper(kind)
	for _, sub := range subs {
		if strings.ToUpper(sub.Kind) == upper {
			out = append(out, sub)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].TradingSymbol < out[j].TradingSymbol
	})
	return out
}

func derivativePlanDate(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func applyDerivativePlanActivity(rows []store.DerivativeTokenPlanEntry, keep []store.Subscription) []store.DerivativeTokenPlanEntry {
	if len(rows) == 0 {
		return nil
	}
	activeKeys := map[string]struct{}{}
	for _, sub := range keep {
		activeKeys[subscriptionKey(sub)] = struct{}{}
	}
	updated := make([]store.DerivativeTokenPlanEntry, len(rows))
	copy(updated, rows)
	for i := range updated {
		key := strings.ToUpper(strings.TrimSpace(updated[i].Exchange)) + ":" + strings.TrimSpace(updated[i].SymbolToken) + ":" + strings.ToUpper(strings.TrimSpace(updated[i].Mode))
		if _, ok := activeKeys[key]; ok {
			updated[i].Active = true
			updated[i].Reason = ""
			continue
		}
		updated[i].Active = false
		if strings.TrimSpace(updated[i].Reason) == "" {
			updated[i].Reason = "capacity_drop"
		}
	}
	return updated
}
