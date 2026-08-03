package smartapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"trading-stack/internal/config"
)

var blockedOrderPaths = []string{
	"/rest/secure/angelbroking/order/",
	"/rest/secure/angelbroking/gtt/",
}

func newRequest(ctx context.Context, cfg config.SmartAPIConfig, method, rawURL string, body io.Reader) (*http.Request, error) {
	if err := guardNoLiveOrders(cfg, rawURL); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, err
	}
	return req, nil
}

func guardNoLiveOrders(cfg config.SmartAPIConfig, rawURL string) error {
	if !cfg.DisableLiveOrders {
		return nil
	}
	if rawURL == "" {
		return nil
	}
	path := rawURL
	if parsed, err := url.Parse(rawURL); err == nil && parsed.Path != "" {
		path = parsed.Path
	}
	lower := strings.ToLower(path)
	for _, blocked := range blockedOrderPaths {
		if strings.Contains(lower, blocked) {
			return fmt.Errorf("live trading disabled: blocked endpoint %s", path)
		}
	}
	return nil
}
