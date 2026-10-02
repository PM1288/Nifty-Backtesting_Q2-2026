package main

import (
	"context"
	"log/slog"
	"time"
	"trading-stack/internal/store"
)

// Bound pending work during DB outages and drain the producer on normal shutdown.
func runBarWriter(ctx context.Context, input <-chan store.Bar, persist func(context.Context, []store.Bar) error, logger *slog.Logger) error {
	return runBoundedBatchWriter(ctx, input, persist, logger, "bar", 200, 2*time.Second)
}

// The producer must close input after its final send. Cancellation gives queued
// data a separate bounded drain window rather than discarding the queue.
func runBoundedBatchWriter[T any](ctx context.Context, input <-chan T, persist func(context.Context, []T) error, logger *slog.Logger, name string, batchSize int, interval time.Duration) error {
	buffer := make([]T, 0, batchSize)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	writeCtx := ctx
	parentDone := ctx.Done()
	var shutdownDone <-chan struct{}
	cancelShutdown := func() {}
	defer func() { cancelShutdown() }()
	beginShutdown := func() {
		if ctx.Err() != nil && parentDone != nil {
			parentDone = nil
			writeCtx, cancelShutdown = context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			shutdownDone = writeCtx.Done()
		}
	}
	flush := func() error {
		beginShutdown()
		if len(buffer) == 0 {
			return nil
		}
		attemptCtx, cancel := context.WithTimeout(writeCtx, 3*time.Second)
		defer cancel()
		if err := persist(attemptCtx, buffer); err != nil {
			if logger != nil {
				logger.Warn(name+"_flush_failed", "rows", len(buffer), "err", err)
			}
			return err
		}
		clear(buffer)
		buffer = buffer[:0]
		return nil
	}
	for {
		beginShutdown()
		if shutdownDone != nil && writeCtx.Err() != nil {
			if logger != nil {
				logger.Error(name+"_shutdown_pending", "rows", len(buffer)+len(input))
			}
			return writeCtx.Err()
		}
		next := input
		if len(buffer) >= batchSize {
			next = nil
		}
		select {
		case <-parentDone:
			beginShutdown()
		case <-shutdownDone:
			if logger != nil {
				logger.Error(name+"_shutdown_pending", "rows", len(buffer)+len(input))
			}
			return writeCtx.Err()
		case row, ok := <-next:
			if !ok {
				if err := flush(); err != nil {
					// Avoid spinning on a closed channel while awaiting a retry.
					select {
					case <-ticker.C:
					case <-writeCtx.Done():
						beginShutdown()
					}
					continue
				}
				return nil
			}
			buffer = append(buffer, row)
			if len(buffer) >= batchSize {
				_ = flush()
			}
		case <-ticker.C:
			_ = flush()
		}
	}
}
