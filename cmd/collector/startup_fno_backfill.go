package main

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
	"trading-stack/internal/util"
)

// backfillAddedFNOCurrentSession repairs price/volume candles for current F&O
// names which were absent from the static cash universe. It is deliberately
// bounded to those newly reconciled names and the current session. Re-fetching
// is safe because bars_1m upserts are idempotent. SmartAPI historical candles
// do not supply historical OI, so this function never manufactures it.
func backfillAddedFNOCurrentSession(ctx context.Context, cfg *config.Config, provider smartapi.TokenProvider, st *store.Store, queue *restQueue, activeSubs, additions []store.Subscription, stateCache *instrumentStateCache, loc *time.Location, logger *slog.Logger, now time.Time) {
	targets := subscriptionsForAddedFNO(activeSubs, additions)
	if len(targets) == 0 || queue == nil {
		return
	}
	start, closeTime, err := tradingWindow(now, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc)
	if err != nil || now.Before(start) {
		return
	}
	end := now
	if end.After(closeTime) {
		end = closeTime
	}
	end = time.Date(end.Year(), end.Month(), end.Day(), end.Hour(), end.Minute(), 0, 0, loc).Add(-time.Minute)
	if end.Before(start) {
		return
	}

	succeeded := 0
	failed := 0
	barsWritten := 0
	for _, sub := range targets {
		sub := sub
		done := queue.Submit(restJob{
			endpoint: endpointCandles,
			name:     "startup_added_fno_backfill",
			priority: priorityHigh,
			run: func(jobCtx context.Context) error {
				callStarted := time.Now()
				candles, fetchErr := smartapi.FetchCandles(jobCtx, cfg.SmartAPI, provider, sub.Exchange, sub.SymbolToken, "ONE_MINUTE", start, end, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second, loc)
				recordAPIRequest(jobCtx, cfg, st, logger, store.APIRequestLog{
					Ts:               callStarted.UTC(),
					Endpoint:         string(endpointCandles),
					Name:             "startup_added_fno_backfill",
					Success:          fetchErr == nil,
					Throttled:        isThrottleErr(fetchErr),
					LatencyMs:        time.Since(callStarted).Milliseconds(),
					SymbolsRequested: 1,
					SymbolsReturned:  len(candles),
					ErrorMessage:     errorMessage(fetchErr),
				})
				if fetchErr != nil {
					return fetchErr
				}
				bars := make([]store.Bar, 0, len(candles))
				for _, candle := range candles {
					bar := store.Bar{
						Ts:          util.MinuteStartUTC(candle.Timestamp, loc),
						Exchange:    sub.Exchange,
						SymbolToken: sub.SymbolToken,
						Open:        candle.Open,
						High:        candle.High,
						Low:         candle.Low,
						Close:       candle.Close,
						Volume:      candle.Volume,
						Source:      "startup_added_fno_backfill",
					}
					bars = append(bars, bar)
					if stateCache != nil {
						price, open, high, low, closeValue, volume := candle.Close, candle.Open, candle.High, candle.Low, candle.Close, candle.Volume
						stateCache.Update(store.InstrumentState{Exchange: sub.Exchange, SymbolToken: sub.SymbolToken, LastSeen: bar.Ts, LastPrice: &price, LastSource: bar.Source, LastOpen: &open, LastHigh: &high, LastLow: &low, LastClose: &closeValue, LastVolume: &volume})
					}
				}
				if len(bars) == 0 {
					return nil
				}
				if err := st.UpsertBars(jobCtx, bars); err != nil {
					return err
				}
				if err := st.UpsertWatermarks(jobCtx, bars); err != nil {
					return err
				}
				barsWritten += len(bars)
				return nil
			},
		})
		if err := <-done; err != nil {
			failed++
			if logger != nil {
				logger.Warn("startup_added_fno_backfill_failed", "symbol", sub.TradingSymbol, "err", err)
			}
			continue
		}
		succeeded++
	}
	if logger != nil {
		logger.Info("startup_added_fno_backfill_complete", "underlyings", len(additions), "subscriptions", len(targets), "succeeded", succeeded, "failed", failed, "bars", barsWritten, "start", start.Format(time.RFC3339), "end", end.Format(time.RFC3339))
	}
}

func subscriptionsForAddedFNO(activeSubs, additions []store.Subscription) []store.Subscription {
	underlyings := map[string]struct{}{}
	for _, sub := range additions {
		key := stockUnderlyingKey(sub)
		if key != "" {
			underlyings[key] = struct{}{}
		}
	}
	if len(underlyings) == 0 {
		return nil
	}
	out := make([]store.Subscription, 0)
	for _, sub := range activeSubs {
		if !sub.Active {
			continue
		}
		kind := strings.ToUpper(strings.TrimSpace(sub.Kind))
		if kind != "EQUITY" && kind != "FUT" && kind != "OPTSTK" {
			continue
		}
		if _, ok := underlyings[stockUnderlyingKey(sub)]; ok {
			out = append(out, sub)
		}
	}
	return out
}
