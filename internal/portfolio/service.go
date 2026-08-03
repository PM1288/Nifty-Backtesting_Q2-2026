package portfolio

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/store"
)

type Service struct {
	store           *store.Store
	logger          *slog.Logger
	defaultExchange string
}

func NewService(st *store.Store, logger *slog.Logger, defaultExchange string) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		store:           st,
		logger:          logger,
		defaultExchange: defaultExchange,
	}
}

func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	for _, prefix := range []string{"/api/portfolio", "/backend/portfolio"} {
		mux.HandleFunc(prefix+"/positions", s.handlePositions)
		mux.HandleFunc(prefix+"/positions/", s.handlePositionID)
	}
}

type createRequest struct {
	Symbol      string  `json:"symbol"`
	Exchange    string  `json:"exchange"`
	Quantity    float64 `json:"quantity"`
	EntryPrice  float64 `json:"entry_price"`
	EntryTime   *string `json:"entry_time,omitempty"`
	Notes       string  `json:"notes,omitempty"`
	SymbolToken string  `json:"symbol_token,omitempty"` // optional, prefer symbol resolve
}

type closeRequest struct {
	ExitPrice float64 `json:"exit_price"`
	ExitTime  *string `json:"exit_time,omitempty"`
	Notes     string  `json:"notes,omitempty"`
}

type listResponse struct {
	Positions []store.PortfolioPosition `json:"positions"`
}

func (s *Service) handlePositions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		positions, err := s.store.ListPortfolioPositions(r.Context(), status)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, listResponse{Positions: positions})
	case http.MethodPost:
		var req createRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid payload: %w", err))
			return
		}
		if req.Symbol == "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("symbol is required"))
			return
		}
		if req.Exchange == "" {
			req.Exchange = s.defaultExchange
		}
		if req.Quantity == 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("quantity is required"))
			return
		}
		if req.EntryPrice == 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("entry_price is required"))
			return
		}
		inst, err := s.store.ResolveEquityToken(r.Context(), req.Exchange, req.Symbol)
		if err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("resolve token: %w", err))
			return
		}
		var entryTS time.Time
		if req.EntryTime != nil && strings.TrimSpace(*req.EntryTime) != "" {
			if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.EntryTime)); err == nil {
				entryTS = t
			}
		}
		pos, err := s.store.AddPortfolioPosition(r.Context(), req.Symbol, inst, req.Quantity, req.EntryPrice, entryTS, req.Notes)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": pos.ID})
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handlePositionID(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
	if len(parts) < 1 {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid path"))
		return
	}
	var idPart string
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] != "" {
			idPart = parts[i]
			break
		}
	}
	if idPart == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("missing id"))
		return
	}
	// handle /close suffix
	isClose := false
	if idPart == "close" && len(parts) >= 2 {
		idPart = parts[len(parts)-2]
		isClose = true
	}
	id, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid id"))
		return
	}
	if !isClose {
		if strings.HasSuffix(path, "/close") {
			isClose = true
		}
	}
	if isClose {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
			return
		}
		var req closeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid payload: %w", err))
			return
		}
		if req.ExitPrice == 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("exit_price is required"))
			return
		}
		var exitTS time.Time
		if req.ExitTime != nil && strings.TrimSpace(*req.ExitTime) != "" {
			if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.ExitTime)); err == nil {
				exitTS = t
			}
		}
		if err := s.store.ClosePortfolioPosition(r.Context(), id, req.ExitPrice, exitTS, req.Notes); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"closed": id})
		return
	}

	if r.Method == http.MethodDelete {
		if err := s.store.ClosePortfolioPosition(r.Context(), id, 0, time.Time{}, "deleted"); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
		return
	}
	writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
