package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type Service struct {
	cfg       config.WatchlistConfig
	alertsCfg config.AlertsConfig
	store     *store.Store
	alerts    *alerts.Client
	logger    *slog.Logger
	loc       *time.Location

	mu          sync.Mutex
	lastRunDate time.Time
	extraRoutes []func(*http.ServeMux)
}

type AlertPayload struct {
	Exchange      string  `json:"exchange"`
	Symbol        string  `json:"symbol"`
	TradingSymbol string  `json:"tradingsymbol"`
	Price         float64 `json:"price"`
	Threshold     float64 `json:"threshold"`
	Direction     string  `json:"direction"`
	TradeDate     string  `json:"trade_date"`
}

func NewService(cfg config.WatchlistConfig, alertsCfg config.AlertsConfig, st *store.Store, logger *slog.Logger, loc *time.Location) *Service {
	return &Service{
		cfg:       cfg,
		alertsCfg: alertsCfg,
		store:     st,
		alerts:    alerts.NewClient(alertsCfg),
		logger:    logger,
		loc:       loc,
	}
}

func (s *Service) Run(ctx context.Context) error {
	if err := s.seedDefaults(ctx); err != nil && s.logger != nil {
		s.logger.Warn("watchlist_seed_defaults_failed", "err", err)
	}
	go s.runScheduler(ctx)
	return s.serve(ctx)
}

func (s *Service) AddRoutes(fn func(*http.ServeMux)) {
	s.extraRoutes = append(s.extraRoutes, fn)
}

func (s *Service) runScheduler(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(s.cfg.CheckIntervalSeconds) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.evaluateAlerts(ctx); err != nil && s.logger != nil {
				s.logger.Warn("watchlist_eval_failed", "err", err)
			}
		}
	}
}

func (s *Service) evaluateAlerts(ctx context.Context) error {
	if !s.cfg.Enable {
		return nil
	}
	now := time.Now().In(s.loc)
	if isWeekend(now) {
		return nil
	}
	start, end, err := alertWindow(now, s.cfg.AlertWindowStart, s.cfg.AlertWindowMinutes, s.loc)
	if err != nil {
		return err
	}
	if now.Before(start) || now.After(end) {
		return nil
	}

	tradeDate := dateOnly(now)
	s.mu.Lock()
	if sameDay(s.lastRunDate, tradeDate) {
		s.mu.Unlock()
		return nil
	}
	s.lastRunDate = tradeDate
	s.mu.Unlock()

	targets, err := s.store.ListWatchlistTargets(ctx, false)
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		return nil
	}
	alertsSent, err := s.store.CountWatchlistAlerts(ctx, tradeDate)
	if err != nil {
		return err
	}
	remaining := s.cfg.MaxAlertsPerDay - alertsSent
	if remaining <= 0 {
		return nil
	}
	maxPerRun := s.cfg.MaxAlertsPerRun
	if maxPerRun > remaining {
		maxPerRun = remaining
	}

	thresholdAge := time.Duration(s.cfg.MaxPriceStalenessSeconds) * time.Second
	sent := 0
	for _, target := range targets {
		if !target.Active || sent >= maxPerRun {
			continue
		}
		if target.LastPrice == nil || target.LastSeen == nil {
			continue
		}
		if thresholdAge > 0 && now.Sub(*target.LastSeen) > thresholdAge {
			continue
		}
		if target.LastAlertDate != nil && sameDay(*target.LastAlertDate, tradeDate) {
			continue
		}
		price := *target.LastPrice
		if !thresholdHit(price, target.Threshold, target.Direction) {
			continue
		}

		title, message := buildAlertMessage(s.alertsCfg.TitlePrefix, s.cfg.AlertTitle, target, price)
		if err := s.alerts.Send(ctx, title, message); err != nil && s.logger != nil {
			s.logger.Warn("watchlist_alert_send_failed", "symbol", target.Symbol, "err", err)
			continue
		}
		payload, _ := json.Marshal(AlertPayload{
			Exchange:      target.Exchange,
			Symbol:        target.Symbol,
			TradingSymbol: target.TradingSymbol,
			Price:         price,
			Threshold:     target.Threshold,
			Direction:     normalizeDirection(target.Direction),
			TradeDate:     tradeDate.Format("2006-01-02"),
		})
		_ = s.store.InsertWatchlistAlertEvent(ctx, store.WatchlistAlertEvent{
			TargetID:  target.ID,
			AlertTS:   now.UTC(),
			TradeDate: tradeDate,
			Price:     &price,
			Message:   message,
			Payload:   payload,
		})
		_ = s.store.UpdateWatchlistAlert(ctx, target.ID, tradeDate, &price)
		sent++
	}
	return nil
}

func (s *Service) seedDefaults(ctx context.Context) error {
	if len(s.cfg.Defaults) == 0 {
		return nil
	}
	for _, def := range s.cfg.Defaults {
		symbol := strings.TrimSpace(def.Symbol)
		if symbol == "" {
			continue
		}
		lookup, err := s.store.ResolveEquityToken(ctx, s.cfg.Exchange, symbol)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("watchlist_seed_resolve_failed", "symbol", symbol, "err", err)
			}
			continue
		}
		target := store.WatchlistTarget{
			Exchange:      lookup.Exchange,
			Symbol:        strings.ToUpper(symbol),
			SymbolToken:   lookup.SymbolToken,
			TradingSymbol: lookup.TradingSymbol,
			DisplayName:   strings.TrimSpace(def.DisplayName),
			Threshold:     def.Threshold,
			Direction:     normalizeDirection(def.Direction),
			Active:        def.Active,
			Notes:         strings.TrimSpace(def.Notes),
		}
		if target.DisplayName == "" {
			target.DisplayName = strings.TrimSpace(lookup.Name)
		}
		if target.Direction == "" {
			target.Direction = "below"
		}
		if _, err := s.store.UpsertWatchlistTarget(ctx, target); err != nil && s.logger != nil {
			s.logger.Warn("watchlist_seed_upsert_failed", "symbol", symbol, "err", err)
		}
	}
	return nil
}

func buildAlertMessage(prefix string, alertTitle string, target store.WatchlistTarget, price float64) (string, string) {
	dir := normalizeDirection(target.Direction)
	title := strings.TrimSpace(alertTitle)
	if title == "" {
		title = fmt.Sprintf("Watchlist: %s", target.Symbol)
	}
	if strings.TrimSpace(prefix) != "" {
		title = fmt.Sprintf("%s %s", strings.TrimSpace(prefix), title)
	}
	message := fmt.Sprintf("%s Target Hit (%.2f %s %.2f, %s)", target.Symbol, price, dir, target.Threshold, target.Exchange)
	return title, message
}

func normalizeDirection(direction string) string {
	switch strings.ToLower(strings.TrimSpace(direction)) {
	case "below", "lt", "<":
		return "below"
	case "above", "gt", ">":
		return "above"
	default:
		return strings.ToLower(strings.TrimSpace(direction))
	}
}

func thresholdHit(price, threshold float64, direction string) bool {
	switch normalizeDirection(direction) {
	case "above":
		return price > threshold
	default:
		return price < threshold
	}
}

func alertWindow(now time.Time, start string, minutes int, loc *time.Location) (time.Time, time.Time, error) {
	if loc == nil {
		loc = time.UTC
	}
	startParsed, err := time.ParseInLocation("15:04", start, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	startTS := time.Date(now.Year(), now.Month(), now.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	endTS := startTS.Add(time.Duration(minutes) * time.Minute)
	return startTS, endTS, nil
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func sameDay(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

func isWeekend(now time.Time) bool {
	switch now.Weekday() {
	case time.Saturday, time.Sunday:
		return true
	default:
		return false
	}
}
