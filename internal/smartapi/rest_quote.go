package smartapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/config"
)

type Quote struct {
	Exchange      string
	SymbolToken   string
	TradingSymbol string
	LTP           *float64
	Open          *float64
	High          *float64
	Low           *float64
	Close         *float64
	LastTradeQty  *int64
	ExchFeedTime  *time.Time
	ExchTradeTime *time.Time
	NetChange     *float64
	PercentChange *float64
	AvgPrice      *float64
	Volume        *int64
	OI            *int64
	TotalBuyQty   *int64
	TotalSellQty  *int64
	UpperCircuit  *float64
	LowerCircuit  *float64
	Week52High    *float64
	Week52Low     *float64
	Bid           *float64
	Ask           *float64
	BidQty        *int64
	AskQty        *int64
	DepthBuy      []DepthLevel
	DepthSell     []DepthLevel
	Raw           []byte
}

type DepthLevel struct {
	Price    float64
	Quantity int64
	Orders   int64
}

type quoteRequest struct {
	Mode           string              `json:"mode"`
	ExchangeTokens map[string][]string `json:"exchangeTokens"`
}

type quoteResponse struct {
	Status  bool                        `json:"status"`
	Message string                      `json:"message"`
	Data    map[string][]map[string]any `json:"data"`
}

func FetchQuotes(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, mode string, exchangeTokens map[string][]string, timeout time.Duration) ([]Quote, error) {
	return withAuthRetry(ctx, provider, "quote", func(tokens AuthTokens) ([]Quote, error) {
		return fetchQuotesOnce(ctx, cfg, tokens, mode, exchangeTokens, timeout)
	})
}

func fetchQuotesOnce(ctx context.Context, cfg config.SmartAPIConfig, tokens AuthTokens, mode string, exchangeTokens map[string][]string, timeout time.Duration) ([]Quote, error) {
	payload := quoteRequest{
		Mode:           mode,
		ExchangeTokens: exchangeTokens,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode quote request: %w", err)
	}

	url := cfg.RestBaseURL + "/rest/secure/angelbroking/market/v1/quote"
	req, err := newRequest(ctx, cfg, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build quote request: %w", err)
	}
	headers := buildHeaders(cfg.APIKey)
	headers["Authorization"] = "Bearer " + tokens.AccessToken
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("quote request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read quote response: %w", err)
	}
	envelope, err := parseAPIEnvelope("quote", resp.StatusCode, raw)
	if err != nil {
		return nil, err
	}

	var data map[string][]map[string]any
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		if err := json.Unmarshal(envelope.Data, &data); err != nil {
			return nil, &APIError{
				Op:         "quote",
				StatusCode: resp.StatusCode,
				Message:    fmt.Sprintf("parse quote data: %v", err),
				Body:       strings.TrimSpace(string(raw)),
			}
		}
	}

	var quotes []Quote
	for _, rows := range data {
		for _, row := range rows {
			q := Quote{
				Exchange:      coerceString(row, "exchange", "exch_seg"),
				SymbolToken:   coerceString(row, "symboltoken", "symbolToken", "token"),
				TradingSymbol: coerceString(row, "tradingsymbol", "tradingSymbol", "symbol"),
			}
			q.LTP = coerceFloatPtr(row, "ltp", "last_traded_price", "lastTradedPrice")
			q.Open = coerceFloatPtr(row, "open", "open_price_of_the_day", "openPrice")
			q.High = coerceFloatPtr(row, "high", "high_price_of_the_day", "highPrice")
			q.Low = coerceFloatPtr(row, "low", "low_price_of_the_day", "lowPrice")
			q.Close = coerceFloatPtr(row, "close", "closed_price", "closePrice")
			q.LastTradeQty = coerceInt64Ptr(row, "lastTradeQty", "last_trade_qty", "last_traded_qty")
			q.ExchFeedTime = coerceTimePtr(row, "exchFeedTime", "exch_feed_time")
			q.ExchTradeTime = coerceTimePtr(row, "exchTradeTime", "exch_trade_time")
			q.NetChange = coerceFloatPtr(row, "netChange", "net_change")
			q.PercentChange = coerceFloatPtr(row, "percentChange", "percent_change")
			q.AvgPrice = coerceFloatPtr(row, "avgPrice", "avg_price", "averagePrice")
			q.Volume = coerceInt64Ptr(row, "volume", "volume_trade_for_the_day", "volumeTradeForTheDay", "tradeVolume", "trade_volume")
			q.OI = coerceInt64Ptr(row, "open_interest", "openInterest", "opnInterest", "oi")
			q.TotalBuyQty = coerceInt64Ptr(row, "totBuyQuan", "total_buy_quantity", "total_buy_qty")
			q.TotalSellQty = coerceInt64Ptr(row, "totSellQuan", "total_sell_quantity", "total_sell_qty")
			q.UpperCircuit = coerceFloatPtr(row, "upperCircuit", "upper_circuit_limit")
			q.LowerCircuit = coerceFloatPtr(row, "lowerCircuit", "lower_circuit_limit")
			q.Week52High = coerceFloatPtr(row, "52WeekHigh", "52_week_high", "fiftyTwoWeekHigh")
			q.Week52Low = coerceFloatPtr(row, "52WeekLow", "52_week_low", "fiftyTwoWeekLow")
			q.Bid = coerceFloatPtr(row, "best_bid_price", "bestBidPrice", "bid")
			q.Ask = coerceFloatPtr(row, "best_ask_price", "bestAskPrice", "ask")
			q.BidQty = coerceInt64Ptr(row, "best_bid_qty", "bestBidQty", "bid_qty")
			q.AskQty = coerceInt64Ptr(row, "best_ask_qty", "bestAskQty", "ask_qty")
			q.DepthBuy, q.DepthSell = coerceDepth(row)
			if q.Bid == nil && len(q.DepthBuy) > 0 {
				price := q.DepthBuy[0].Price
				qty := q.DepthBuy[0].Quantity
				q.Bid = &price
				q.BidQty = &qty
			}
			if q.Ask == nil && len(q.DepthSell) > 0 {
				price := q.DepthSell[0].Price
				qty := q.DepthSell[0].Quantity
				q.Ask = &price
				q.AskQty = &qty
			}
			if encoded, err := json.Marshal(row); err == nil {
				q.Raw = encoded
			}
			quotes = append(quotes, q)
		}
	}
	return quotes, nil
}

func coerceString(row map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := row[key]; ok {
			if s, ok := v.(string); ok {
				return strings.TrimSpace(s)
			}
			return fmt.Sprintf("%v", v)
		}
	}
	return ""
}

func coerceFloatPtr(row map[string]any, keys ...string) *float64 {
	for _, key := range keys {
		if v, ok := row[key]; ok {
			if f, ok := toFloat(v); ok {
				return &f
			}
		}
	}
	return nil
}

func coerceInt64Ptr(row map[string]any, keys ...string) *int64 {
	for _, key := range keys {
		if v, ok := row[key]; ok {
			if i, ok := toInt64(v); ok {
				return &i
			}
		}
	}
	return nil
}

func coerceTimePtr(row map[string]any, keys ...string) *time.Time {
	for _, key := range keys {
		if v, ok := row[key]; ok {
			if ts := parseExchangeTime(v); ts != nil {
				return ts
			}
		}
	}
	return nil
}

func parseExchangeTime(value any) *time.Time {
	switch v := value.(type) {
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil
		}
		loc, err := time.LoadLocation("Asia/Kolkata")
		if err != nil {
			loc = time.UTC
		}
		if parsed, err := time.ParseInLocation("02-Jan-2006 15:04:05", trimmed, loc); err == nil {
			out := parsed
			return &out
		}
		if parsed, err := time.Parse(time.RFC3339, trimmed); err == nil {
			out := parsed
			return &out
		}
	case float64:
		if v <= 0 {
			return nil
		}
		parsed := time.Unix(int64(v), 0).UTC()
		return &parsed
	case int64:
		if v <= 0 {
			return nil
		}
		parsed := time.Unix(v, 0).UTC()
		return &parsed
	case json.Number:
		if n, err := v.Int64(); err == nil && n > 0 {
			parsed := time.Unix(n, 0).UTC()
			return &parsed
		}
	}
	return nil
}

func coerceDepth(row map[string]any) ([]DepthLevel, []DepthLevel) {
	raw, ok := row["depth"]
	if !ok {
		return nil, nil
	}
	depthMap, ok := raw.(map[string]any)
	if !ok {
		return nil, nil
	}
	buy := parseDepthSide(depthMap["buy"])
	sell := parseDepthSide(depthMap["sell"])
	return buy, sell
}

func parseDepthSide(value any) []DepthLevel {
	raw, ok := value.([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	levels := make([]DepthLevel, 0, len(raw))
	for _, entry := range raw {
		row, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		price, ok := toFloat(row["price"])
		if !ok {
			continue
		}
		qty, _ := toInt64(row["quantity"])
		orders, _ := toInt64(row["orders"])
		levels = append(levels, DepthLevel{
			Price:    price,
			Quantity: qty,
			Orders:   orders,
		})
	}
	return levels
}

func toFloat(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int64:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func toInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case float64:
		return int64(v), true
	case int64:
		return v, true
	case json.Number:
		i, err := v.Int64()
		return i, err == nil
	case string:
		i, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return i, err == nil
	default:
		return 0, false
	}
}
