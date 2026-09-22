package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/logging"
	"trading-stack/internal/smartapi"
	"trading-stack/internal/store"
	"trading-stack/internal/util"
)

func main() {
	configPath := flag.String("config", "/app/config.yaml", "Path to config file")
	underlying := flag.String("underlying", "NIFTY50", "Exact subscription underlying")
	expiryText := flag.String("expiry", "", "Exact expiry date (YYYY-MM-DD)")
	sessionText := flag.String("session", "", "Trading session date (YYYY-MM-DD)")
	spot := flag.Float64("spot", 0, "Observed underlying value used to select the nearest strikes")
	strikesEachSide := flag.Int("strikes-each-side", 10, "Number of listed strikes on each side of the nearest strike")
	requestSpacing := flag.Duration("request-spacing", time.Second, "Minimum delay between SmartAPI candle calls")
	flag.Parse()

	if *expiryText == "" || *sessionText == "" || *spot <= 0 || *strikesEachSide < 0 || *requestSpacing < 500*time.Millisecond {
		fmt.Fprintln(os.Stderr, "expiry, session and positive spot are required; strikes-each-side must be non-negative and request-spacing at least 500ms")
		os.Exit(2)
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		fail("config load", err)
	}
	loc, err := time.LoadLocation(cfg.Runtime.Timezone)
	if err != nil {
		fail("timezone", err)
	}
	expiry, err := time.ParseInLocation("2006-01-02", *expiryText, loc)
	if err != nil {
		fail("expiry", err)
	}
	session, err := time.ParseInLocation("2006-01-02", *sessionText, loc)
	if err != nil {
		fail("session", err)
	}
	start, err := time.ParseInLocation("2006-01-02 15:04", session.Format("2006-01-02")+" "+cfg.Runtime.TradingStart, loc)
	if err != nil {
		fail("session start", err)
	}
	closeTime, err := time.ParseInLocation("2006-01-02 15:04", session.Format("2006-01-02")+" "+cfg.Runtime.TradingEnd, loc)
	if err != nil {
		fail("session close", err)
	}
	end := closeTime.Add(-time.Minute)

	ctx := context.Background()
	logger := logging.New(cfg.Runtime)
	st, err := store.New(ctx, cfg.Postgres, logger)
	if err != nil {
		fail("postgres", err)
	}
	defer st.Close()
	subs, err := st.ListActiveSubscriptions(ctx)
	if err != nil {
		fail("subscriptions", err)
	}
	targets := selectTargets(subs, *underlying, expiry, *spot, *strikesEachSide)
	if len(targets) == 0 {
		fail("selection", fmt.Errorf("no active exact-contract subscriptions matched %s %s", *underlying, expiry.Format("2006-01-02")))
	}
	provider, err := smartapi.NewTokenProvider(ctx, cfg.SmartAPI, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second)
	if err != nil {
		fail("SmartAPI login", err)
	}

	written := 0
	failed := 0
	for index, sub := range targets {
		if index > 0 {
			time.Sleep(*requestSpacing)
		}
		candles, fetchErr := smartapi.FetchCandles(ctx, cfg.SmartAPI, provider, sub.Exchange, sub.SymbolToken, "ONE_MINUTE", start, end, time.Duration(cfg.Runtime.HTTPTimeoutSeconds)*time.Second, loc)
		if fetchErr != nil {
			failed++
			fmt.Fprintf(os.Stderr, "failed %s: %v\n", sub.TradingSymbol, fetchErr)
			continue
		}
		bars := make([]store.Bar, 0, len(candles))
		for _, candle := range candles {
			minute := util.MinuteStartUTC(candle.Timestamp, loc)
			if minute.Before(start.UTC()) || minute.After(end.UTC()) {
				continue
			}
			bars = append(bars, store.Bar{Ts: minute, Exchange: sub.Exchange, SymbolToken: sub.SymbolToken, Open: candle.Open, High: candle.High, Low: candle.Low, Close: candle.Close, Volume: candle.Volume, Source: "index_option_session_recovery"})
		}
		if len(bars) == 0 {
			failed++
			fmt.Fprintf(os.Stderr, "failed %s: provider returned no in-session candles\n", sub.TradingSymbol)
			continue
		}
		if err := st.UpsertBars(ctx, bars); err != nil {
			failed++
			fmt.Fprintf(os.Stderr, "failed %s write: %v\n", sub.TradingSymbol, err)
			continue
		}
		if err := st.UpsertWatermarks(ctx, bars); err != nil {
			failed++
			fmt.Fprintf(os.Stderr, "failed %s watermark: %v\n", sub.TradingSymbol, err)
			continue
		}
		written += len(bars)
		fmt.Printf("recovered %s bars=%d\n", sub.TradingSymbol, len(bars))
	}
	fmt.Printf("complete contracts=%d failed=%d bars=%d session=%s expiry=%s\n", len(targets), failed, written, session.Format("2006-01-02"), expiry.Format("2006-01-02"))
	if failed > 0 {
		os.Exit(1)
	}
}

func selectTargets(subs []store.Subscription, underlying string, expiry time.Time, spot float64, eachSide int) []store.Subscription {
	byStrike := map[float64][]store.Subscription{}
	for _, sub := range subs {
		// The caller supplies Store.ListActiveSubscriptions(), whose query is
		// already restricted to active rows (the returned model does not scan
		// the redundant Active column).
		if !strings.EqualFold(sub.Kind, "OPTIDX") || !strings.EqualFold(sub.Underlying, underlying) || sub.Expiry == nil || !sameDate(*sub.Expiry, expiry) || sub.Strike == nil {
			continue
		}
		byStrike[*sub.Strike] = append(byStrike[*sub.Strike], sub)
	}
	strikes := make([]float64, 0, len(byStrike))
	for strike := range byStrike {
		strikes = append(strikes, strike)
	}
	sort.Float64s(strikes)
	if len(strikes) == 0 {
		return nil
	}
	atmIndex := 0
	for index := range strikes {
		if abs(strikes[index]-spot) < abs(strikes[atmIndex]-spot) {
			atmIndex = index
		}
	}
	from := max(0, atmIndex-eachSide)
	to := min(len(strikes), atmIndex+eachSide+1)
	var targets []store.Subscription
	for _, strike := range strikes[from:to] {
		targets = append(targets, byStrike[strike]...)
	}
	sort.Slice(targets, func(i, j int) bool {
		if *targets[i].Strike == *targets[j].Strike {
			return targets[i].Right < targets[j].Right
		}
		return *targets[i].Strike < *targets[j].Strike
	})
	return targets
}

func sameDate(left, right time.Time) bool {
	ly, lm, ld := left.Date()
	ry, rm, rd := right.Date()
	return ly == ry && lm == rm && ld == rd
}

func abs(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}

func fail(stage string, err error) {
	fmt.Fprintf(os.Stderr, "%s failed: %v\n", stage, err)
	os.Exit(1)
}
