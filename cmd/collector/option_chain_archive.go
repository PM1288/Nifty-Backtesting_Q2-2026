package main

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/options"
	"trading-stack/internal/store"
)

type optionChainSnapshotOperation func(context.Context, time.Time, string) (int64, error)

func snapshotOptionChainWithRetry(
	ctx context.Context,
	snapshotTs time.Time,
	phase string,
	maxAttempts int,
	attemptTimeout time.Duration,
	retryBase time.Duration,
	operation optionChainSnapshotOperation,
) (int64, int, error) {
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	if attemptTimeout <= 0 {
		attemptTimeout = 45 * time.Second
	}
	if retryBase <= 0 {
		retryBase = 5 * time.Second
	}
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, attemptTimeout)
		rows, err := operation(attemptCtx, snapshotTs, phase)
		cancel()
		if err == nil {
			return rows, attempt, nil
		}
		lastErr = err
		if ctx.Err() != nil {
			return 0, attempt, ctx.Err()
		}
		if attempt == maxAttempts {
			break
		}
		delay := retryBase * time.Duration(1<<(attempt-1))
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return 0, attempt, ctx.Err()
		case <-timer.C:
		}
	}
	return 0, maxAttempts, lastErr
}

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
	attemptTimeout := time.Duration(cfg.Archive.OptionChainSnapshotTimeoutSeconds) * time.Second
	retryBase := time.Duration(cfg.Archive.OptionChainRetryBaseSeconds) * time.Second
	staleAfter := time.Duration(cfg.Archive.OptionChainStaleAfterSeconds) * time.Second
	maxAttempts := cfg.Archive.OptionChainSnapshotMaxAttempts
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case now := <-timer.C:
			timer.Reset(interval)
			phase := marketSessionPhase(now, cfg.Universe.DerivativesExchange, false, loc)
			if phase == "PREOPEN" || phase == "CLOSED" {
				continue
			}
			latest, latestErr := st.LatestOptionChainSnapshotTime(ctx)
			if latestErr != nil {
				if logger != nil {
					logger.Warn("option_chain_watch_failed", "err", latestErr)
				}
			} else if latest == nil || now.UTC().Sub(latest.UTC()) > staleAfter {
				age := "no successful snapshot"
				if latest != nil {
					age = now.UTC().Sub(latest.UTC()).Round(time.Second).String()
				}
				if logger != nil {
					logger.Warn("option_chain_snapshot_stale", "latest", latest, "age", age, "stale_after", staleAfter)
				}
				notifyCollector(ctx, "option_chain_snapshot_stale", "Derivatives Data Delayed", fmt.Sprintf("All-F&O option-chain archive is stale (%s); bounded recovery retry is active.", age))
			}
			snapshotTs := now.UTC().Truncate(time.Second)
			started := time.Now()
			rows, attempts, err := snapshotOptionChainWithRetry(ctx, snapshotTs, phase, maxAttempts, attemptTimeout, retryBase, st.SnapshotOptionChain)
			if err != nil {
				if logger != nil {
					logger.Warn("option_chain_snapshot_failed", "err", err, "attempts", attempts, "duration", time.Since(started))
				}
				notifyCollector(ctx, "option_chain_snapshot_failed", "Derivatives Data Capture", fmt.Sprintf("All-F&O option-chain snapshot failed after %d attempts: %v", attempts, err))
				continue
			}
			localGreeks, err := calculateAndStoreLocalGreeks(ctx, cfg, st, snapshotTs, loc)
			if err != nil && logger != nil {
				logger.Warn("option_chain_local_greeks_failed", "err", err)
			}
			if logger != nil {
				logger.Info("option_chain_snapshot_stored", "rows", rows, "local_greeks", localGreeks, "session_phase", phase, "attempts", attempts, "duration", time.Since(started))
			}
		}
	}
}
