package main

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/options"
	"trading-stack/internal/store"
)

func calculateAndStoreLocalGreeks(ctx context.Context, cfg *config.Config, st *store.Store, ts time.Time, loc *time.Location) (int, error) {
	inputs, err := st.ListOptionChainGreekInputs(ctx, ts)
	if err != nil {
		return 0, err
	}
	rows := make([]store.OptionChainLocalGreeks, 0, len(inputs))
	for _, input := range inputs {
		underlying := input.FuturePrice
		if underlying == nil || *underlying <= 0 {
			underlying = input.SpotPrice
		}
		if underlying == nil || input.Midpoint == nil {
			continue
		}
		expiryClose := time.Date(input.Expiry.In(loc).Year(), input.Expiry.In(loc).Month(), input.Expiry.In(loc).Day(), 15, 40, 0, 0, loc)
		years := expiryClose.Sub(ts.In(loc)).Hours() / (24 * 365)
		isCall := strings.EqualFold(input.Right, "CE")
		iv, ok := options.ImpliedVolatility(*input.Midpoint, *underlying, input.Strike, years, cfg.Archive.LocalGreekRiskFreeRate, isCall)
		if !ok {
			continue
		}
		_, greeks, ok := options.Black76(*underlying, input.Strike, years, cfg.Archive.LocalGreekRiskFreeRate, iv, isCall)
		if !ok {
			continue
		}
		rows = append(rows, store.OptionChainLocalGreeks{Exchange: input.Exchange, SymbolToken: input.SymbolToken,
			IV: iv, Delta: greeks.Delta, Gamma: greeks.Gamma, Theta: greeks.Theta, Vega: greeks.Vega})
	}
	return len(rows), st.UpdateOptionChainLocalGreeks(ctx, ts, rows)
}

func runOptionChainArchive(ctx context.Context, cfg *config.Config, st *store.Store, loc *time.Location, logger *slog.Logger) error {
	if cfg == nil || !cfg.Archive.Enable || !cfg.Archive.EnableOptionChainSnapshots {
		return nil
	}
	interval := time.Duration(cfg.Archive.OptionChainIntervalSeconds) * time.Second
	if interval < 30*time.Second {
		interval = 5 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-ticker.C:
			phase := marketSessionPhase(now, cfg.Universe.DerivativesExchange, false, loc)
			if phase == "PREOPEN" || phase == "CLOSED" {
				continue
			}
			snapshotTs := now.UTC().Truncate(time.Second)
			rows, err := st.SnapshotOptionChain(ctx, snapshotTs, phase)
			if err != nil {
				if logger != nil {
					logger.Warn("option_chain_snapshot_failed", "err", err)
				}
				continue
			}
			localGreeks, err := calculateAndStoreLocalGreeks(ctx, cfg, st, snapshotTs, loc)
			if err != nil && logger != nil {
				logger.Warn("option_chain_local_greeks_failed", "err", err)
			}
			if logger != nil {
				logger.Info("option_chain_snapshot_stored", "rows", rows, "local_greeks", localGreeks, "session_phase", phase)
			}
		}
	}
}
