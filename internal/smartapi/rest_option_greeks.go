package smartapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"trading-stack/internal/config"
)

type OptionGreekRow struct {
	Underlying    string
	ExpiryCode    string
	TradingSymbol string
	Strike        *float64
	Right         string
	IV            *float64
	Delta         *float64
	Gamma         *float64
	Theta         *float64
	Vega          *float64
	LTP           *float64
	TradeVolume   *float64
	Raw           []byte
}

type optionGreeksRequest struct {
	Name       string `json:"name"`
	ExpiryDate string `json:"expirydate"`
}

type optionGreeksResponse struct {
	Status  bool             `json:"status"`
	Message string           `json:"message"`
	Data    []map[string]any `json:"data"`
}

func FetchOptionGreeks(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, underlying, expiryCode string, timeout time.Duration) ([]OptionGreekRow, error) {
	return withAuthRetry(ctx, provider, "option_greeks", func(tokens AuthTokens) ([]OptionGreekRow, error) {
		return fetchOptionGreeksOnce(ctx, cfg, tokens, underlying, expiryCode, timeout)
	})
}

func fetchOptionGreeksOnce(ctx context.Context, cfg config.SmartAPIConfig, tokens AuthTokens, underlying, expiryCode string, timeout time.Duration) ([]OptionGreekRow, error) {
	payload := optionGreeksRequest{Name: underlying, ExpiryDate: expiryCode}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode greeks request: %w", err)
	}

	url := cfg.RestBaseURL + "/rest/secure/angelbroking/marketData/v1/optionGreek"
	req, err := newRequest(ctx, cfg, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build greeks request: %w", err)
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
		return nil, fmt.Errorf("greeks request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read greeks response: %w", err)
	}
	envelope, err := parseAPIEnvelope("option_greeks", resp.StatusCode, raw)
	if err != nil {
		return nil, err
	}

	var rowsData []map[string]any
	if len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		if err := json.Unmarshal(envelope.Data, &rowsData); err != nil {
			return nil, &APIError{
				Op:         "option_greeks",
				StatusCode: resp.StatusCode,
				Message:    fmt.Sprintf("parse greeks data: %v", err),
				Body:       strings.TrimSpace(string(raw)),
			}
		}
	}

	rows := make([]OptionGreekRow, 0, len(rowsData))
	for _, row := range rowsData {
		entry := OptionGreekRow{
			Underlying:    underlying,
			ExpiryCode:    expiryCode,
			TradingSymbol: coerceString(row, "tradingsymbol", "tradingSymbol", "symbol"),
			Strike:        coerceFloatPtr(row, "strikeprice", "strikePrice", "strike"),
			Right:         coerceString(row, "optiontype", "optionType", "right"),
			IV:            coerceFloatPtr(row, "impliedvolatility", "impliedVolatility", "iv"),
			Delta:         coerceFloatPtr(row, "delta"),
			Gamma:         coerceFloatPtr(row, "gamma"),
			Theta:         coerceFloatPtr(row, "theta"),
			Vega:          coerceFloatPtr(row, "vega"),
			LTP:           coerceFloatPtr(row, "ltp", "last_traded_price", "lastTradedPrice"),
			TradeVolume:   coerceFloatPtr(row, "tradeVolume", "trade_volume"),
		}
		if encoded, err := json.Marshal(row); err == nil {
			entry.Raw = encoded
		}
		rows = append(rows, entry)
	}
	return rows, nil
}
