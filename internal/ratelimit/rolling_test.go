package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestRollingLimiter(t *testing.T) {
	limiter := NewRollingLimiter(2, 50*time.Millisecond)
	ctx := context.Background()
	if err := limiter.Wait(ctx); err != nil {
		t.Fatalf("wait 1 failed: %v", err)
	}
	if err := limiter.Wait(ctx); err != nil {
		t.Fatalf("wait 2 failed: %v", err)
	}
	start := time.Now()
	if err := limiter.Wait(ctx); err != nil {
		t.Fatalf("wait 3 failed: %v", err)
	}
	if time.Since(start) < 40*time.Millisecond {
		t.Fatalf("expected limiter to delay, elapsed %s", time.Since(start))
	}
}
