package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

type stockWebhookClient struct {
	url        string
	client     *http.Client
	maxRetries int
	backoff    time.Duration
	logger     *slog.Logger
}

type stockWebhookPayload struct {
	Text          string              `json:"text"`
	EventType     string              `json:"event_type"`
	SchemaVersion string              `json:"schema_version"`
	RunID         string              `json:"run_id"`
	CollectedAt   time.Time           `json:"collected_at"`
	Source        string              `json:"source"`
	MarketSession bool                `json:"market_session"`
	StockCount    int                 `json:"stock_count"`
	Stocks        []stockWebhookQuote `json:"stocks"`
}

type stockWebhookQuote struct {
	Symbol          string     `json:"symbol"`
	TradingSymbol   string     `json:"trading_symbol"`
	Exchange        string     `json:"exchange"`
	SymbolToken     string     `json:"symbol_token"`
	CollectedAt     time.Time  `json:"collected_at"`
	ExchangeFeedAt  *time.Time `json:"exchange_feed_at,omitempty"`
	ExchangeTradeAt *time.Time `json:"exchange_trade_at,omitempty"`
	LTP             *float64   `json:"ltp,omitempty"`
	Open            *float64   `json:"open,omitempty"`
	High            *float64   `json:"high,omitempty"`
	Low             *float64   `json:"low,omitempty"`
	Close           *float64   `json:"close,omitempty"`
	NetChange       *float64   `json:"net_change,omitempty"`
	PercentChange   *float64   `json:"percent_change,omitempty"`
	AveragePrice    *float64   `json:"average_price,omitempty"`
	Volume          *int64     `json:"volume,omitempty"`
	LastTradeQty    *int64     `json:"last_trade_quantity,omitempty"`
	TotalBuyQty     *int64     `json:"total_buy_quantity,omitempty"`
	TotalSellQty    *int64     `json:"total_sell_quantity,omitempty"`
	Bid             *float64   `json:"bid,omitempty"`
	Ask             *float64   `json:"ask,omitempty"`
	BidQty          *int64     `json:"bid_quantity,omitempty"`
	AskQty          *int64     `json:"ask_quantity,omitempty"`
	UpperCircuit    *float64   `json:"upper_circuit,omitempty"`
	LowerCircuit    *float64   `json:"lower_circuit,omitempty"`
	Week52High      *float64   `json:"week_52_high,omitempty"`
	Week52Low       *float64   `json:"week_52_low,omitempty"`
}

func newStockWebhookClient(cfg config.StockWebhookConfig, logger *slog.Logger) *stockWebhookClient {
	if !cfg.Enabled || strings.TrimSpace(cfg.URL) == "" {
		return nil
	}
	return &stockWebhookClient{
		url:        strings.TrimSpace(cfg.URL),
		client:     &http.Client{Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second},
		maxRetries: cfg.MaxRetries,
		backoff:    time.Duration(cfg.RetryBackoffMilliseconds) * time.Millisecond,
		logger:     logger,
	}
}

func stockWebhookQuoteFromSmartAPI(ts time.Time, sub store.Subscription, quote smartapi.Quote) (stockWebhookQuote, bool) {
	if !strings.EqualFold(strings.TrimSpace(sub.Kind), "EQUITY") {
		return stockWebhookQuote{}, false
	}
	symbol := strings.ToUpper(strings.TrimSpace(sub.Underlying))
	if symbol == "" {
		symbol = strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(sub.TradingSymbol)), "-EQ")
	}
	return stockWebhookQuote{
		Symbol: symbol, TradingSymbol: sub.TradingSymbol, Exchange: quote.Exchange,
		SymbolToken: quote.SymbolToken, CollectedAt: ts, ExchangeFeedAt: quote.ExchFeedTime,
		ExchangeTradeAt: quote.ExchTradeTime, LTP: quote.LTP, Open: quote.Open,
		High: quote.High, Low: quote.Low, Close: quote.Close, NetChange: quote.NetChange,
		PercentChange: quote.PercentChange, AveragePrice: quote.AvgPrice, Volume: quote.Volume,
		LastTradeQty: quote.LastTradeQty, TotalBuyQty: quote.TotalBuyQty,
		TotalSellQty: quote.TotalSellQty, Bid: quote.Bid, Ask: quote.Ask,
		BidQty: quote.BidQty, AskQty: quote.AskQty, UpperCircuit: quote.UpperCircuit,
		LowerCircuit: quote.LowerCircuit, Week52High: quote.Week52High, Week52Low: quote.Week52Low,
	}, true
}

func (c *stockWebhookClient) Send(ctx context.Context, payload stockWebhookPayload) error {
	if c == nil || len(payload.Stocks) == 0 {
		return nil
	}
	sort.Slice(payload.Stocks, func(i, j int) bool { return payload.Stocks[i].Symbol < payload.Stocks[j].Symbol })
	payload.StockCount = len(payload.Stocks)
	payload.Text = buildStockWebhookText(payload)
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode stock webhook payload: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 && c.backoff > 0 {
			timer := time.NewTimer(c.backoff * time.Duration(attempt))
			select {
			case <-ctx.Done():
				timer.Stop()
				return ctx.Err()
			case <-timer.C:
			}
		}
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
		if reqErr != nil {
			return fmt.Errorf("create stock webhook request: %w", reqErr)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "smartapi-collector/stock-webhook-v1")
		resp, sendErr := c.client.Do(req)
		if sendErr != nil {
			lastErr = sendErr
			continue
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
		if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
			if c.logger != nil {
				c.logger.Info("stock_webhook_sent", "run_id", payload.RunID, "stocks", payload.StockCount, "status", resp.StatusCode, "attempt", attempt+1)
			}
			return nil
		}
		lastErr = fmt.Errorf("unexpected HTTP status %d", resp.StatusCode)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
			break
		}
	}
	return fmt.Errorf("stock webhook delivery failed after %d attempt(s): %w", c.maxRetries+1, lastErr)
}

func buildStockWebhookText(payload stockWebhookPayload) string {
	session := "CLOSED/OFF-HOURS"
	if payload.MarketSession {
		session = "OPEN"
	}
	var out strings.Builder
	fmt.Fprintf(&out, "### Stock quote snapshot — %s\n", payload.CollectedAt.UTC().Format(time.RFC3339))
	fmt.Fprintf(&out, "Run `%s` | Session **%s** | Stocks **%d**\n\n", payload.RunID, session, len(payload.Stocks))
	out.WriteString("| Symbol | LTP | Change % | Volume |\n|---|---:|---:|---:|\n")
	for _, stock := range payload.Stocks {
		fmt.Fprintf(&out, "| %s | %s | %s | %s |\n", stock.Symbol, formatWebhookFloat(stock.LTP, 2), formatWebhookFloat(stock.PercentChange, 2), formatWebhookInt(stock.Volume))
	}
	return out.String()
}

func formatWebhookFloat(value *float64, decimals int) string {
	if value == nil {
		return "-"
	}
	return fmt.Sprintf("%.*f", decimals, *value)
}

func formatWebhookInt(value *int64) string {
	if value == nil {
		return "-"
	}
	return fmt.Sprintf("%d", *value)
}

func marketSessionAt(ts time.Time, cfg *config.Config) bool {
	loc, err := time.LoadLocation(cfg.Runtime.Timezone)
	if err != nil {
		return false
	}
	local := ts.In(loc)
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return false
	}
	start, errStart := time.Parse("15:04", cfg.Runtime.TradingStart)
	end, errEnd := time.Parse("15:04", cfg.Runtime.TradingEnd)
	if errStart != nil || errEnd != nil {
		return false
	}
	minute := local.Hour()*60 + local.Minute()
	return minute >= start.Hour()*60+start.Minute() && minute <= end.Hour()*60+end.Minute()
}
