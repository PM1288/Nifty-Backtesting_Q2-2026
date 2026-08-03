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

type Candle struct {
	Timestamp time.Time
	Open      float64
	High      float64
	Low       float64
	Close     float64
	Volume    int64
}

type candleRequest struct {
	Exchange    string `json:"exchange"`
	SymbolToken string `json:"symboltoken"`
	Interval    string `json:"interval"`
	FromDate    string `json:"fromdate"`
	ToDate      string `json:"todate"`
}

type candleResponse struct {
	Status  bool            `json:"status"`
	Message string          `json:"message"`
	Data    [][]interface{} `json:"data"`
}

func FetchCandles(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, exchange, token, interval string, from, to time.Time, timeout time.Duration, loc *time.Location) ([]Candle, error) {
	return withAuthRetry(ctx, provider, "candles", func(tokens AuthTokens) ([]Candle, error) {
		return fetchCandlesOnce(ctx, cfg, tokens, exchange, token, interval, from, to, timeout, loc)
	})
}

func fetchCandlesOnce(ctx context.Context, cfg config.SmartAPIConfig, tokens AuthTokens, exchange, token, interval string, from, to time.Time, timeout time.Duration, loc *time.Location) ([]Candle, error) {
	payload := candleRequest{
		Exchange:    exchange,
		SymbolToken: token,
		Interval:    interval,
		FromDate:    from.In(loc).Format("2006-01-02 15:04"),
		ToDate:      to.In(loc).Format("2006-01-02 15:04"),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode candle request: %w", err)
	}

	url := cfg.RestBaseURL + "/rest/secure/angelbroking/historical/v1/getCandleData"
	req, err := newRequest(ctx, cfg, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build candle request: %w", err)
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
		return nil, fmt.Errorf("candle request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read candle response: %w", err)
	}
	envelope, err := parseAPIEnvelope("candles", resp.StatusCode, raw)
	if err != nil {
		return nil, err
	}

	var rows [][]interface{}
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		if err := json.Unmarshal(envelope.Data, &rows); err != nil {
			return nil, &APIError{
				Op:         "candles",
				StatusCode: resp.StatusCode,
				Message:    fmt.Sprintf("parse candle data: %v", err),
				Body:       strings.TrimSpace(string(raw)),
			}
		}
	}

	candles := make([]Candle, 0, len(rows))
	for _, row := range rows {
		if len(row) < 6 {
			continue
		}
		ts, err := parseCandleTime(row[0], loc)
		if err != nil {
			continue
		}
		open := coerceFloat(row[1])
		high := coerceFloat(row[2])
		low := coerceFloat(row[3])
		closeVal := coerceFloat(row[4])
		vol := coerceInt64(row[5])
		candles = append(candles, Candle{
			Timestamp: ts,
			Open:      open,
			High:      high,
			Low:       low,
			Close:     closeVal,
			Volume:    vol,
		})
	}
	return candles, nil
}

func parseCandleTime(value interface{}, loc *time.Location) (time.Time, error) {
	switch v := value.(type) {
	case string:
		if t, err := time.ParseInLocation("2006-01-02 15:04", v, loc); err == nil {
			return t, nil
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t.In(loc), nil
		}
		return time.Time{}, fmt.Errorf("unsupported time format: %s", v)
	case float64:
		sec := int64(v)
		return time.Unix(sec, 0).In(loc), nil
	default:
		return time.Time{}, fmt.Errorf("unsupported time type")
	}
}

func coerceFloat(value interface{}) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int64:
		return float64(v)
	case json.Number:
		f, _ := v.Float64()
		return f
	case string:
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return 0
}

func coerceInt64(value interface{}) int64 {
	switch v := value.(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case json.Number:
		i, _ := v.Int64()
		return i
	case string:
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return 0
}
