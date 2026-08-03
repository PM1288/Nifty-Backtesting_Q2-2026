package ratelimit

import (
	"context"
	"sync"
	"time"
)

type AdaptiveLimiter struct {
	mu          sync.Mutex
	minRPS      int
	maxRPS      int
	currentRPS  int
	stepUpAfter time.Duration
	nextAt      time.Time
	lastAdjust  time.Time
}

func NewAdaptiveLimiter(minRPS, maxRPS, startRPS int, stepUpAfter time.Duration) *AdaptiveLimiter {
	if minRPS < 1 {
		minRPS = 1
	}
	if maxRPS < minRPS {
		maxRPS = minRPS
	}
	if startRPS <= 0 {
		startRPS = maxRPS
	}
	if startRPS < minRPS {
		startRPS = minRPS
	}
	if startRPS > maxRPS {
		startRPS = maxRPS
	}
	return &AdaptiveLimiter{
		minRPS:      minRPS,
		maxRPS:      maxRPS,
		currentRPS:  startRPS,
		stepUpAfter: stepUpAfter,
	}
}

func (l *AdaptiveLimiter) Wait(ctx context.Context) error {
	for {
		l.mu.Lock()
		now := time.Now()
		wait := time.Duration(0)
		if !l.nextAt.IsZero() && now.Before(l.nextAt) {
			wait = l.nextAt.Sub(now)
		}
		if wait == 0 {
			interval := time.Second / time.Duration(l.currentRPS)
			if interval <= 0 {
				interval = time.Second
			}
			l.nextAt = now.Add(interval)
			l.mu.Unlock()
			return nil
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

func (l *AdaptiveLimiter) Throttle() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	backoff := time.Second
	if !l.lastAdjust.IsZero() && now.Sub(l.lastAdjust) < 10*time.Second {
		backoff = 2 * time.Second
	}
	if l.currentRPS > l.minRPS {
		l.currentRPS--
	}
	l.nextAt = now.Add(backoff)
	l.lastAdjust = now
}

func (l *AdaptiveLimiter) Success() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.currentRPS >= l.maxRPS || l.stepUpAfter <= 0 {
		return
	}
	now := time.Now()
	if l.lastAdjust.IsZero() || now.Sub(l.lastAdjust) >= l.stepUpAfter {
		l.currentRPS++
		l.lastAdjust = now
	}
}
