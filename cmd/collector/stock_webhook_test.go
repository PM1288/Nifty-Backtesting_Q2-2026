package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"trading-stack/internal/config"
)

func TestStockWebhookSendPayloadAndRetry(t *testing.T) {
	var calls atomic.Int32
	var received stockWebhookPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("content type = %s", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		if calls.Add(1) == 1 {
			http.Error(w, "retry", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := newStockWebhookClient(config.StockWebhookConfig{
		Enabled: true, URL: server.URL, TimeoutSeconds: 1, MaxRetries: 1,
	}, nil)
	payload := stockWebhookPayload{
		EventType: "stock_quote_snapshot", SchemaVersion: "1.0", RunID: "test-run",
		CollectedAt: time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC), Source: "smartapi",
		Stocks: []stockWebhookQuote{{Symbol: "RELIANCE"}, {Symbol: "INFY"}},
	}
	if err := client.Send(context.Background(), payload); err != nil {
		t.Fatalf("Send() error = %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, want 2", calls.Load())
	}
	if received.StockCount != 2 {
		t.Fatalf("stock_count = %d, want 2", received.StockCount)
	}
	if received.Text == "" {
		t.Fatal("Mattermost-compatible text field is empty")
	}
	if received.Stocks[0].Symbol != "INFY" || received.Stocks[1].Symbol != "RELIANCE" {
		t.Fatalf("stocks not sorted: %+v", received.Stocks)
	}
}

func TestMarketSessionAt(t *testing.T) {
	cfg := &config.Config{Runtime: config.RuntimeConfig{
		Timezone: "Asia/Kolkata", TradingStart: "09:15", TradingEnd: "15:30",
	}}
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	if !marketSessionAt(time.Date(2026, 8, 10, 10, 0, 0, 0, loc), cfg) {
		t.Fatal("weekday market time should be active")
	}
	if marketSessionAt(time.Date(2026, 8, 8, 10, 0, 0, 0, loc), cfg) {
		t.Fatal("Saturday should not be active")
	}
}
