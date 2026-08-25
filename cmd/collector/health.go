package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"trading-stack/internal/store"
)

type tickTracker struct {
	lastTickNs atomic.Int64
	mu         sync.RWMutex
	byKey      map[string]int64
}

func newTickTracker() *tickTracker {
	return &tickTracker{byKey: map[string]int64{}}
}

func (t *tickTracker) Mark(exchange, token string, ts time.Time) {
	if ts.IsZero() {
		ts = time.Now().UTC()
	}
	ns := ts.UnixNano()
	t.lastTickNs.Store(ns)
	key := tickKey(exchange, token)
	if key == "" {
		return
	}
	t.mu.Lock()
	t.byKey[key] = ns
	t.mu.Unlock()
}

func (t *tickTracker) LastTickAt() time.Time {
	ns := t.lastTickNs.Load()
	if ns == 0 {
		return time.Time{}
	}
	return time.Unix(0, ns)
}

func (t *tickTracker) LastTickFor(exchange, token string) time.Time {
	key := tickKey(exchange, token)
	if key == "" {
		return time.Time{}
	}
	t.mu.RLock()
	ns := t.byKey[key]
	t.mu.RUnlock()
	if ns == 0 {
		return time.Time{}
	}
	return time.Unix(0, ns)
}

func tickKey(exchange, token string) string {
	exchange = strings.ToUpper(strings.TrimSpace(exchange))
	token = strings.TrimSpace(token)
	if exchange == "" || token == "" {
		return ""
	}
	return exchange + ":" + token
}

func startHealthServer(ctx context.Context, addr string, st *store.Store, ticks *tickTracker, subsCount *atomic.Int64, logger *slog.Logger, tradingStart, tradingEnd string, loc *time.Location) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":     "ok",
			"service":    "smartapi-collector",
			"checked_at": time.Now().UTC(),
		})
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		dbCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		dbErr := st.Ping(dbCtx)
		lastTick := ticks.LastTickAt()
		age := -1.0
		now := time.Now().In(defaultLoc(loc))
		marketOpen := !outsideMarketHours(now, tradingStart, tradingEnd, loc)
		if !lastTick.IsZero() {
			age = now.Sub(lastTick.In(defaultLoc(loc))).Seconds()
		} else if !marketOpen {
			// Outside hours and no tick yet: treat last expected close as end of window.
			_, end, err := tradingWindow(now, tradingStart, tradingEnd, loc)
			if err == nil {
				age = now.Sub(end).Seconds()
				lastTick = end
			}
		}
		wsConnected := marketOpen && age >= 0 && age <= 60
		ok := dbErr == nil && (!marketOpen || wsConnected)
		status := "ok"
		if !ok {
			status = "degraded"
		}

		resp := map[string]interface{}{
			"status":                status,
			"ws_connected":          wsConnected,
			"last_tick_ago_seconds": age,
			"subscriptions_count":   subsCount.Load(),
			"market_open":           marketOpen,
			"expected_close":        tradingEnd,
		}
		if dbErr != nil {
			resp["db_error"] = dbErr.Error()
		}
		w.Header().Set("Content-Type", "application/json")
		if !ok {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_ = json.NewEncoder(w).Encode(resp)
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		lastTick := ticks.LastTickAt()
		age := -1.0
		if !lastTick.IsZero() {
			age = time.Since(lastTick).Seconds()
		}
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		_, _ = w.Write([]byte("# HELP smartapi_collector_subscriptions Active broker subscriptions.\n"))
		_, _ = w.Write([]byte("# TYPE smartapi_collector_subscriptions gauge\n"))
		_, _ = w.Write([]byte("smartapi_collector_subscriptions " + formatMetricInt(subsCount.Load()) + "\n"))
		_, _ = w.Write([]byte("# HELP smartapi_collector_last_tick_age_seconds Age of the newest received market tick.\n"))
		_, _ = w.Write([]byte("# TYPE smartapi_collector_last_tick_age_seconds gauge\n"))
		_, _ = w.Write([]byte("smartapi_collector_last_tick_age_seconds " + formatMetricFloat(age) + "\n"))
	})

	srv := &http.Server{Addr: addr, Handler: mux}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	if logger != nil {
		logger.Info("health server started", "addr", addr)
	}
	err := srv.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func formatMetricInt(value int64) string {
	return strconv.FormatInt(value, 10)
}

func formatMetricFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 3, 64)
}
