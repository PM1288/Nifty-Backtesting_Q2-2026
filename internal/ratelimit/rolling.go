package ratelimit

import (
	"context"
	"sync"
	"time"
)

type RollingLimiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	stamps []time.Time
}

func NewRollingLimiter(max int, window time.Duration) *RollingLimiter {
	if max < 1 {
		max = 1
	}
	return &RollingLimiter{
		max:    max,
		window: window,
	}
}

func (l *RollingLimiter) Wait(ctx context.Context) error {
	for {
		l.mu.Lock()
		now := time.Now()
		l.prune(now)
		if len(l.stamps) < l.max {
			l.stamps = append(l.stamps, now)
			l.mu.Unlock()
			return nil
		}
		oldest := l.stamps[0]
		wait := l.window - now.Sub(oldest)
		if wait < 0 {
			wait = 0
		}
		l.mu.Unlock()

		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (l *RollingLimiter) prune(now time.Time) {
	cutoff := now.Add(-l.window)
	idx := 0
	for idx < len(l.stamps) && l.stamps[idx].Before(cutoff) {
		idx++
	}
	if idx > 0 {
		l.stamps = append([]time.Time{}, l.stamps[idx:]...)
	}
}
