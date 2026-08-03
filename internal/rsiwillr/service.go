package rsiwillr

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type Service struct {
	cfg    config.RSIWillRMonitorConfig
	store  *store.Store
	alerts *alerts.Client
	logger *slog.Logger
	loc    *time.Location

	mu          sync.Mutex
	lastEvalTS  time.Time
	lastEvalErr string
}

func NewService(cfg config.RSIWillRMonitorConfig, st *store.Store, logger *slog.Logger, loc *time.Location) *Service {
	return &Service{
		cfg:    cfg,
		store:  st,
		alerts: alerts.NewClient(cfg.Alerts),
		logger: logger,
		loc:    loc,
	}
}

func (s *Service) Run(ctx context.Context) error {
	go s.runScheduler(ctx)
	return s.serve(ctx)
}

func (s *Service) runScheduler(ctx context.Context) {
	interval := time.Duration(s.cfg.EvalIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 60 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.evaluateAndRecord(ctx)
		}
	}
}

func (s *Service) evaluateAndRecord(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.lastEvalTS = time.Now().UTC()
	s.lastEvalErr = ""

	if err := s.evaluateOnce(ctx); err != nil {
		s.lastEvalErr = err.Error()
		if s.logger != nil {
			s.logger.Warn("rsi_willr_eval_failed", "err", err)
		}
	}
}

type minuteBar struct {
	Ts     time.Time
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume int64
}

func (s *Service) evaluateOnce(ctx context.Context) error {
	if !s.cfg.Enable {
		return nil
	}
	if s.store == nil || s.store.Pool == nil {
		return fmt.Errorf("store not initialized")
	}

	nowLocal := time.Now().In(s.loc)
	if s.cfg.AutoRetireDays > 0 {
		cutoff := time.Now().UTC().AddDate(0, 0, -s.cfg.AutoRetireDays)
		if _, err := s.store.RetireExpiredRSIWillRTargets(ctx, cutoff, fmt.Sprintf("expired_%dd", s.cfg.AutoRetireDays)); err != nil {
			return err
		}
	}
	if isWeekend(nowLocal) {
		return nil
	}
	if !withinRunWindow(nowLocal, s.cfg.RunWindowStart, s.cfg.RunWindowEnd, s.loc) {
		return nil
	}

	targets, err := s.store.ListRSIWillRTargets(ctx, true)
	if err != nil {
		return err
	}
	active := make([]store.RSIWillRTarget, 0, len(targets))
	for _, t := range targets {
		if t.Active {
			active = append(active, t)
		}
	}
	if len(active) == 0 {
		return nil
	}

	lookback := time.Duration(s.cfg.LookbackMinutes) * time.Minute
	if lookback <= 0 {
		lookback = 180 * time.Minute
	}
	start := time.Now().UTC().Add(-lookback)
	end := time.Now().UTC().Add(1 * time.Minute)

	barsByToken, err := s.fetchMinuteBars(ctx, active, start, end)
	if err != nil {
		return err
	}

	maxAlerts := s.cfg.Alerts.MaxPerRun
	if maxAlerts < 1 {
		maxAlerts = 5
	}
	sent := 0

	cooldown := time.Duration(s.cfg.AlertCooldownMinutes) * time.Minute
	staleThreshold := time.Duration(s.cfg.MaxBarStalenessSeconds) * time.Second

	for _, t := range active {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if sent >= maxAlerts {
			break
		}

		rows := barsByToken[t.SymbolToken]
		if len(rows) == 0 {
			// Reset condition state if no data.
			_ = s.store.UpdateRSIWillRTargetState(ctx, t.ID, nil, nil, nil, nil, false, false, nil)
			continue
		}

		last := rows[len(rows)-1]
		if staleThreshold > 0 && time.Since(last.Ts) > staleThreshold {
			// Treat stale bars as "not met" to avoid repeating yesterday's oversold state at night.
			_ = s.store.UpdateRSIWillRTargetState(ctx, t.ID, &last.Ts, floatPtr(last.Close), nil, nil, false, false, nil)
			continue
		}

		rsiThresh := s.cfg.RSIThreshold
		if t.RSIThreshold != nil {
			rsiThresh = *t.RSIThreshold
		}
		willrThresh := s.cfg.WillRThreshold
		if t.WillRThreshold != nil {
			willrThresh = *t.WillRThreshold
		}

		rsiVal, willrVal, ok := computeRSIWillR(rows, s.cfg.RSIPeriod, s.cfg.WillRPeriod)
		indicatorMet := t.EnableRSIWillR && ok && rsiVal < rsiThresh && willrVal < willrThresh

		priceDir := strings.TrimSpace(t.PriceDirection)
		if priceDir == "" {
			priceDir = "below"
		}
		priceMet := t.EnablePrice && t.PriceThreshold != nil && *t.PriceThreshold > 0 && thresholdHit(last.Close, *t.PriceThreshold, priceDir)

		conditionMet := indicatorMet || priceMet

		pending := t.PendingAlert
		if !conditionMet {
			// Condition cleared; re-arm for next crossing.
			pending = false
		} else {
			// Alert when condition first becomes true.
			if !t.LastConditionMet {
				pending = true
			}
			// Also allow periodic re-alert while condition stays true once cooldown elapsed.
			if !pending {
				if t.LastAlertTS == nil || cooldown <= 0 || time.Since(*t.LastAlertTS) >= cooldown {
					pending = true
				}
			}
		}

		var lastAlertTS *time.Time
		if pending {
			if t.LastAlertTS == nil || cooldown <= 0 || time.Since(*t.LastAlertTS) >= cooldown {
				title, msg := s.buildAlertMessage(t, last, rsiVal, willrVal, rsiThresh, willrThresh, indicatorMet, priceMet)
				if err := s.alerts.Send(ctx, title, msg); err != nil {
					if s.logger != nil {
						s.logger.Warn("rsi_willr_alert_send_failed", "symbol", t.Symbol, "err", err)
					}
				} else {
					nowUTC := time.Now().UTC()
					lastAlertTS = &nowUTC
					pending = false
					sent++
					if s.logger != nil {
						s.logger.Info("rsi_willr_alert_sent", "symbol", t.Symbol, "target_id", t.ID, "bar_ts", last.Ts.UTC().Format(time.RFC3339))
					}

					payload, _ := json.Marshal(map[string]any{
						"exchange":      t.Exchange,
						"symbol":        t.Symbol,
						"display_name":  t.DisplayName,
						"tradingsymbol": t.TradingSymbol,
						"symbol_token":  t.SymbolToken,
						"bar_ts":        last.Ts.UTC().Format(time.RFC3339),
						"close":         last.Close,
						"condition_met": conditionMet,
						"indicator": map[string]any{
							"enabled":         t.EnableRSIWillR,
							"met":             indicatorMet,
							"rsi":             ternaryAny(ok, rsiVal, nil),
							"willr":           ternaryAny(ok, willrVal, nil),
							"rsi_threshold":   rsiThresh,
							"willr_threshold": willrThresh,
						},
						"price": map[string]any{
							"enabled":   t.EnablePrice,
							"met":       priceMet,
							"direction": priceDir,
							"threshold": t.PriceThreshold,
						},
					})
					_ = s.store.InsertRSIWillRAlertEvent(ctx, store.RSIWillRAlertEvent{
						TargetID:  t.ID,
						AlertTS:   nowUTC,
						TradeDate: dateOnly(nowLocal),
						BarTS:     &last.Ts,
						Close:     floatPtr(last.Close),
						RSI:       floatPtrNaN(rsiVal),
						WillR:     floatPtrNaN(willrVal),
						Message:   msg,
						Payload:   payload,
					})
					if s.cfg.RetireOnHit {
						_ = s.store.RetireRSIWillRTargetOnHit(ctx,
							t.ID,
							&last.Ts,
							floatPtr(last.Close),
							floatPtrNaN(rsiVal),
							floatPtrNaN(willrVal),
							nowUTC,
						)
						continue
					}
				}
			}
		}

		_ = s.store.UpdateRSIWillRTargetState(ctx,
			t.ID,
			&last.Ts,
			floatPtr(last.Close),
			floatPtrNaN(rsiVal),
			floatPtrNaN(willrVal),
			conditionMet,
			pending,
			lastAlertTS,
		)
	}

	return nil
}

func (s *Service) fetchMinuteBars(ctx context.Context, targets []store.RSIWillRTarget, start, end time.Time) (map[string][]minuteBar, error) {
	tokensByExchange := map[string][]string{}
	for _, t := range targets {
		ex := strings.TrimSpace(t.Exchange)
		if ex == "" || strings.TrimSpace(t.SymbolToken) == "" {
			continue
		}
		tokensByExchange[ex] = append(tokensByExchange[ex], strings.TrimSpace(t.SymbolToken))
	}
	if len(tokensByExchange) == 0 {
		return map[string][]minuteBar{}, nil
	}

	query := fmt.Sprintf(`SELECT symbol_token, ts, open, high, low, close, volume
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2) AND ts >= $3 AND ts < $4
ORDER BY symbol_token, ts ASC`, storeTableIdent(s.store.Schema, "bars_1m"))

	out := make(map[string][]minuteBar)
	for exchange, tokens := range tokensByExchange {
		if len(tokens) == 0 {
			continue
		}
		rows, err := s.store.Pool.Query(ctx, query, exchange, tokens, start, end)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var token string
			var bar minuteBar
			if err := rows.Scan(&token, &bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close, &bar.Volume); err != nil {
				rows.Close()
				return nil, err
			}
			out[token] = append(out[token], bar)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

func computeRSIWillR(bars []minuteBar, rsiPeriod, willrPeriod int) (float64, float64, bool) {
	if rsiPeriod < 2 || willrPeriod < 2 || len(bars) == 0 {
		return math.NaN(), math.NaN(), false
	}
	minBars := willrPeriod
	if rsiPeriod+1 > minBars {
		minBars = rsiPeriod + 1
	}
	if len(bars) < minBars {
		return math.NaN(), math.NaN(), false
	}
	closes := make([]float64, len(bars))
	highs := make([]float64, len(bars))
	lows := make([]float64, len(bars))
	for i := range bars {
		closes[i] = bars[i].Close
		highs[i] = bars[i].High
		lows[i] = bars[i].Low
	}
	rsiVals := rsiSeries(closes, rsiPeriod)
	willrVals := willrSeries(highs, lows, closes, willrPeriod)
	rsiVal := rsiVals[len(rsiVals)-1]
	willrVal := willrVals[len(willrVals)-1]
	if math.IsNaN(rsiVal) || math.IsNaN(willrVal) {
		return math.NaN(), math.NaN(), false
	}
	return rsiVal, willrVal, true
}

func (s *Service) buildAlertMessage(t store.RSIWillRTarget, last minuteBar, rsiVal, willrVal float64, rsiThresh, willrThresh float64, indicatorMet bool, priceMet bool) (string, string) {
	prefix := strings.TrimSpace(s.cfg.Alerts.TitlePrefix)
	title := fmt.Sprintf("Alert %s", t.Symbol)
	if prefix != "" {
		title = prefix + " " + title
	}
	ts := last.Ts.In(s.loc).Format("2006-01-02 15:04")
	parts := []string{fmt.Sprintf("%s close=%.2f @ %s", t.Symbol, last.Close, ts)}
	if indicatorMet {
		parts = append(parts, fmt.Sprintf("RSI %.1f<%.1f & W%%R %.1f<%.1f", rsiVal, rsiThresh, willrVal, willrThresh))
	} else if t.EnableRSIWillR && !math.IsNaN(rsiVal) && !math.IsNaN(willrVal) {
		parts = append(parts, fmt.Sprintf("RSI %.1f W%%R %.1f", rsiVal, willrVal))
	}
	if priceMet && t.PriceThreshold != nil {
		dir := strings.ToLower(strings.TrimSpace(t.PriceDirection))
		if dir == "" {
			dir = "below"
		}
		parts = append(parts, fmt.Sprintf("PRICE %s %.2f", dir, *t.PriceThreshold))
	}
	msg := strings.Join(parts, " | ")
	return title, msg
}

func ternaryAny[T any](cond bool, a T, b any) any {
	if cond {
		return a
	}
	return b
}

func thresholdHit(price, threshold float64, direction string) bool {
	switch strings.ToLower(strings.TrimSpace(direction)) {
	case "above", "gt", ">":
		return price > threshold
	default:
		return price < threshold
	}
}

func (s *Service) serve(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/healthz", s.handleHealth)
	mux.HandleFunc("/api/meta", s.handleMeta)
	mux.HandleFunc("/api/evaluate", s.handleEvaluate)
	mux.HandleFunc("/api/targets/", s.handleTargetID)
	mux.HandleFunc("/api/targets", s.handleTargets)
	mux.HandleFunc("/api/alerts", s.handleAlerts)
	mux.HandleFunc("/", s.handleUI)

	server := &http.Server{
		Addr:              s.cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	if s.logger != nil {
		s.logger.Info("rsi_willr_http_listen", "addr", s.cfg.ListenAddr)
	}
	err := server.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func storeTableIdent(schema, table string) string {
	// pgx.Identifier{schema, table}.Sanitize() without importing pgx in this package.
	// Schema/table are internal constants; keep simple quoting.
	schema = strings.ReplaceAll(schema, `"`, `""`)
	table = strings.ReplaceAll(table, `"`, `""`)
	return `"` + schema + `"` + "." + `"` + table + `"`
}

func floatPtr(v float64) *float64 { return &v }

func floatPtrNaN(v float64) *float64 {
	if math.IsNaN(v) {
		return nil
	}
	return &v
}

func isWeekend(t time.Time) bool {
	switch t.Weekday() {
	case time.Saturday, time.Sunday:
		return true
	default:
		return false
	}
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func withinRunWindow(now time.Time, startHHMM, endHHMM string, loc *time.Location) bool {
	if loc == nil {
		loc = time.UTC
	}
	startParsed, err := time.ParseInLocation("15:04", strings.TrimSpace(startHHMM), loc)
	if err != nil {
		return false
	}
	endParsed, err := time.ParseInLocation("15:04", strings.TrimSpace(endHHMM), loc)
	if err != nil {
		return false
	}
	startTS := time.Date(now.Year(), now.Month(), now.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	endTS := time.Date(now.Year(), now.Month(), now.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc)
	return (now.Equal(startTS) || now.After(startTS)) && (now.Equal(endTS) || now.Before(endTS))
}
