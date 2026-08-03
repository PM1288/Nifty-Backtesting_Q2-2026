package parameters

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type Service struct {
	cfg    *config.Config
	store  *store.Store
	logger *slog.Logger
}

func NewService(cfg *config.Config, st *store.Store, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		cfg:    cfg,
		store:  st,
		logger: logger,
	}
}

func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	for _, prefix := range []string{"/api/strategy", "/backend/strategy"} {
		mux.HandleFunc(prefix+"/params/history", s.handleHistory)
		mux.HandleFunc(prefix+"/params/", s.handleParamByName)
		mux.HandleFunc(prefix+"/params", s.handleParams)
	}
}

type paramItem struct {
	Name        string   `json:"name"`
	Label       string   `json:"label"`
	Kind        string   `json:"kind"`
	Value       any      `json:"value"`
	Default     any      `json:"default"`
	Min         *float64 `json:"min,omitempty"`
	Max         *float64 `json:"max,omitempty"`
	Step        *float64 `json:"step,omitempty"`
	Description string   `json:"description,omitempty"`
	UpdatedAt   *string  `json:"updated_at,omitempty"`
	UpdatedBy   *string  `json:"updated_by,omitempty"`
}

type paramsResponse struct {
	Scope  string      `json:"scope"`
	Params []paramItem `json:"params"`
}

type historyResponse struct {
	Scope   string                           `json:"scope"`
	History []store.StrategyParameterHistory `json:"history"`
}

type paramUpdateRequest struct {
	Name      string          `json:"name"`
	Value     json.RawMessage `json:"value"`
	UpdatedBy string          `json:"updated_by"`
}

func (s *Service) handleParams(w http.ResponseWriter, r *http.Request) {
	scope, defs, err := s.resolveScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	switch r.Method {
	case http.MethodGet:
		if err := EnsureScope(r.Context(), s.store, scope, defs, "bootstrap"); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		params, err := s.store.ListStrategyParameters(r.Context(), scope)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		items := buildParamItems(defs, params)
		writeJSON(w, http.StatusOK, paramsResponse{Scope: scope, Params: items})
	case http.MethodPost:
		var req paramUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("name is required"))
			return
		}
		def, ok := findDefinition(defs, req.Name)
		if !ok {
			writeError(w, http.StatusBadRequest, fmt.Errorf("unknown parameter %s", req.Name))
			return
		}
		value, err := NormalizeValue(def, req.Value)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		updatedBy := strings.TrimSpace(req.UpdatedBy)
		if updatedBy == "" {
			updatedBy = "grafana"
		}
		if err := s.store.UpsertStrategyParameter(r.Context(), store.StrategyParameter{
			Scope:     scope,
			Name:      def.Name,
			Value:     value,
			UpdatedBy: &updatedBy,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"updated": def.Name})
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleParamByName(w http.ResponseWriter, r *http.Request) {
	scope, defs, err := s.resolveScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	path := strings.TrimSuffix(r.URL.Path, "/")
	parts := strings.Split(path, "/")
	name := parts[len(parts)-1]
	name = strings.TrimSpace(name)
	if name == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("missing parameter name"))
		return
	}
	def, ok := findDefinition(defs, name)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Errorf("unknown parameter %s", name))
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req paramUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		value, err := NormalizeValue(def, req.Value)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		updatedBy := strings.TrimSpace(req.UpdatedBy)
		if updatedBy == "" {
			updatedBy = "grafana"
		}
		if err := s.store.UpsertStrategyParameter(r.Context(), store.StrategyParameter{
			Scope:     scope,
			Name:      def.Name,
			Value:     value,
			UpdatedBy: &updatedBy,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"updated": def.Name})
	case http.MethodDelete:
		value, _ := json.Marshal(def.Default)
		updatedBy := "reset"
		if err := s.store.UpsertStrategyParameter(r.Context(), store.StrategyParameter{
			Scope:     scope,
			Name:      def.Name,
			Value:     value,
			UpdatedBy: &updatedBy,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"reset": def.Name})
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	scope, _, err := s.resolveScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	history, err := s.store.ListStrategyParameterHistory(r.Context(), scope, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, historyResponse{Scope: scope, History: history})
}

func (s *Service) resolveScope(r *http.Request) (string, []Definition, error) {
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	if scope == "" {
		scope = ScopeBacktestA02
	}
	defs, ok := DefinitionsForScope(s.cfg, scope)
	if !ok {
		return "", nil, fmt.Errorf("unknown scope %s", scope)
	}
	return scope, defs, nil
}

func buildParamItems(defs []Definition, params map[string]store.StrategyParameter) []paramItem {
	items := make([]paramItem, 0, len(defs))
	for _, def := range defs {
		item := paramItem{
			Name:        def.Name,
			Label:       def.Label,
			Kind:        string(def.Kind),
			Default:     def.Default,
			Min:         def.Min,
			Max:         def.Max,
			Step:        def.Step,
			Description: def.Description,
		}
		if param, ok := params[def.Name]; ok {
			if v, err := ParseValue(def, param.Value); err == nil {
				item.Value = v
			} else {
				item.Value = def.Default
			}
			ts := param.UpdatedAt.Format(time.RFC3339)
			item.UpdatedAt = &ts
			item.UpdatedBy = param.UpdatedBy
		} else {
			item.Value = def.Default
		}
		items = append(items, item)
	}
	return items
}

func findDefinition(defs []Definition, name string) (Definition, bool) {
	for _, def := range defs {
		if strings.EqualFold(def.Name, name) {
			return def, true
		}
	}
	return Definition{}, false
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
