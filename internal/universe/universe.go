package universe

import (
	"encoding/csv"
	"fmt"
	"os"
	"sort"
	"strings"

	"log/slog"

	"trading-stack/internal/instruments"
	"trading-stack/internal/store"
)

type Resolver struct {
	Instruments    []instruments.Instrument
	EquityExchange string
	IndexTokens    map[string]string
	Logger         *slog.Logger
}

func ParseSymbolsCSV(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open csv: %w", err)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	var symbols []string
	symbolIndex := -1
	if len(rows) > 0 {
		for i, cell := range rows[0] {
			if strings.EqualFold(strings.TrimSpace(cell), "symbol") {
				symbolIndex = i
				break
			}
		}
	}
	startRow := 0
	if symbolIndex >= 0 {
		startRow = 1
	}
	for _, row := range rows[startRow:] {
		if len(row) == 0 {
			continue
		}
		symbol := ""
		if symbolIndex >= 0 && symbolIndex < len(row) {
			symbol = strings.TrimSpace(row[symbolIndex])
		} else {
			for _, cell := range row {
				cell = strings.TrimSpace(cell)
				if cell != "" {
					symbol = cell
					break
				}
			}
		}
		if symbol == "" {
			continue
		}
		symbol = strings.ToUpper(symbol)
		if strings.HasPrefix(symbol, "DUMMY") {
			continue
		}
		if symbol == "SYMBOL" || symbol == "SYMBOLS" {
			continue
		}
		symbols = append(symbols, symbol)
	}
	return symbols, nil
}

func (r *Resolver) ResolveEquities(symbols []string, mode string) ([]store.Subscription, error) {
	if r.EquityExchange == "" {
		return nil, fmt.Errorf("equities exchange not configured")
	}
	instrumentsBySymbol := map[string][]instruments.Instrument{}
	for _, inst := range r.Instruments {
		if strings.EqualFold(inst.Exchange, r.EquityExchange) {
			key := strings.ToUpper(inst.TradingSymbol)
			instrumentsBySymbol[key] = append(instrumentsBySymbol[key], inst)
		}
	}

	subs := make([]store.Subscription, 0, len(symbols))
	for _, symbol := range symbols {
		eqSymbol := symbol + "-EQ"
		candidates := instrumentsBySymbol[strings.ToUpper(eqSymbol)]
		if len(candidates) == 0 {
			candidates = instrumentsBySymbol[strings.ToUpper(symbol)]
		}
		if len(candidates) == 0 {
			candidates = findByName(r.Instruments, r.EquityExchange, symbol)
		}
		if len(candidates) == 0 {
			if r.Logger != nil {
				r.Logger.Warn("equity not resolved", "symbol", symbol)
			}
			continue
		}
		if len(candidates) > 1 {
			sort.Slice(candidates, func(i, j int) bool {
				return candidates[i].TradingSymbol < candidates[j].TradingSymbol
			})
			if r.Logger != nil {
				r.Logger.Warn("multiple equity candidates; choosing first", "symbol", symbol, "selected", candidates[0].TradingSymbol, "count", len(candidates))
			}
		}
		inst := candidates[0]
		underlying := strings.TrimSuffix(inst.TradingSymbol, "-EQ")
		subs = append(subs, store.Subscription{
			Exchange:       inst.Exchange,
			SymbolToken:    inst.SymbolToken,
			Mode:           mode,
			Kind:           "EQUITY",
			TradingSymbol:  inst.TradingSymbol,
			Underlying:     underlying,
			InstrumentType: inst.InstrumentType,
			Priority:       20,
			Active:         true,
		})
	}
	return subs, nil
}

func (r *Resolver) ResolveIndices(indices []string, mode string) ([]store.Subscription, error) {
	subs := []store.Subscription{}
	for _, idx := range indices {
		idxKey := normalizeIndexKey(idx)
		token := ""
		if r.IndexTokens != nil {
			if v, ok := r.IndexTokens[idxKey]; ok {
				token = strings.TrimSpace(v)
			}
		}
		if token == "" && isNumericToken(idx) {
			token = strings.TrimSpace(idx)
		}
		if token != "" {
			inst, ok := findByToken(r.Instruments, r.EquityExchange, token)
			if !ok {
				if r.Logger != nil {
					r.Logger.Warn("index token not resolved", "index", idx, "token", token)
				}
				continue
			}
			subs = append(subs, store.Subscription{
				Exchange:       inst.Exchange,
				SymbolToken:    inst.SymbolToken,
				Mode:           mode,
				Kind:           "INDEX",
				TradingSymbol:  inst.TradingSymbol,
				Underlying:     NormalizeIndexUnderlying(idx),
				InstrumentType: inst.InstrumentType,
				Priority:       10,
				Active:         true,
			})
			continue
		}

		candidates := findIndexCandidates(r.Instruments, r.EquityExchange, idx)
		if len(candidates) == 0 {
			if r.Logger != nil {
				r.Logger.Warn("index not resolved", "index", idx)
			}
			continue
		}
		if len(candidates) > 1 {
			sort.Slice(candidates, func(i, j int) bool {
				return candidates[i].TradingSymbol < candidates[j].TradingSymbol
			})
			if r.Logger != nil {
				r.Logger.Warn("multiple index candidates; choosing first", "index", idx, "selected", candidates[0].TradingSymbol, "count", len(candidates))
			}
		}
		inst := candidates[0]
		subs = append(subs, store.Subscription{
			Exchange:       inst.Exchange,
			SymbolToken:    inst.SymbolToken,
			Mode:           mode,
			Kind:           "INDEX",
			TradingSymbol:  inst.TradingSymbol,
			Underlying:     normalizeIndexKey(idx),
			InstrumentType: inst.InstrumentType,
			Priority:       10,
			Active:         true,
		})
	}
	return subs, nil
}

func findByName(list []instruments.Instrument, exchange, name string) []instruments.Instrument {
	matches := []instruments.Instrument{}
	for _, inst := range list {
		if !strings.EqualFold(inst.Exchange, exchange) {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(inst.Name), name) {
			matches = append(matches, inst)
		}
	}
	return matches
}

func findIndexCandidates(list []instruments.Instrument, exchange, idx string) []instruments.Instrument {
	idxUpper := strings.ToUpper(idx)
	idxNorm := normalizeIndexKey(idx)
	matches := []instruments.Instrument{}
	for _, inst := range list {
		if !strings.EqualFold(inst.Exchange, exchange) {
			continue
		}
		ts := strings.ToUpper(inst.TradingSymbol)
		name := strings.ToUpper(inst.Name)
		tsNorm := normalizeIndexKey(inst.TradingSymbol)
		nameNorm := normalizeIndexKey(inst.Name)
		if strings.Contains(ts, idxUpper) || strings.Contains(name, idxUpper) || strings.Contains(tsNorm, idxNorm) || strings.Contains(nameNorm, idxNorm) {
			matches = append(matches, inst)
		}
	}
	indexMatches := []instruments.Instrument{}
	for _, inst := range matches {
		if isIndexInstrument(inst) {
			indexMatches = append(indexMatches, inst)
		}
	}
	if len(indexMatches) > 0 {
		matches = indexMatches
	}
	sort.SliceStable(matches, func(i, j int) bool {
		scoreI := scoreIndexCandidate(matches[i], idxUpper, idxNorm)
		scoreJ := scoreIndexCandidate(matches[j], idxUpper, idxNorm)
		if scoreI == scoreJ {
			return matches[i].TradingSymbol < matches[j].TradingSymbol
		}
		return scoreI > scoreJ
	})
	return matches
}

func findByToken(list []instruments.Instrument, exchange, token string) (instruments.Instrument, bool) {
	for _, inst := range list {
		if !strings.EqualFold(inst.Exchange, exchange) {
			continue
		}
		if strings.TrimSpace(inst.SymbolToken) == token {
			return inst, true
		}
	}
	return instruments.Instrument{}, false
}

func normalizeIndexKey(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "")
	value = strings.ReplaceAll(value, "-", "")
	value = strings.ReplaceAll(value, "_", "")
	return value
}

func isNumericToken(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range strings.TrimSpace(value) {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func isIndexInstrument(inst instruments.Instrument) bool {
	it := strings.ToUpper(strings.TrimSpace(inst.InstrumentType))
	if it == "" {
		return false
	}
	return strings.Contains(it, "IDX") || strings.Contains(it, "INDEX")
}

func scoreIndexCandidate(inst instruments.Instrument, idxUpper, idxNorm string) int {
	score := 0
	if isIndexInstrument(inst) {
		score += 100
	}
	ts := strings.ToUpper(inst.TradingSymbol)
	name := strings.ToUpper(inst.Name)
	tsNorm := normalizeIndexKey(inst.TradingSymbol)
	nameNorm := normalizeIndexKey(inst.Name)
	if tsNorm == idxNorm {
		score += 90
	}
	if nameNorm == idxNorm {
		score += 80
	}
	if strings.Contains(tsNorm, idxNorm) {
		score += 40
	}
	if strings.Contains(nameNorm, idxNorm) {
		score += 30
	}
	if strings.Contains(ts, idxUpper) {
		score += 10
	}
	if strings.Contains(name, idxUpper) {
		score += 5
	}
	return score
}
