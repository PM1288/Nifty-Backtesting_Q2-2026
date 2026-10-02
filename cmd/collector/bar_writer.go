package main

import (
	"context"
	"log/slog"
	"time"
	"trading-stack/internal/store"
)

// Bound pending work during DB outages and drain the producer on normal shutdown.
func runBarWriter(ctx context.Context, input <-chan store.Bar, persist func(context.Context, []store.Bar) error, logger *slog.Logger) error {
	const batchSize = 200
	buffer := make([]store.Bar, 0, batchSize)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	writeCtx := ctx
	parentDone := ctx.Done()
	var shutdownDone <-chan struct{}
	cancelShutdown := func() {}
	defer func() { cancelShutdown() }()
	flush := func() error {
		if len(buffer) == 0 {
			return nil
		}
		attemptCtx, cancel := context.WithTimeout(writeCtx, 3*time.Second)
		defer cancel()
		if err := persist(attemptCtx, buffer); err != nil {
			if logger != nil {
				logger.Warn("bar_flush_failed", "bars", len(buffer), "err", err)
			}
			return err
		}
		clear(buffer)
		buffer = buffer[:0]
		return nil
	}
	for {
		next := input
		if len(buffer) >= batchSize {
			next = nil
		}
		select {
		case <-parentDone:
			parentDone = nil
			writeCtx, cancelShutdown = context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			shutdownDone = writeCtx.Done()
		case <-shutdownDone:
			if logger != nil {
				logger.Error("bar_shutdown_pending", "bars", len(buffer)+len(input))
			}
			return writeCtx.Err()
		case bar, ok := <-next:
			if !ok {
				if ctx.Err() != nil && parentDone != nil {
					parentDone = nil
					writeCtx, cancelShutdown = context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
					shutdownDone = writeCtx.Done()
				}
				if err := flush(); err != nil {
					// Avoid spinning on a closed channel while awaiting a retry.
					select {
					case <-ticker.C:
					case <-writeCtx.Done():
						return writeCtx.Err()
					}
					continue
				}
				return nil
			}
			buffer = append(buffer, bar)
			if len(buffer) >= batchSize {
				_ = flush()
			}
		case <-ticker.C:
			_ = flush()
		}
	}
}
