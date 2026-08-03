package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

const defaultIndexName = "NIFTY100"

func buildConstituentsFromSymbols(symbols []string) []universe.Constituent {
	if len(symbols) == 0 {
		return nil
	}
	out := make([]universe.Constituent, 0, len(symbols))
	for _, symbol := range symbols {
		symbol = strings.ToUpper(strings.TrimSpace(symbol))
		if symbol == "" {
			continue
		}
		out = append(out, universe.Constituent{
			Symbol:        symbol,
			Industry:      "Unknown",
			Sector:        "Unknown",
			MacroSector:   "Unknown",
			BasicIndustry: "Unknown",
		})
	}
	return out
}

func syncIndexConstituents(ctx context.Context, cfg *config.Config, st *store.Store, constituents []universe.Constituent, equitySubs []store.Subscription, logger *slog.Logger) error {
	if cfg == nil || st == nil {
		return nil
	}
	if len(constituents) == 0 {
		return nil
	}
	tokenBySymbol := map[string]store.Subscription{}
	for _, sub := range equitySubs {
		symbol := strings.ToUpper(strings.TrimSpace(sub.Underlying))
		if symbol == "" {
			symbol = strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(sub.TradingSymbol)), "-EQ")
		}
		if symbol != "" {
			tokenBySymbol[symbol] = sub
		}
	}

	rows := make([]store.IndexConstituent, 0, len(constituents))
	for _, c := range constituents {
		symbol := strings.ToUpper(strings.TrimSpace(c.Symbol))
		if symbol == "" {
			continue
		}
		sub := tokenBySymbol[symbol]
		meta := map[string]any{
			"company_name": c.CompanyName,
			"isin":         c.ISIN,
			"series":       c.Series,
			"industry":     c.Industry,
		}
		encoded, _ := json.Marshal(meta)
		rows = append(rows, store.IndexConstituent{
			IndexName:     defaultIndexName,
			Exchange:      cfg.Universe.EquitiesExchange,
			Symbol:        symbol,
			SymbolToken:   sub.SymbolToken,
			Weight:        c.Weight,
			MacroSector:   c.MacroSector,
			Sector:        c.Sector,
			Industry:      c.Industry,
			BasicIndustry: c.BasicIndustry,
			Metadata:      encoded,
		})
		if sub.SymbolToken == "" && logger != nil {
			logger.Warn("constituent_token_missing", "symbol", symbol)
		}
	}
	return st.UpsertIndexConstituents(ctx, rows)
}
