package smartapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"trading-stack/internal/config"
)

type aggregateResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
}

func FetchGainersLosers(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, payload map[string]any, timeout time.Duration) ([]byte, error) {
	return withAuthRetry(ctx, provider, "gainers_losers", func(tokens AuthTokens) ([]byte, error) {
		return fetchAggregatePOST(ctx, cfg, tokens, "/rest/secure/angelbroking/marketData/v1/gainersLosers", payload, timeout)
	})
}

func FetchOIBuildup(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, payload map[string]any, timeout time.Duration) ([]byte, error) {
	return withAuthRetry(ctx, provider, "oi_buildup", func(tokens AuthTokens) ([]byte, error) {
		return fetchAggregatePOST(ctx, cfg, tokens, "/rest/secure/angelbroking/marketData/v1/OIBuildup", payload, timeout)
	})
}

func FetchPutCallRatio(ctx context.Context, cfg config.SmartAPIConfig, provider TokenProvider, timeout time.Duration) ([]byte, error) {
	return withAuthRetry(ctx, provider, "put_call_ratio", func(tokens AuthTokens) ([]byte, error) {
		return fetchPutCallRatioOnce(ctx, cfg, tokens, timeout)
	})
}

func fetchPutCallRatioOnce(ctx context.Context, cfg config.SmartAPIConfig, tokens AuthTokens, timeout time.Duration) ([]byte, error) {
	url := cfg.RestBaseURL + "/rest/secure/angelbroking/marketData/v1/putCallRatio"
	req, err := newRequest(ctx, cfg, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build putCallRatio request: %w", err)
	}
	headers := buildHeaders(cfg.APIKey)
	headers["Authorization"] = "Bearer " + tokens.AccessToken
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("putCallRatio request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read putCallRatio response: %w", err)
	}
	if _, err := parseAPIEnvelope("putCallRatio", resp.StatusCode, raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func fetchAggregatePOST(ctx context.Context, cfg config.SmartAPIConfig, tokens AuthTokens, path string, payload map[string]any, timeout time.Duration) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode aggregate payload: %w", err)
	}
	url := cfg.RestBaseURL + path
	req, err := newRequest(ctx, cfg, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build aggregate request: %w", err)
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
		return nil, fmt.Errorf("aggregate request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read aggregate response: %w", err)
	}
	if _, err := parseAPIEnvelope(path, resp.StatusCode, raw); err != nil {
		return nil, err
	}
	return raw, nil
}
