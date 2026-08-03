package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/store"
)

type paperSummaryResponse struct {
	Summary paperSummaryDTO `json:"summary"`
}

type paperTradesResponse struct {
	Trades []paperTradeDTO `json:"trades"`
}

type paperPositionsResponse struct {
	Positions any `json:"positions"`
}

type paperSummaryDTO struct {
	TotalRealized   float64            `json:"totalRealized"`
	TotalUnrealized float64            `json:"totalUnrealized"`
	TotalPnL        float64            `json:"totalPnL"`
	OpenPositions   int64              `json:"openPositions"`
	ClosedPositions int64              `json:"closedPositions"`
	TradeCount      int64              `json:"tradeCount"`
	OrderCount      int64              `json:"orderCount"`
	ByStrategy      map[string]float64 `json:"byStrategy"`
}

type paperTradeDTO struct {
	TradeID       string     `json:"tradeId"`
	OrderID       string     `json:"orderId"`
	Ts            time.Time  `json:"ts"`
	Strategy      string     `json:"strategy"`
	Exchange      string     `json:"exchange"`
	SymbolToken   string     `json:"symbolToken"`
	Side          string     `json:"side"`
	Qty           int64      `json:"qty"`
	Price         float64    `json:"price"`
	Fees          float64    `json:"fees"`
	TradingSymbol string     `json:"tradingSymbol"`
	Underlying    string     `json:"underlying"`
	Right         string     `json:"right"`
	Expiry        *time.Time `json:"expiry,omitempty"`
	Strike        float64    `json:"strike"`
	EntryTime     *time.Time `json:"entryTime,omitempty"`
	ExitTime      *time.Time `json:"exitTime,omitempty"`
	HoldMinutes   *float64   `json:"holdMinutes,omitempty"`
	RSI           *float64   `json:"rsi,omitempty"`
	WillR         *float64   `json:"willr,omitempty"`
	Percentile    *float64   `json:"percentile,omitempty"`
	PnL           *float64   `json:"pnl,omitempty"`
	PnLPct        *float64   `json:"pnlPct,omitempty"`
	MaxPnL        *float64   `json:"maxPnl,omitempty"`
	MaxLoss       *float64   `json:"maxLoss,omitempty"`
	CENorm        *float64   `json:"ceNorm,omitempty"`
	PENorm        *float64   `json:"peNorm,omitempty"`
	NormDiff      *float64   `json:"normDiff,omitempty"`
	ExitReason    string     `json:"exitReason,omitempty"`
}

func (s *Service) registerPaperRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/paper", s.handlePaperUI)
	mux.HandleFunc("/paper/equity", s.handlePaperUIEquity)
	mux.HandleFunc("/paper/options", s.handlePaperUIOptions)
	mux.HandleFunc("/api/paper/summary", s.handlePaperSummary)
	mux.HandleFunc("/api/paper/trades", s.handlePaperTrades)
	mux.HandleFunc("/api/paper/positions", s.handlePaperPositions)
	mux.HandleFunc("/api/backtest/summary", s.handleBacktestSummary)
	mux.HandleFunc("/backend/paper/summary", s.handlePaperSummary)
	mux.HandleFunc("/backend/paper/trades", s.handlePaperTrades)
	mux.HandleFunc("/backend/paper/positions", s.handlePaperPositions)
	mux.HandleFunc("/backend/backtest/summary", s.handleBacktestSummary)
}

func (s *Service) handlePaperSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	summary, err := s.store.FetchPaperSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	byStrategy := aggregateStrategySummary(summary.ByStrategy)
	if optionMaxPnL, err := s.fetchOptionMaxPnLByStrategy(r.Context()); err == nil {
		for strategy, value := range optionMaxPnL {
			byStrategy[strategy] = value
		}
	}
	resp := paperSummaryResponse{
		Summary: paperSummaryDTO{
			TotalRealized:   summary.TotalRealized,
			TotalUnrealized: summary.TotalUnrealized,
			TotalPnL:        summary.TotalPnL,
			OpenPositions:   summary.OpenPositions,
			ClosedPositions: summary.ClosedPositions,
			TradeCount:      summary.TradeCount,
			OrderCount:      summary.OrderCount,
			ByStrategy:      byStrategy,
		},
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) fetchOptionMaxPnLByStrategy(ctx context.Context) (map[string]float64, error) {
	trades, err := s.store.ListPaperTrades(ctx, 100000)
	if err != nil {
		return nil, err
	}
	rows := buildOptionTradeRows(trades, 0, math.NaN(), math.NaN(), 0, nil)
	out := map[string]float64{}
	for _, row := range rows {
		if !isOptionStrategy(row.Strategy) {
			continue
		}
		if row.MaxPnL != nil {
			out[row.Strategy] += *row.MaxPnL
			continue
		}
		if _, ok := out[row.Strategy]; !ok {
			out[row.Strategy] = 0
		}
	}
	return out, nil
}

func (s *Service) handlePaperTrades(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	limit := 100
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 {
			limit = v
		}
	}
	kind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("kind")))
	fetchLimit := limit
	if kind == "equity" || kind == "options" {
		fetchLimit = limit * 20
		if fetchLimit < 300 {
			fetchLimit = 300
		}
	}
	minHoldMinutes := 0.0
	if q := r.URL.Query().Get("min_hold_minutes"); q != "" {
		if v, err := strconv.ParseFloat(q, 64); err == nil && v > 0 {
			minHoldMinutes = v
		}
	}
	minProfitPct := math.NaN()
	if q := r.URL.Query().Get("min_profit_pct"); q != "" {
		if v, err := strconv.ParseFloat(q, 64); err == nil {
			minProfitPct = v
		}
	}
	maxProfitPct := math.NaN()
	if q := r.URL.Query().Get("max_profit_pct"); q != "" {
		if v, err := strconv.ParseFloat(q, 64); err == nil {
			maxProfitPct = v
		}
	}
	trades, err := s.store.ListPaperTrades(r.Context(), fetchLimit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if kind == "options" {
		liveByTradeKey := map[string]float64{}
		positions, posErr := s.store.ListPaperPositionsFlat(r.Context())
		if posErr == nil {
			liveByTradeKey = buildLiveOptionPnLByTradeKey(trades, positions)
		}
		out := buildOptionTradeRows(trades, minHoldMinutes, minProfitPct, maxProfitPct, limit, liveByTradeKey)
		writeJSON(w, http.StatusOK, paperTradesResponse{Trades: out})
		return
	}
	out := make([]paperTradeDTO, 0, len(trades))
	for _, t := range trades {
		if kind == "equity" && !isEquityStrategy(t.Strategy) {
			continue
		}
		entryTime, _ := parseRawTime(t.Raw, "entry_time")
		exitTime, _ := parseRawTime(t.Raw, "exit_time")
		rsi, hasRSI := parseRawFloat(t.Raw, "rsi")
		willr, hasWillr := parseRawFloat(t.Raw, "willr")
		percentile, hasPct := parseRawFloat(t.Raw, "percentile")
		pnl, hasPnL := parseRawFloat(t.Raw, "net_profit")
		if !hasPnL {
			pnl, hasPnL = parseRawFloat(t.Raw, "trade_pnl")
		}
		pnlPct, hasPnLPct := parseRawFloat(t.Raw, "net_gain_pct")
		maxPnL, hasMaxPnL := parseRawFloat(t.Raw, "max_pnl")
		maxLoss, hasMaxLoss := parseRawFloat(t.Raw, "max_loss")
		ceNorm, hasCENorm := parseRawFloat(t.Raw, "ce_norm")
		peNorm, hasPENorm := parseRawFloat(t.Raw, "pe_norm")
		normDiff, hasNormDiff := parseRawFloat(t.Raw, "norm_diff")
		exitReason, _ := parseRawString(t.Raw, "exit_reason")
		var hold *float64
		if entryTime != nil && exitTime != nil && !exitTime.Before(*entryTime) {
			v := exitTime.Sub(*entryTime).Minutes()
			hold = &v
		}
		normalizedStrategy := normalizeStrategyDisplayName(t.Strategy)
		if hold != nil && minHoldMinutes > 0 && *hold < minHoldMinutes {
			continue
		}
		if !math.IsNaN(minProfitPct) && (!hasPnLPct || pnlPct < minProfitPct) {
			continue
		}
		if !math.IsNaN(maxProfitPct) && (!hasPnLPct || pnlPct > maxProfitPct) {
			continue
		}
		dto := paperTradeDTO{
			TradeID:       t.TradeID,
			OrderID:       t.OrderID,
			Ts:            t.Ts,
			Strategy:      normalizedStrategy,
			Exchange:      t.Exchange,
			SymbolToken:   t.SymbolToken,
			Side:          t.Side,
			Qty:           t.Qty,
			Price:         t.Price,
			Fees:          t.Fees,
			TradingSymbol: t.TradingSymbol,
			Underlying:    t.Underlying,
			Right:         t.Right,
			Expiry:        t.Expiry,
			Strike:        t.Strike,
			EntryTime:     entryTime,
			ExitTime:      exitTime,
			HoldMinutes:   hold,
		}
		if hasRSI {
			dto.RSI = &rsi
		}
		if hasWillr {
			dto.WillR = &willr
		}
		if hasPct {
			dto.Percentile = &percentile
		}
		if hasPnL {
			dto.PnL = &pnl
		}
		if hasPnLPct {
			dto.PnLPct = &pnlPct
		}
		if hasMaxPnL {
			dto.MaxPnL = &maxPnL
		}
		if hasMaxLoss {
			dto.MaxLoss = &maxLoss
		}
		if hasCENorm {
			dto.CENorm = &ceNorm
		}
		if hasPENorm {
			dto.PENorm = &peNorm
		}
		if hasNormDiff {
			dto.NormDiff = &normDiff
		}
		if strings.TrimSpace(exitReason) != "" {
			dto.ExitReason = strings.TrimSpace(exitReason)
		}
		out = append(out, dto)
		if len(out) >= limit {
			break
		}
	}
	writeJSON(w, http.StatusOK, paperTradesResponse{Trades: out})
}

func (s *Service) handlePaperPositions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	positions, err := s.store.ListPaperPositionsFlat(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, paperPositionsResponse{Positions: positions})
}

func isEquityStrategy(strategy string) bool {
	name := strings.ToLower(strings.TrimSpace(strategy))
	return strings.Contains(name, "equity") || strings.Contains(name, "a02") || strings.Contains(name, "digii4")
}

func isOptionStrategy(strategy string) bool {
	name := strings.ToLower(strings.TrimSpace(strategy))
	return strings.Contains(name, "option") || strings.Contains(name, "nifty")
}

type optionTradeAgg struct {
	dto       paperTradeDTO
	key       string
	entryCash float64
	exitCash  float64
	fees      float64
	pnlSet    bool
	pnlPctSet bool
}

func buildOptionTradeRows(trades []store.PaperTradeView, minHoldMinutes float64, minProfitPct, maxProfitPct float64, limit int, liveByTradeKey map[string]float64) []paperTradeDTO {
	groups := map[string]*optionTradeAgg{}
	keys := make([]string, 0, len(trades))
	nowUTC := time.Now().UTC()
	for _, t := range trades {
		if !isOptionStrategy(t.Strategy) {
			continue
		}
		entryTime, _ := parseRawTime(t.Raw, "entry_time")
		exitTime, _ := parseRawTime(t.Raw, "exit_time")
		if entryTime == nil && strings.EqualFold(strings.TrimSpace(t.Side), "BUY") {
			ts := t.Ts
			entryTime = &ts
		}
		if exitTime == nil && strings.EqualFold(strings.TrimSpace(t.Side), "SELL") {
			ts := t.Ts
			exitTime = &ts
		}
		underlying := strings.ToUpper(strings.TrimSpace(t.Underlying))
		if rawUnderlying, ok := parseRawString(t.Raw, "underlying"); ok && strings.TrimSpace(rawUnderlying) != "" {
			underlying = strings.ToUpper(strings.TrimSpace(rawUnderlying))
		}
		strike := t.Strike
		if rawStrike, ok := parseRawFloat(t.Raw, "strike"); ok && rawStrike > 0 {
			strike = rawStrike
		}

		normalizedStrategy := normalizeStrategyDisplayName(t.Strategy)
		key := optionTradeKey(normalizedStrategy, underlying, strike, entryTime, t.Ts)
		agg, ok := groups[key]
		if !ok {
			displaySymbol := underlying
			if displaySymbol == "" {
				displaySymbol = "NIFTY"
			}
			baseTs := t.Ts
			if entryTime != nil {
				baseTs = *entryTime
			}
			dto := paperTradeDTO{
				TradeID:       t.TradeID,
				OrderID:       t.OrderID,
				Ts:            baseTs,
				Strategy:      normalizedStrategy,
				Exchange:      t.Exchange,
				SymbolToken:   t.SymbolToken,
				Side:          "BUY->SELL",
				Qty:           t.Qty,
				Fees:          0,
				TradingSymbol: displaySymbol,
				Underlying:    underlying,
				Right:         "STRADDLE",
				Expiry:        t.Expiry,
				Strike:        strike,
				EntryTime:     entryTime,
				ExitTime:      exitTime,
			}
			agg = &optionTradeAgg{dto: dto, key: key}
			groups[key] = agg
			keys = append(keys, key)
		}

		if entryTime != nil && (agg.dto.EntryTime == nil || entryTime.Before(*agg.dto.EntryTime)) {
			agg.dto.EntryTime = entryTime
		}
		if exitTime != nil && (agg.dto.ExitTime == nil || exitTime.After(*agg.dto.ExitTime)) {
			agg.dto.ExitTime = exitTime
		}
		if agg.dto.EntryTime != nil {
			agg.dto.Ts = *agg.dto.EntryTime
		}
		if agg.dto.Expiry == nil && t.Expiry != nil {
			agg.dto.Expiry = t.Expiry
		}
		if agg.dto.Strike == 0 && t.Strike > 0 {
			agg.dto.Strike = t.Strike
		}
		if agg.dto.Qty == 0 && t.Qty > 0 {
			agg.dto.Qty = t.Qty
		}

		agg.fees += t.Fees
		agg.dto.Fees = agg.fees
		if strings.EqualFold(strings.TrimSpace(t.Side), "BUY") {
			agg.entryCash += t.Price * float64(t.Qty)
		}
		if strings.EqualFold(strings.TrimSpace(t.Side), "SELL") {
			agg.exitCash += t.Price * float64(t.Qty)
		}

		if rsi, ok := parseRawFloat(t.Raw, "rsi"); ok && agg.dto.RSI == nil {
			agg.dto.RSI = &rsi
		}
		if willr, ok := parseRawFloat(t.Raw, "willr"); ok && agg.dto.WillR == nil {
			agg.dto.WillR = &willr
		}
		if maxPnL, ok := parseRawFloat(t.Raw, "max_pnl"); ok {
			if agg.dto.MaxPnL == nil || maxPnL > *agg.dto.MaxPnL {
				agg.dto.MaxPnL = &maxPnL
			}
		}
		if maxLoss, ok := parseRawFloat(t.Raw, "max_loss"); ok {
			if agg.dto.MaxLoss == nil || maxLoss < *agg.dto.MaxLoss {
				agg.dto.MaxLoss = &maxLoss
			}
		}
		if ceNorm, ok := parseRawFloat(t.Raw, "ce_norm"); ok && agg.dto.CENorm == nil {
			agg.dto.CENorm = &ceNorm
		}
		if peNorm, ok := parseRawFloat(t.Raw, "pe_norm"); ok && agg.dto.PENorm == nil {
			agg.dto.PENorm = &peNorm
		}
		if normDiff, ok := parseRawFloat(t.Raw, "norm_diff"); ok && agg.dto.NormDiff == nil {
			agg.dto.NormDiff = &normDiff
		}
		if pct, ok := parseRawFloat(t.Raw, "net_gain_pct"); ok {
			agg.dto.PnLPct = &pct
			agg.pnlPctSet = true
		}
		if pnl, ok := parseRawFloat(t.Raw, "net_profit"); ok {
			agg.dto.PnL = &pnl
			agg.pnlSet = true
		} else if pnl, ok := parseRawFloat(t.Raw, "trade_pnl"); ok {
			agg.dto.PnL = &pnl
			agg.pnlSet = true
		}
		if reason, ok := parseRawString(t.Raw, "exit_reason"); ok && strings.TrimSpace(reason) != "" {
			agg.dto.ExitReason = strings.TrimSpace(reason)
		}
	}

	out := make([]paperTradeDTO, 0, len(groups))
	for _, key := range keys {
		agg := groups[key]
		if agg == nil {
			continue
		}
		if agg.dto.ExitTime == nil && liveByTradeKey != nil {
			if live, ok := liveByTradeKey[agg.key]; ok {
				pnl := live
				agg.dto.PnL = &pnl
				agg.pnlSet = true
			} else if live, ok := liveByTradeKey["entry:"+optionEntryKey(agg.dto.EntryTime, agg.dto.Ts)]; ok {
				pnl := live
				agg.dto.PnL = &pnl
				agg.pnlSet = true
			}
		}
		if !agg.pnlSet && agg.entryCash > 0 && agg.exitCash > 0 {
			pnl := agg.exitCash - agg.entryCash - agg.fees
			agg.dto.PnL = &pnl
		}
		if agg.dto.EntryTime != nil && agg.dto.ExitTime != nil && !agg.dto.ExitTime.Before(*agg.dto.EntryTime) {
			hold := agg.dto.ExitTime.Sub(*agg.dto.EntryTime).Minutes()
			agg.dto.HoldMinutes = &hold
		} else if agg.dto.EntryTime != nil {
			hold := nowUTC.Sub(*agg.dto.EntryTime).Minutes()
			if hold >= 0 {
				agg.dto.HoldMinutes = &hold
			}
		}

		if agg.dto.HoldMinutes != nil && minHoldMinutes > 0 && *agg.dto.HoldMinutes < minHoldMinutes {
			continue
		}
		if !math.IsNaN(minProfitPct) && (!agg.pnlPctSet || agg.dto.PnLPct == nil || *agg.dto.PnLPct < minProfitPct) {
			continue
		}
		if !math.IsNaN(maxProfitPct) && (!agg.pnlPctSet || agg.dto.PnLPct == nil || *agg.dto.PnLPct > maxProfitPct) {
			continue
		}
		out = append(out, agg.dto)
	}

	sort.SliceStable(out, func(i, j int) bool { return out[i].Ts.After(out[j].Ts) })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func buildLiveOptionPnLByTradeKey(trades []store.PaperTradeView, positions []store.PaperPosition) map[string]float64 {
	if len(positions) == 0 {
		return map[string]float64{}
	}
	type tokenMeta struct {
		underlying string
		strike     float64
	}
	metaByToken := map[string]tokenMeta{}
	for _, t := range trades {
		if !isOptionStrategy(t.Strategy) {
			continue
		}
		tokenKey := strings.ToUpper(strings.TrimSpace(t.Exchange)) + "|" + strings.TrimSpace(t.SymbolToken)
		if tokenKey == "|" {
			continue
		}
		underlying := strings.ToUpper(strings.TrimSpace(t.Underlying))
		if rawUnderlying, ok := parseRawString(t.Raw, "underlying"); ok && strings.TrimSpace(rawUnderlying) != "" {
			underlying = strings.ToUpper(strings.TrimSpace(rawUnderlying))
		}
		strike := t.Strike
		if rawStrike, ok := parseRawFloat(t.Raw, "strike"); ok && rawStrike > 0 {
			strike = rawStrike
		}
		existing, ok := metaByToken[tokenKey]
		if !ok || (strings.TrimSpace(existing.underlying) == "" && strings.TrimSpace(underlying) != "") || (existing.strike <= 0 && strike > 0) {
			metaByToken[tokenKey] = tokenMeta{underlying: underlying, strike: strike}
		}
	}

	out := map[string]float64{}
	for _, pos := range positions {
		if pos.Qty == 0 || !isOptionStrategy(pos.Strategy) {
			continue
		}
		entryTime := pos.UpdatedAt.UTC()
		if pos.EntryTs != nil && !pos.EntryTs.IsZero() {
			entryTime = pos.EntryTs.UTC()
		}
		meta := metaByToken[strings.ToUpper(strings.TrimSpace(pos.Exchange))+"|"+strings.TrimSpace(pos.SymbolToken)]
		normalizedStrategy := normalizeStrategyDisplayName(pos.Strategy)
		tradeKey := optionTradeKey(normalizedStrategy, meta.underlying, meta.strike, &entryTime, entryTime)
		pnl := pos.RealizedPNL + pos.UnrealizedPNL
		out[tradeKey] += pnl
		out["entry:"+optionEntryKey(&entryTime, entryTime)] += pnl
	}
	return out
}

func optionTradeKey(strategy, underlying string, strike float64, entryTime *time.Time, fallback time.Time) string {
	return fmt.Sprintf("%s|%s|%.2f|%s", strings.ToLower(strings.TrimSpace(strategy)), strings.ToUpper(strings.TrimSpace(underlying)), strike, optionEntryKey(entryTime, fallback))
}

func optionEntryKey(entryTime *time.Time, fallback time.Time) string {
	entry := fallback.UTC().Format(time.RFC3339)
	if entryTime != nil {
		entry = entryTime.UTC().Format(time.RFC3339)
	}
	return entry
}

func aggregateStrategySummary(raw map[string]float64) map[string]float64 {
	if len(raw) == 0 {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(raw))
	for strategy, pnl := range raw {
		key := normalizeStrategyDisplayName(strategy)
		out[key] += pnl
	}
	return out
}

func normalizeStrategyDisplayName(strategy string) string {
	name := strings.ToLower(strings.TrimSpace(strategy))
	switch name {
	case "equity_backtesting":
		return "equity_backtesting"
	case "a02_backtest", "equity_backtest":
		return "equity_backtesting"
	case "equity_backtesting_live":
		return "equity_backtesting_live"
	case "a02_backtest_live", "equity_backtest_live":
		return "equity_backtesting_live"
	case "equity_backtesting_daily":
		return "equity_backtesting_daily"
	case "a02_backtest_daily", "equity_backtest_daily":
		return "equity_backtesting_daily"
	default:
		return strings.TrimSpace(strategy)
	}
}

func parseRawFloat(raw []byte, key string) (float64, bool) {
	payload := map[string]any{}
	if len(raw) == 0 || json.Unmarshal(raw, &payload) != nil {
		return 0, false
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return 0, false
	}
	switch v := value.(type) {
	case float64:
		return v, true
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func parseRawString(raw []byte, key string) (string, bool) {
	payload := map[string]any{}
	if len(raw) == 0 || json.Unmarshal(raw, &payload) != nil {
		return "", false
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return "", false
	}
	switch v := value.(type) {
	case string:
		clean := strings.TrimSpace(v)
		if clean == "" {
			return "", false
		}
		return clean, true
	default:
		return "", false
	}
}

func parseRawTime(raw []byte, key string) (*time.Time, bool) {
	payload := map[string]any{}
	if len(raw) == 0 || json.Unmarshal(raw, &payload) != nil {
		return nil, false
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return nil, false
	}
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return nil, false
	}
	if ts, err := time.Parse(time.RFC3339, text); err == nil {
		return &ts, true
	}
	return nil, false
}

func (s *Service) handlePaperUI(w http.ResponseWriter, r *http.Request) {
	s.handlePaperUIKind(w, r, "all")
}

func (s *Service) handlePaperUIEquity(w http.ResponseWriter, r *http.Request) {
	s.handlePaperUIKind(w, r, "equity")
}

func (s *Service) handlePaperUIOptions(w http.ResponseWriter, r *http.Request) {
	s.handlePaperUIKind(w, r, "options")
}

func (s *Service) handlePaperUIKind(w http.ResponseWriter, r *http.Request, kind string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderPaperHTML(time.Now(), kind)))
}

func renderPaperHTML(now time.Time, kind string) string {
	_ = now
	html := `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Practice Account</title>
  <style>
    :root { --black:#000000; --white:#ffffff; --green:#00ff66; --red:#ff0033; --surface:rgba(255,255,255,0.035); --surfaceStrong:rgba(255,255,255,0.06); --line:rgba(255,255,255,0.12); --lineStrong:rgba(255,255,255,0.22); --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.62); --fontSans:Inter,"Segoe UI",sans-serif; --fontMono:"IBM Plex Mono",Consolas,monospace; --glowGreen:0 0 24px rgba(0,255,102,0.18); }
    * { box-sizing: border-box; }
    body { font-family: var(--fontSans); margin: 24px; background: radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%), radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%), linear-gradient(180deg, #050505 0%, var(--black) 100%); color: var(--text); font-variant-numeric: tabular-nums; }
    h1 { margin: 0 0 12px; font-size: 24px; letter-spacing: -0.04em; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025)); border: 1px solid var(--line); border-radius: 18px; padding: 16px; margin-bottom: 16px; box-shadow: 0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04); }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric { background: rgba(255,255,255,0.025); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }
    .metric h3 { margin: 0 0 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fontMono); }
    .metric div { font-size: 18px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fontMono); }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lineStrong); background: var(--surface); font-size: 11px; }
    .neg { color: var(--red); }
    .pos { color: var(--green); }
    .toolbar { display: flex; gap: 10px; align-items: center; margin: 8px 0 12px; flex-wrap: wrap; }
    .toolbar input { background: var(--surface); border: 1px solid var(--line); color: var(--text); padding: 8px 10px; border-radius: 999px; width: 110px; }
    .toolbar button, .toolbar a { min-height: 38px; display: inline-flex; align-items: center; background: var(--surface); border: 1px solid var(--line); color: var(--text); padding: 0 12px; border-radius: 999px; text-decoration: none; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fontMono); }
    .toolbar button:hover, .toolbar a:hover { border-color: rgba(0,255,102,0.42); background: var(--surfaceStrong); box-shadow: var(--glowGreen); }
    .muted { color: var(--muted); font-size: 12px; }
  </style>
</head>
<body>
  <h1>Practice Account</h1>
  <div class="toolbar">
    <a href="/paper">Summary</a>
    <a href="/paper/equity">Equity</a>
    <a href="/paper/options">Options</a>
    <a href="/watcher/manual-options">Manual Option Trades</a>
    <a href="/digii4/manual-trackers">Manual Trackers</a>
    <label>Min Hold (min) <input id="min-hold" type="number" min="0" step="1"></label>
    <label>Min % <input id="min-pct" type="number" step="0.1"></label>
    <label>Max % <input id="max-pct" type="number" step="0.1"></label>
    <button id="apply-filters">Apply</button>
    <span id="refresh-meta" class="muted"></span>
  </div>
  <div class="card">
    <div class="grid" id="summary-grid"></div>
  </div>
  <div class="card">
    <h2 style="font-size: 14px; margin: 0 0 8px;">Recent Trades</h2>
    <table>
      <thead>
        <tr id="trades-head-row"></tr>
      </thead>
      <tbody id="trades-body"></tbody>
    </table>
  </div>

  <script>
    const initialKind = "__KIND__";
    const REFRESH_MS = 5000;
    const istFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    async function fetchJSON(url) {
      const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (!res.ok) throw new Error("Failed: " + res.status);
      return res.json();
    }

    function fmt(v) {
      if (v === null || v === undefined) return "-";
      if (typeof v === "number") return v.toFixed(2);
      return v;
    }

    function fmtIST(v) {
      if (!v) return "-";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "-";
      return istFormatter.format(d) + " IST";
    }

    function setRefreshMeta(text) {
      const d = new Date();
      const base = "Auto refresh " + Math.round(REFRESH_MS / 1000) + "s";
      const stamp = "Last: " + istFormatter.format(d) + " IST";
      document.getElementById("refresh-meta").textContent = text ? (base + " | " + text + " | " + stamp) : (base + " | " + stamp);
    }

    function renderHeaders() {
      const head = document.getElementById("trades-head-row");
      if (initialKind === "options") {
        head.innerHTML =
          "<th>Time</th>" +
          "<th>Strategy</th>" +
          "<th>NIFTY</th>" +
          "<th>Strike</th>" +
          "<th>Entry</th>" +
          "<th>Exit</th>" +
          "<th>Hold</th>" +
          "<th>PnL</th>" +
          "<th>Max PnL</th>" +
          "<th>Max Loss</th>" +
          "<th>RSI</th>" +
          "<th>WILLR</th>" +
          "<th>NormDiff</th>";
        return;
      }
      head.innerHTML =
        "<th>Time</th>" +
        "<th>Strategy</th>" +
        "<th>Symbol</th>" +
        "<th>Right</th>" +
        "<th>Strike</th>" +
        "<th>Expiry</th>" +
        "<th>Entry</th>" +
        "<th>Exit</th>" +
        "<th>Hold</th>" +
        "<th>Side</th>" +
        "<th>Qty</th>" +
        "<th>Price</th>" +
        "<th>RSI</th>" +
        "<th>WILLR</th>" +
        "<th>Percentile</th>" +
        "<th>PnL</th>" +
        "<th>PnL %</th>" +
        "<th>Max PnL</th>" +
        "<th>Fees</th>";
    }

    function addMetric(label, value, klass) {
      const div = document.createElement("div");
      div.className = "metric";
      div.innerHTML = "<h3>" + label + "</h3><div class='" + (klass || "") + "'>" + value + "</div>";
      document.getElementById("summary-grid").appendChild(div);
    }

    async function loadSummary() {
      const grid = document.getElementById("summary-grid");
      grid.innerHTML = "";
      const data = await fetchJSON("/backend/paper/summary");
      const s = data.summary;
      addMetric("Total PnL", fmt(s.totalPnL), s.totalPnL >= 0 ? "pos" : "neg");
      addMetric("Realized", fmt(s.totalRealized), s.totalRealized >= 0 ? "pos" : "neg");
      addMetric("Unrealized", fmt(s.totalUnrealized), s.totalUnrealized >= 0 ? "pos" : "neg");
      addMetric("Open Positions", s.openPositions);
      addMetric("Closed Positions", s.closedPositions);
      addMetric("Trades", s.tradeCount);
      addMetric("Orders", s.orderCount);
      if (s.byStrategy) {
        const keys = Object.keys(s.byStrategy).sort();
        keys.forEach(key => {
          const low = String(key || "").toLowerCase();
          if (initialKind === "options" && !(low.includes("option") || low.includes("nifty"))) return;
          if (initialKind === "equity" && (low.includes("option") || low.includes("nifty"))) return;
          addMetric("Strategy " + key, fmt(s.byStrategy[key]), s.byStrategy[key] >= 0 ? "pos" : "neg");
        });
      }
    }

    async function loadTrades() {
      const params = new URLSearchParams();
      params.set("limit", "300");
      if (initialKind && initialKind !== "all") params.set("kind", initialKind);
      const minHold = document.getElementById("min-hold").value;
      const minPct = document.getElementById("min-pct").value;
      const maxPct = document.getElementById("max-pct").value;
      if (minHold) params.set("min_hold_minutes", minHold);
      if (minPct) params.set("min_profit_pct", minPct);
      if (maxPct) params.set("max_profit_pct", maxPct);
      const data = await fetchJSON("/backend/paper/trades?" + params.toString());
      const tbody = document.getElementById("trades-body");
      tbody.innerHTML = "";
      (data.trades || []).forEach(t => {
        const tr = document.createElement("tr");
        const timeSource = t.entryTime || t.ts;
        const ts = fmtIST(timeSource);
        const entry = t.entryTime ? fmtIST(t.entryTime) : "-";
        const exit = t.exitTime ? fmtIST(t.exitTime) : "-";
        const hold = t.holdMinutes !== undefined && t.holdMinutes !== null ? Number(t.holdMinutes).toFixed(1) : "-";
        if (initialKind === "options") {
          tr.innerHTML =
            "<td>" + ts + "</td>" +
            "<td><span class='tag'>" + (t.strategy || "-") + "</span></td>" +
            "<td>" + (t.underlying || t.tradingSymbol || "-") + "</td>" +
            "<td>" + (t.strike ? Math.round(t.strike) : "-") + "</td>" +
            "<td>" + entry + "</td>" +
            "<td>" + exit + "</td>" +
            "<td>" + hold + "</td>" +
            "<td>" + fmt(t.pnl) + "</td>" +
            "<td>" + fmt(t.maxPnl) + "</td>" +
            "<td>" + fmt(t.maxLoss) + "</td>" +
            "<td>" + fmt(t.rsi) + "</td>" +
            "<td>" + fmt(t.willr) + "</td>" +
            "<td>" + fmt(t.normDiff) + "</td>";
        } else {
          tr.innerHTML =
            "<td>" + ts + "</td>" +
            "<td><span class='tag'>" + (t.strategy || "-") + "</span></td>" +
            "<td>" + (t.tradingSymbol || t.symbolToken) + "</td>" +
            "<td>" + (t.right || "-") + "</td>" +
            "<td>" + (t.strike ? Math.round(t.strike) : "-") + "</td>" +
            "<td>" + (t.expiry ? String(t.expiry).slice(0,10) : "-") + "</td>" +
            "<td>" + entry + "</td>" +
            "<td>" + exit + "</td>" +
            "<td>" + hold + "</td>" +
            "<td>" + t.side + "</td>" +
            "<td>" + t.qty + "</td>" +
            "<td>" + fmt(t.price) + "</td>" +
            "<td>" + fmt(t.rsi) + "</td>" +
            "<td>" + fmt(t.willr) + "</td>" +
            "<td>" + fmt(t.percentile) + "</td>" +
            "<td>" + fmt(t.pnl) + "</td>" +
            "<td>" + fmt(t.pnlPct) + "</td>" +
            "<td>" + fmt(t.maxPnl) + "</td>" +
            "<td>" + fmt(t.fees) + "</td>";
        }
        tbody.appendChild(tr);
      });
    }

    async function refreshAll() {
      await loadSummary();
      await loadTrades();
      setRefreshMeta("");
    }

    renderHeaders();
    refreshAll().catch((err) => setRefreshMeta(err && err.message ? err.message : "refresh failed"));
    setInterval(() => refreshAll().catch((err) => setRefreshMeta(err && err.message ? err.message : "refresh failed")), REFRESH_MS);
    document.getElementById("apply-filters").addEventListener("click", () => refreshAll().catch((err) => setRefreshMeta(err && err.message ? err.message : "refresh failed")));
  </script>
</body>
</html>`
	return strings.ReplaceAll(html, "__KIND__", kind)
}
