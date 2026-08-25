package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"trading-stack/internal/aggregate"
	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
	"trading-stack/internal/logging"
	"trading-stack/internal/ratelimit"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

const instrumentMasterURL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"

func main() {
	configPath := flag.String("config", "/app/config.yaml", "Path to config file")
	dbMigrateOnly := flag.Bool("db-migrate-only", false, "Run migrations and exit")
	dbValidateOnly := flag.Bool("db-validate-only", false, "Validate schema and exit")
	dbCleanupOnly := flag.Bool("db-cleanup-only", false, "Run retention cleanup and exit")
	dbReset := flag.Bool("db-reset", false, "Drop schema and re-run migrations")
	dbResetConfirm := flag.Bool("i-understand-this-will-delete-data", false, "Required with --db-reset")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "config load failed: %v\n", err)
		os.Exit(1)
	}

	baseLogger := logging.New(cfg.Runtime)
	logger := logging.WithModule(baseLogger, "main")
	setCollectorAlerts(alerts.NewClient(cfg.Alerts), newAlertLimiter(), cfg.Alerts.EnableErrorAlerts)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	loc, _ := time.LoadLocation(cfg.Runtime.Timezone)
	httpClient := &http.Client{Timeout: time.Duration(cfg.Runtime.HTTPTimeoutSeconds) * time.Second}

	st, err := store.New(ctx, cfg.Postgres, baseLogger)
	if err != nil {
		logger.Error("postgres init failed", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	if *dbReset {
		if !*dbResetConfirm {
			logger.Error("db reset requires --i-understand-this-will-delete-data")
			os.Exit(1)
		}
		if err := st.ResetSchema(ctx); err != nil {
			logger.Error("db reset failed", "err", err)
			os.Exit(1)
		}
		logger.Info("db reset complete")
		return
	}
	if *dbMigrateOnly {
		if err := st.Migrate(ctx); err != nil {
			logger.Error("migration failed", "err", err)
			os.Exit(1)
		}
		logger.Info("migration complete")
		return
	}
	if *dbValidateOnly {
		if err := st.ValidateSchema(ctx); err != nil {
			logger.Error("schema validation failed", "err", err)
			os.Exit(1)
		}
		logger.Info("schema validation ok")
		return
	}
	if *dbCleanupOnly {
		if _, err := st.CleanupRetention(ctx, cfg.Retention, loc); err != nil {
			logger.Error("cleanup failed", "err", err)
			os.Exit(1)
		}
		logger.Info("cleanup complete", "dry_run", cfg.Retention.DryRun)
		return
	}

	if err := st.Migrate(ctx); err != nil {
		// In environments with locally edited migration files, checksum drift can block startup.
		// For collector runtime, continue if schema exists and only checksum metadata differs.
		if strings.Contains(err.Error(), "migration checksum mismatch") {
			logger.Warn("migration checksum mismatch; continuing in runtime mode", "err", err)
		} else {
			logger.Error("migration failed", "err", err)
			os.Exit(1)
		}
	}
	if cfg.Metrics.Enable {
		if err := st.UpsertSourceSLAs(ctx, buildSourceSLAs(cfg)); err != nil {
			logger.Error("metrics sla upsert failed", "err", err)
			os.Exit(1)
		}
		calendar, err := buildTradingCalendar(time.Now().In(loc), cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc, 7, 7)
		if err != nil {
			logger.Error("trading calendar build failed", "err", err)
			os.Exit(1)
		}
		if err := st.UpsertTradingCalendar(ctx, calendar); err != nil {
			logger.Error("trading calendar upsert failed", "err", err)
			os.Exit(1)
		}
	}

	insts, err := instruments.LoadOrDownload(ctx, cfg.Files.InstrumentCachePath, instrumentMasterURL, httpClient)
	if err != nil {
		logger.Error("instrument master load failed", "err", err)
		os.Exit(1)
	}

	if err := st.UpsertInstruments(ctx, insts); err != nil {
		logger.Error("instrument upsert failed", "err", err)
		os.Exit(1)
	}
	if cfg.Archive.Enable && cfg.Archive.EnableInstrumentSnapshots {
		capturedAt := time.Now().UTC()
		if err := st.UpsertInstrumentMasterSnapshot(ctx, capturedAt.In(loc), capturedAt, store.InstrumentMasterHash(insts), insts); err != nil {
			logger.Error("instrument_master_snapshot_failed", "err", err)
			os.Exit(1)
		}
	}
	casEligibility := buildCASEligibilityIndex(insts)

	symbols, err := universe.ParseSymbolsCSV(cfg.Files.SymbolsCSVPath)
	if err != nil {
		logger.Error("symbols csv parse failed", "err", err)
		os.Exit(1)
	}
	constituents, err := universe.ParseConstituentsCSV(cfg.Files.ConstituentsCSVPath)
	if err != nil && logger != nil {
		logger.Warn("constituents csv parse failed", "err", err)
	}
	if len(constituents) == 0 {
		constituents = buildConstituentsFromSymbols(symbols)
	}

	resolver := universe.Resolver{
		Instruments:    insts,
		EquityExchange: cfg.Universe.EquitiesExchange,
		IndexTokens:    cfg.Universe.IndexTokens,
		IndexExchanges: cfg.Universe.IndexExchanges,
		Logger:         logger,
	}

	equitySubs, err := resolver.ResolveEquities(symbols, cfg.WS.ModeEquities)
	if err != nil {
		logger.Error("equity resolution failed", "err", err)
		os.Exit(1)
	}
	indexSubs, err := resolver.ResolveIndices(cfg.Universe.IncludeIndices, cfg.WS.ModeIndices)
	if err != nil {
		logger.Error("index resolution failed", "err", err)
		os.Exit(1)
	}
	baseSubs := append(equitySubs, indexSubs...)
	if err := syncIndexConstituents(ctx, cfg, st, constituents, equitySubs, logger); err != nil && logger != nil {
		logger.Warn("index_constituents_upsert_failed", "err", err)
	}

	tokenProvider, err := smartapi.NewTokenProvider(ctx, cfg.SmartAPI, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
	if err != nil {
		logger.Error("smartapi login failed", "err", err)
		os.Exit(1)
	}

	priceCache := newPriceCache()
	oiCache := newOICache()
	stateCache := newInstrumentStateCache()
	depthCache := newDepthSnapshotCache()
	limiters := map[restEndpoint]*ratelimit.AdaptiveLimiter{
		endpointQuote:      ratelimit.NewAdaptiveLimiter(cfg.Limits.AdaptiveMinRPS, cfg.Limits.QuoteRPS, cfg.Limits.QuoteRPS, time.Duration(cfg.Limits.AdaptiveStepUpAfterSeconds)*time.Second),
		endpointCandles:    ratelimit.NewAdaptiveLimiter(cfg.Limits.AdaptiveMinRPS, cfg.Limits.CandlesRPS, cfg.Limits.CandlesRPS, time.Duration(cfg.Limits.AdaptiveStepUpAfterSeconds)*time.Second),
		endpointGreeks:     ratelimit.NewAdaptiveLimiter(cfg.Limits.AdaptiveMinRPS, cfg.Limits.GreeksRPS, cfg.Limits.GreeksRPS, time.Duration(cfg.Limits.AdaptiveStepUpAfterSeconds)*time.Second),
		endpointAggregates: ratelimit.NewAdaptiveLimiter(cfg.Limits.AdaptiveMinRPS, cfg.Limits.AggregatesRPS, cfg.Limits.AggregatesRPS, time.Duration(cfg.Limits.AdaptiveStepUpAfterSeconds)*time.Second),
	}
	caps := map[restEndpoint][]*ratelimit.RollingLimiter{
		endpointQuote: {
			ratelimit.NewRollingLimiter(cfg.Limits.QuotePerMinuteCap, time.Minute),
			ratelimit.NewRollingLimiter(cfg.Limits.QuotePerHourCap, time.Hour),
		},
		endpointCandles: {
			ratelimit.NewRollingLimiter(cfg.Limits.CandlesPerMinuteCap, time.Minute),
			ratelimit.NewRollingLimiter(cfg.Limits.CandlesPerHourCap, time.Hour),
		},
		endpointAggregates: {
			ratelimit.NewRollingLimiter(cfg.Limits.AggregatesPerMinuteCap, time.Minute),
			ratelimit.NewRollingLimiter(cfg.Limits.AggregatesPerHourCap, time.Hour),
		},
	}
	queue := newRestQueue(256, limiters, caps, logger)
	if err := queue.Start(ctx, 3); err != nil {
		logger.Error("rest queue start failed", "err", err)
		os.Exit(1)
	}
	seedPriceCache(ctx, cfg, tokenProvider, baseSubs, priceCache, queue, logger)

	subIndex := newSubscriptionIndex()
	optionStates := newOptionStateIndex()
	tickTracker := newTickTracker()
	wsArchiveTracker := newWSHealthTracker()
	var subsCount atomic.Int64
	primaryKinds := normalizeKinds(cfg.RestTasks.QuoteSnapshotPrimaryKinds)
	depthKinds := normalizeKinds(cfg.WS.DepthSnapshotKinds)
	quoteRotation := newQuoteRotation()
	optionQuoteRotation := newQuoteRotation()

	activeSubs, err := refreshSubscriptions(ctx, st, insts, baseSubs, cfg, priceCache, logger, time.Now().In(loc))
	if err != nil {
		logger.Error("subscription refresh failed", "err", err)
		os.Exit(1)
	}
	subIndex.Update(activeSubs)
	subsCount.Store(int64(len(activeSubs)))
	wsArchiveTracker.SetSubscriptionCounts(smartapi.SubscriptionCounts(activeSubs, cfg.WS.MaxConnections, cfg.WS.MaxTokensPerConnection))
	optionStates.Update(buildOptionStates(activeSubs, priceCache, time.Now().In(loc)))

	wsManager := smartapi.NewWSManager(cfg.SmartAPI, cfg.WS, tokenProvider, logger)
	tickCh := make(chan smartapi.Tick, 4096)
	barCh := make(chan store.Bar, 4096)
	var tickArchiveCh chan store.MarketTick
	var tickArchiveSampler *tickArchiveSampler
	if cfg.Archive.Enable && cfg.Archive.EnableMarketTicks {
		tickArchiveCh = make(chan store.MarketTick, cfg.Archive.TickBufferSize)
		tickArchiveSampler = newTickArchiveSampler(cfg.Archive.TickSampleMilliseconds)
	}
	agg := aggregate.New(loc, time.Duration(cfg.Runtime.FlushSeconds)*time.Second)

	eg, egCtx := errgroup.WithContext(ctx)

	eg.Go(func() error {
		return wsManager.Run(egCtx, st.ListActiveSubscriptions, tickCh)
	})

	eg.Go(func() error {
		flushTicker := time.NewTicker(time.Duration(cfg.Runtime.FlushSeconds) * time.Second)
		defer flushTicker.Stop()

		for {
			select {
			case <-egCtx.Done():
				bars := agg.FlushDue(time.Now())
				for _, bar := range bars {
					barCh <- bar
				}
				return egCtx.Err()
			case tick := <-tickCh:
				tickTracker.Mark(tick.Exchange, tick.Token, tick.Timestamp)
				wsArchiveTracker.Mark(tick)
				if tick.OI != nil {
					oiCache.Set(tick.Exchange, tick.Token, *tick.OI, tick.Timestamp)
				}
				var netChange *float64
				var percentChange *float64
				if tick.Close != nil && *tick.Close != 0 {
					change := tick.LTP - *tick.Close
					pct := (change / *tick.Close) * 100
					netChange = &change
					percentChange = &pct
				}
				var sub store.Subscription
				var ok bool
				if sub, ok = subIndex.Get(tick.Exchange, tick.Token); ok {
					kind := strings.ToUpper(sub.Kind)
					phase := marketSessionPhase(tick.Timestamp, tick.Exchange, casEligibility[subKey(tick.Exchange, tick.Token)], loc)
					if tickArchiveCh != nil && tickArchiveSampler.Accept(tick) {
						row := marketTickFromSmart(tick, phase)
						select {
						case tickArchiveCh <- row:
						default:
							wsArchiveTracker.Drop()
						}
					}
					if sub.Underlying != "" && !strings.HasPrefix(kind, "OPT") {
						priceCache.Set(sub.Underlying, tick.LTP)
					}
					if cfg.WS.EnableDepthSnapshots && depthCache != nil && (len(tick.DepthBuy) > 0 || len(tick.DepthSell) > 0) {
						if len(depthKinds) == 0 {
							depthCache.Update(tick.Exchange, tick.Token, tick.Timestamp, phase, tick.DepthBuy, tick.DepthSell)
						} else if _, ok := depthKinds[kind]; ok {
							depthCache.Update(tick.Exchange, tick.Token, tick.Timestamp, phase, tick.DepthBuy, tick.DepthSell)
						}
					}
				}
				if stateCache != nil {
					price := tick.LTP
					var bid *float64
					var ask *float64
					var bidQty *int64
					var askQty *int64
					if len(tick.DepthBuy) > 0 {
						bidPrice := tick.DepthBuy[0].Price
						qty := tick.DepthBuy[0].Quantity
						bid = &bidPrice
						bidQty = &qty
					}
					if len(tick.DepthSell) > 0 {
						askPrice := tick.DepthSell[0].Price
						qty := tick.DepthSell[0].Quantity
						ask = &askPrice
						askQty = &qty
					}
					stateCache.Update(store.InstrumentState{
						Exchange:        tick.Exchange,
						SymbolToken:     tick.Token,
						LastSeen:        tick.Timestamp,
						LastPrice:       &price,
						LastSource:      "ws",
						LastBid:         bid,
						LastAsk:         ask,
						LastBidQty:      bidQty,
						LastAskQty:      askQty,
						LastTradeQty:    tick.LastQty,
						LastOpen:        tick.Open,
						LastHigh:        tick.High,
						LastLow:         tick.Low,
						LastClose:       tick.Close,
						LastVolume:      tick.CumVolume,
						LastOI:          tick.OI,
						LastOIChangePct: tick.OIChangePct,
						TotalBuyQty:     tick.TotalBuy,
						TotalSellQty:    tick.TotalSell,
						AvgPrice:        tick.AvgPrice,
						NetChange:       netChange,
						PercentChange:   percentChange,
						UpperCircuit:    tick.UpperCirc,
						LowerCircuit:    tick.LowerCirc,
						Week52High:      tick.WeekHigh,
						Week52Low:       tick.WeekLow,
					})
				}
				bars := agg.AddTick(aggregate.Tick{
					Exchange:  tick.Exchange,
					Token:     tick.Token,
					LTP:       tick.LTP,
					LastQty:   tick.LastQty,
					CumVolume: tick.CumVolume,
					OI:        tick.OI,
					Timestamp: tick.Timestamp,
				})
				for _, bar := range bars {
					barCh <- bar
				}
			case <-flushTicker.C:
				bars := agg.FlushDue(time.Now())
				for _, bar := range bars {
					barCh <- bar
				}
			}
		}
	})

	eg.Go(func() error {
		buffer := make([]store.Bar, 0, 256)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		flush := func() error {
			if len(buffer) == 0 {
				return nil
			}
			var lastErr error
			for attempt := 1; attempt <= 3; attempt++ {
				if err := st.UpsertBars(egCtx, buffer); err != nil {
					lastErr = err
				} else if err := st.UpsertWatermarks(egCtx, buffer); err != nil {
					lastErr = err
				} else {
					buffer = buffer[:0]
					return nil
				}
				if logger != nil {
					logger.Warn("bar_flush_retry", "attempt", attempt, "bars", len(buffer), "err", lastErr)
				}
				select {
				case <-egCtx.Done():
					return egCtx.Err()
				case <-time.After(time.Duration(attempt) * time.Second):
				}
			}
			return lastErr
		}

		for {
			select {
			case <-egCtx.Done():
				_ = flush()
				return egCtx.Err()
			case bar := <-barCh:
				buffer = append(buffer, bar)
				if len(buffer) >= 200 {
					if err := flush(); err != nil && logger != nil {
						logger.Warn("bar_flush_failed", "bars", len(buffer), "err", err)
					}
				}
			case <-ticker.C:
				if err := flush(); err != nil && logger != nil {
					logger.Warn("bar_flush_failed", "bars", len(buffer), "err", err)
				}
			}
		}
	})

	eg.Go(func() error {
		primaryIncludeOptions := cfg.RestTasks.QuoteSnapshotIncludeOptions
		if cfg.RestTasks.EnableOptionQuoteSnapshots && primaryIncludeOptions {
			primaryIncludeOptions = false
			logger.Warn("quote_snapshot_include_options_ignored", "reason", "option_quote_snapshots_enabled")
		}
		return runQuoteSnapshotsLoop(egCtx, cfg, tokenProvider, st, subIndex, priceCache, stateCache, queue, logger, cfg.RestTasks.EnableQuoteSnapshots, primaryIncludeOptions, true, cfg.RestTasks.QuoteSnapshotIntervalSeconds, "quote_snapshot", true, priorityHigh, quoteRotation, cfg.RestTasks.QuoteSnapshotRotationMaxTokens, primaryKinds)
	})
	if cfg.RestTasks.EnableOptionQuoteSnapshots {
		eg.Go(func() error {
			return runQuoteSnapshotsLoop(egCtx, cfg, tokenProvider, st, subIndex, priceCache, stateCache, queue, logger, true, true, false, cfg.RestTasks.OptionQuoteSnapshotIntervalSeconds, "option_quote_snapshot", true, priorityLow, optionQuoteRotation, cfg.RestTasks.OptionQuoteSnapshotRotationMaxTokens, nil)
		})
	}

	eg.Go(func() error {
		return runOISnapshots(egCtx, cfg, st, subIndex, oiCache, logger)
	})

	eg.Go(func() error {
		return runOptionGreeks(egCtx, cfg, tokenProvider, st, queue, logger, loc)
	})
	eg.Go(func() error {
		return runGainersLosers(egCtx, cfg, tokenProvider, st, queue, logger)
	})
	eg.Go(func() error {
		return runOIBuildup(egCtx, cfg, tokenProvider, st, queue, logger)
	})
	eg.Go(func() error {
		return runPutCallRatio(egCtx, cfg, tokenProvider, st, queue, logger)
	})

	eg.Go(func() error {
		return runDailyHistory(egCtx, cfg, tokenProvider, st, queue, loc, logger)
	})

	eg.Go(func() error {
		return runRestFallback1m(egCtx, cfg, tokenProvider, st, subIndex, queue, tickTracker, stateCache, loc, logger)
	})
	if cfg.WS.EnableDepthSnapshots {
		eg.Go(func() error {
			return runDepthSnapshotFlush(egCtx, cfg, st, depthCache, logger)
		})
	}
	if tickArchiveCh != nil {
		eg.Go(func() error {
			return runMarketTickArchive(egCtx, st, tickArchiveCh, cfg.Archive.TickBatchSize, logger)
		})
	}
	if cfg.Archive.Enable && cfg.Archive.EnableWebsocketHealth {
		eg.Go(func() error {
			return runWebsocketHealthArchive(egCtx, cfg, st, wsArchiveTracker, &subsCount, logger)
		})
	}
	if cfg.Archive.Enable && cfg.Archive.EnableOptionChainSnapshots {
		eg.Go(func() error {
			return runOptionChainArchive(egCtx, cfg, st, loc, logger)
		})
	}
	if cfg.Metrics.Enable {
		eg.Go(func() error {
			return runInstrumentStateFlush(egCtx, cfg, st, stateCache, logger)
		})
		eg.Go(func() error {
			return runMetricsRollup(egCtx, cfg, st, logger, loc)
		})
	}

	if cfg.Retention.EnableCleanup {
		eg.Go(func() error {
			return runRetention(egCtx, cfg, st, loc, logger)
		})
	}

	refreshTriggers := make(chan string, 1)
	eg.Go(func() error {
		return subscriptionRefreshLoop(egCtx, cfg, st, insts, baseSubs, priceCache, subIndex, optionStates, wsArchiveTracker, &subsCount, logger, refreshTriggers, loc)
	})
	eg.Go(func() error {
		return atmShiftMonitor(egCtx, cfg, optionStates, priceCache, refreshTriggers, logger)
	})

	if cfg.Health.EnableHTTP {
		eg.Go(func() error {
			return startHealthServer(egCtx, cfg.Health.ListenAddr, st, tickTracker, &subsCount, logger, cfg.Runtime.TradingStart, cfg.Runtime.TradingEnd, loc)
		})
	}

	if err := eg.Wait(); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("collector stopped", "err", err)
		os.Exit(1)
	}
}
