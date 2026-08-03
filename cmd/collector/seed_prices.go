package main

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
)

func seedPriceCache(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, subs []store.Subscription, prices *priceCache, queue *restQueue, logger *slog.Logger) {
	if prices == nil || len(subs) == 0 {
		return
	}
	tokenKeys := map[string]string{}
	for _, sub := range subs {
		key := sub.Underlying
		if key == "" {
			key = strings.TrimSuffix(sub.TradingSymbol, "-EQ")
		}
		if key != "" {
			tokenKeys[sub.Exchange+":"+sub.SymbolToken] = key
		}
	}
	batches := buildQuoteBatches(subs, false, true, cfg.Limits.QuoteMaxSymbolsPerRequest, nil, 0, nil, nil, nil, nil)
	for _, batch := range batches {
		batch := batch
		if queue == nil {
			quotes, err := smartapi.FetchQuotes(ctx, cfg.SmartAPI, provider, "LTP", batch, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
			if err != nil {
				if logger != nil {
					logger.Warn("seed_price_cache_failed", "err", err)
				}
				continue
			}
			for _, quote := range quotes {
				key := tokenKeys[quote.Exchange+":"+quote.SymbolToken]
				if key == "" {
					key = quote.TradingSymbol
				}
				if quote.LTP != nil {
					prices.Set(key, *quote.LTP)
				}
			}
			continue
		}
		done := queue.Submit(restJob{
			endpoint: endpointQuote,
			name:     "seed_price_cache",
			run: func(jobCtx context.Context) error {
				quotes, err := smartapi.FetchQuotes(jobCtx, cfg.SmartAPI, provider, "LTP", batch, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
				if err != nil {
					return err
				}
				for _, quote := range quotes {
					key := tokenKeys[quote.Exchange+":"+quote.SymbolToken]
					if key == "" {
						key = quote.TradingSymbol
					}
					if quote.LTP != nil {
						prices.Set(key, *quote.LTP)
					}
				}
				return nil
			},
		})
		if err := <-done; err != nil && logger != nil {
			logger.Warn("seed_price_cache_failed", "err", err)
		}
	}
}
