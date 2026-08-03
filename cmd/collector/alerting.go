package main

import (
	"context"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/alerts"
)

const defaultAlertCooldown = 10 * time.Minute

var (
	collectorAlerts  *alerts.Client
	collectorLimiter *alertLimiter
	collectorAlertsEnabled bool
)

type alertLimiter struct {
	mu   sync.Mutex
	last map[string]time.Time
}

func newAlertLimiter() *alertLimiter {
	return &alertLimiter{last: map[string]time.Time{}}
}

func (l *alertLimiter) Allow(key string, cooldown time.Duration) bool {
	if l == nil {
		return true
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return true
	}
	if cooldown <= 0 {
		cooldown = defaultAlertCooldown
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if last, ok := l.last[key]; ok && now.Sub(last) < cooldown {
		return false
	}
	l.last[key] = now
	return true
}

func setCollectorAlerts(client *alerts.Client, limiter *alertLimiter, enabled bool) {
	collectorAlerts = client
	collectorLimiter = limiter
	collectorAlertsEnabled = enabled
}

func notifyCollector(ctx context.Context, key, title, message string) {
	if collectorAlerts == nil {
		return
	}
	if !collectorAlertsEnabled {
		return
	}
	if collectorLimiter != nil && !collectorLimiter.Allow(key, defaultAlertCooldown) {
		return
	}
	_ = collectorAlerts.Send(ctx, title, message)
}
