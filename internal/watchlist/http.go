package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/store"
)

type watchlistRequest struct {
	Symbol      string  `json:"symbol"`
	DisplayName string  `json:"display_name"`
	Threshold   float64 `json:"threshold"`
	Direction   string  `json:"direction"`
	Active      *bool   `json:"active"`
	Notes       string  `json:"notes"`
}

type watchlistResponse struct {
	Targets []store.WatchlistTarget `json:"targets"`
}

type alertsResponse struct {
	Events []store.WatchlistAlertEvent `json:"events"`
}

func (s *Service) serve(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/healthz", s.handleHealth)
	mux.HandleFunc("/api/watchlist/alerts", s.handleAlerts)
	mux.HandleFunc("/api/watchlist/", s.handleWatchlistID)
	mux.HandleFunc("/api/watchlist", s.handleWatchlist)
	mux.HandleFunc("/api/stock/watchlist/alerts", s.handleAlerts)
	mux.HandleFunc("/api/stock/watchlist/", s.handleWatchlistID)
	mux.HandleFunc("/api/stock/watchlist", s.handleWatchlist)
	mux.HandleFunc("/backend/healthz", s.handleHealth)
	mux.HandleFunc("/backend/watchlist/alerts", s.handleAlerts)
	mux.HandleFunc("/backend/watchlist/", s.handleWatchlistID)
	mux.HandleFunc("/backend/watchlist", s.handleWatchlist)

	s.registerPaperRoutes(mux)
	s.registerWatcherRoutes(mux)
	s.registerDigii4ManualRoutes(mux)

	for _, fn := range s.extraRoutes {
		fn(mux)
	}

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
		s.logger.Info("watchlist_http_listen", "addr", s.cfg.ListenAddr)
	}
	err := server.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Service) handleWatchlist(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		includeInactive := strings.EqualFold(r.URL.Query().Get("all"), "true") || r.URL.Query().Get("all") == "1"
		targets, err := s.store.ListWatchlistTargets(r.Context(), includeInactive)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, watchlistResponse{Targets: targets})
	case http.MethodPost:
		var req watchlistRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		req.Symbol = strings.TrimSpace(req.Symbol)
		if req.Symbol == "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("symbol is required"))
			return
		}
		if req.Threshold <= 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("threshold must be > 0"))
			return
		}
		lookup, err := s.store.ResolveEquityToken(r.Context(), s.cfg.Exchange, req.Symbol)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		active := true
		if req.Active != nil {
			active = *req.Active
		}
		target := store.WatchlistTarget{
			Exchange:      lookup.Exchange,
			Symbol:        strings.ToUpper(req.Symbol),
			SymbolToken:   lookup.SymbolToken,
			TradingSymbol: lookup.TradingSymbol,
			DisplayName:   strings.TrimSpace(req.DisplayName),
			Threshold:     req.Threshold,
			Direction:     normalizeDirection(req.Direction),
			Active:        active,
			Notes:         strings.TrimSpace(req.Notes),
		}
		if target.DisplayName == "" {
			target.DisplayName = strings.TrimSpace(lookup.Name)
		}
		if target.Direction == "" {
			target.Direction = "below"
		}
		id, err := s.store.UpsertWatchlistTarget(r.Context(), target)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		target.ID = id
		writeJSON(w, http.StatusOK, target)
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleWatchlistID(w http.ResponseWriter, r *http.Request) {
	// Support multiple mount points:
	// - /api/watchlist/{id}
	// - /api/stock/watchlist/{id}
	// - /backend/watchlist/{id}
	path := strings.TrimSuffix(strings.TrimSpace(r.URL.Path), "/")
	parts := strings.Split(path, "/")
	idStr := parts[len(parts)-1]
	idStr = strings.TrimSpace(idStr)
	if idStr == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("missing id"))
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid id"))
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req watchlistRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		if strings.TrimSpace(req.Symbol) != "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("symbol updates not supported; delete and re-add"))
			return
		}
		if req.Threshold <= 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("threshold must be > 0"))
			return
		}
		active := true
		if req.Active != nil {
			active = *req.Active
		}
		target := store.WatchlistTarget{
			ID:          id,
			DisplayName: strings.TrimSpace(req.DisplayName),
			Threshold:   req.Threshold,
			Direction:   normalizeDirection(req.Direction),
			Active:      active,
			Notes:       strings.TrimSpace(req.Notes),
		}
		if target.Direction == "" {
			target.Direction = "below"
		}
		if err := s.store.UpdateWatchlistTarget(r.Context(), target); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})
	case http.MethodDelete:
		if err := s.store.DeleteWatchlistTarget(r.Context(), id); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	limit := 50
	if q := strings.TrimSpace(r.URL.Query().Get("limit")); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 {
			limit = v
		}
	}
	events, err := s.store.ListWatchlistAlertEvents(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, alertsResponse{Events: events})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
