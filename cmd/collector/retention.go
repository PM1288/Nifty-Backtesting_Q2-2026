package main

import (
	"context"
	"log/slog"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

func runRetention(ctx context.Context, cfg *config.Config, st *store.Store, loc *time.Location, logger *slog.Logger) error {
	if !cfg.Retention.EnableCleanup {
		return nil
	}
	for {
		results, err := st.CleanupRetention(ctx, cfg.Retention, loc)
		if err != nil && logger != nil {
			logger.Warn("retention_cleanup_failed", "err", err)
		}
		if logger != nil {
			logger.Info("retention_cleanup_done", "results", results, "dry_run", cfg.Retention.DryRun)
		}
		var next time.Time
		if cfg.Retention.CleanupIntervalMinutes > 0 {
			next = time.Now().In(loc).Add(time.Duration(cfg.Retention.CleanupIntervalMinutes) * time.Minute)
		} else {
			next = nextDailyRun(time.Now().In(loc), cfg.Retention.CleanupRunTimeIST, loc)
		}
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}
