package ratelimit

import (
	"testing"
	"time"
)

func TestAdaptiveMinimumCannotRaiseEndpointCeiling(t *testing.T) {
	limiter := NewAdaptiveLimiter(5, 1, 5, time.Second)
	if limiter.maxRPS != 1 || limiter.minRPS != 1 || limiter.currentRPS != 1 {
		t.Fatal("quote safety ceiling was raised by shared adaptive minimum")
	}
	limiter.Success()
	if limiter.currentRPS != 1 {
		t.Fatal("success exceeded endpoint limit")
	}
}
