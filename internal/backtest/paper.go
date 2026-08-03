package backtest

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"trading-stack/internal/store"
)

func (r *Runner) recordLivePaperTrades(ctx context.Context, signals []A02Trade) error {
	if len(signals) == 0 {
		return nil
	}
	positions, err := r.store.ListPaperPositions(ctx)
	if err != nil {
		return err
	}
	openCount := 0
	for _, pos := range positions {
		if pos.Qty != 0 {
			openCount++
		}
	}
	maxOpen := r.cfg.Paper.MaxOpenPositions
	targetGain := r.cfg.Backtest.TargetGain
	if targetGain <= 0 {
		targetGain = 0.003
	}
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	updates := []store.PaperPosition{}
	for _, sig := range signals {
		if maxOpen > 0 && openCount >= maxOpen {
			break
		}
		key := backtestPaperPositionKey(sig.Exchange, sig.SymbolToken)
		if pos, ok := positions[key]; ok && pos.Qty != 0 {
			continue
		}
		entryPrice := applySlippageBT(sig.EntryClose, "BUY", r.cfg.Paper.SlippageBps)
		if entryPrice <= 0 {
			continue
		}
		qty := int64(math.Floor(r.cfg.Paper.CapitalPerTrade / entryPrice))
		if qty < 1 {
			continue
		}
		entryTs := time.Now().UTC()
		stopLoss := entryPrice * (1 - targetGain)
		takeProfit := entryPrice * (1 + targetGain)
		orderID := newBacktestID("ord")
		tradeID := newBacktestID("trd")
		symbol := strings.TrimSpace(sig.Symbol)
		if symbol == "" {
			symbol = strings.TrimSpace(sig.TradingSymbol)
		}
		raw := mustJSONA02Paper(map[string]any{
			"source":       "equity_backtesting_live",
			"symbol":       symbol,
			"entry_time":   sig.EntryTime,
			"rsi":          sig.RSI,
			"willr":        sig.WillR,
			"percentile":   sig.Percentile,
			"target_price": sig.TargetPrice,
			"stop_loss":    stopLoss,
			"take_profit":  takeProfit,
		})
		orders = append(orders, store.PaperOrder{
			OrderID:     orderID,
			CreatedAt:   entryTs,
			Strategy:    "equity_backtesting_live",
			Exchange:    sig.Exchange,
			SymbolToken: sig.SymbolToken,
			Side:        "BUY",
			Qty:         qty,
			OrderType:   "MARKET",
			Price:       entryPrice,
			Status:      "FILLED",
			FilledQty:   qty,
			FilledPrice: entryPrice,
			Raw:         raw,
		})
		trades = append(trades, store.PaperTrade{
			TradeID:     tradeID,
			OrderID:     orderID,
			Ts:          entryTs,
			Strategy:    "equity_backtesting_live",
			Exchange:    sig.Exchange,
			SymbolToken: sig.SymbolToken,
			Side:        "BUY",
			Qty:         qty,
			Price:       entryPrice,
			Fees:        r.cfg.Paper.BrokeragePerTrade,
			Raw:         raw,
		})
		updates = append(updates, store.PaperPosition{
			Exchange:      sig.Exchange,
			SymbolToken:   sig.SymbolToken,
			Strategy:      "equity_backtesting_live",
			Side:          "BUY",
			Qty:           qty,
			AvgPrice:      entryPrice,
			EntryPrice:    &entryPrice,
			EntryTs:       &entryTs,
			StopLoss:      &stopLoss,
			TakeProfit:    &takeProfit,
			RealizedPNL:   -r.cfg.Paper.BrokeragePerTrade,
			UnrealizedPNL: 0,
			UpdatedAt:     entryTs,
		})
		openCount++
	}
	if len(orders) == 0 {
		return nil
	}
	return r.store.RecordPaperBatch(ctx, orders, trades, updates)
}

func (r *Runner) recordDailyPaperTrades(ctx context.Context, results []A02Trade) error {
	if len(results) == 0 {
		return nil
	}
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	updates := []store.PaperPosition{}
	for _, sig := range results {
		entryPrice := applySlippageBT(sig.EntryClose, "BUY", r.cfg.Paper.SlippageBps)
		exitPrice := applySlippageBT(sig.ExitClose, "SELL", r.cfg.Paper.SlippageBps)
		if entryPrice <= 0 || exitPrice <= 0 {
			continue
		}
		qty := int64(math.Floor(r.cfg.Paper.CapitalPerTrade / entryPrice))
		if qty < 1 {
			qty = int64(sig.Quantity)
		}
		if qty < 1 {
			continue
		}
		entryTs := sig.EntryTime.UTC()
		exitTs := sig.ExitTime.UTC()
		if exitTs.Before(entryTs) {
			exitTs = entryTs
		}
		stopLoss := entryPrice * (1 - r.cfg.Backtest.TargetGain)
		takeProfit := entryPrice * (1 + r.cfg.Backtest.TargetGain)
		entryOrderID := deterministicBacktestID("ord",
			"equity_backtesting_daily", sig.Exchange, sig.SymbolToken, "BUY",
			entryTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", entryPrice), fmt.Sprintf("%d", qty),
		)
		entryTradeID := deterministicBacktestID("trd",
			"equity_backtesting_daily", sig.Exchange, sig.SymbolToken, "BUY",
			entryTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", entryPrice), fmt.Sprintf("%d", qty),
		)
		exitOrderID := deterministicBacktestID("ord",
			"equity_backtesting_daily", sig.Exchange, sig.SymbolToken, "SELL",
			exitTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", exitPrice), fmt.Sprintf("%d", qty),
		)
		exitTradeID := deterministicBacktestID("trd",
			"equity_backtesting_daily", sig.Exchange, sig.SymbolToken, "SELL",
			exitTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", exitPrice), fmt.Sprintf("%d", qty),
		)
		raw := mustJSONA02Paper(map[string]any{
			"source":       "equity_backtesting_daily",
			"symbol":       sig.Symbol,
			"entry_time":   sig.EntryTime.UTC(),
			"exit_time":    sig.ExitTime.UTC(),
			"trade_date":   sig.EntryTime.In(r.loc).Format("2006-01-02"),
			"rsi":          sig.RSI,
			"willr":        sig.WillR,
			"percentile":   sig.Percentile,
			"net_profit":   sig.NetProfit,
			"net_gain_pct": sig.NetGainPct,
			"entry_price":  sig.EntryClose,
			"exit_price":   sig.ExitClose,
			"target_price": sig.TargetPrice,
		})
		orders = append(orders,
			store.PaperOrder{
				OrderID:     entryOrderID,
				CreatedAt:   entryTs,
				Strategy:    "equity_backtesting_daily",
				Exchange:    sig.Exchange,
				SymbolToken: sig.SymbolToken,
				Side:        "BUY",
				Qty:         qty,
				OrderType:   "MARKET",
				Price:       entryPrice,
				Status:      "FILLED",
				FilledQty:   qty,
				FilledPrice: entryPrice,
				Raw:         raw,
			},
			store.PaperOrder{
				OrderID:     exitOrderID,
				CreatedAt:   exitTs,
				Strategy:    "equity_backtesting_daily",
				Exchange:    sig.Exchange,
				SymbolToken: sig.SymbolToken,
				Side:        "SELL",
				Qty:         qty,
				OrderType:   "MARKET",
				Price:       exitPrice,
				Status:      "FILLED",
				FilledQty:   qty,
				FilledPrice: exitPrice,
				Raw:         raw,
			},
		)
		trades = append(trades,
			store.PaperTrade{
				TradeID:     entryTradeID,
				OrderID:     entryOrderID,
				Ts:          entryTs,
				Strategy:    "equity_backtesting_daily",
				Exchange:    sig.Exchange,
				SymbolToken: sig.SymbolToken,
				Side:        "BUY",
				Qty:         qty,
				Price:       entryPrice,
				Fees:        r.cfg.Paper.BrokeragePerTrade,
				Raw:         raw,
			},
			store.PaperTrade{
				TradeID:     exitTradeID,
				OrderID:     exitOrderID,
				Ts:          exitTs,
				Strategy:    "equity_backtesting_daily",
				Exchange:    sig.Exchange,
				SymbolToken: sig.SymbolToken,
				Side:        "SELL",
				Qty:         qty,
				Price:       exitPrice,
				Fees:        r.cfg.Paper.BrokeragePerTrade,
				Raw:         raw,
			},
		)
		realized := (exitPrice-entryPrice)*float64(qty) - (2 * r.cfg.Paper.BrokeragePerTrade)
		updates = append(updates, store.PaperPosition{
			Exchange:      sig.Exchange,
			SymbolToken:   sig.SymbolToken,
			Strategy:      "equity_backtesting_daily",
			Side:          "BUY",
			Qty:           0,
			AvgPrice:      entryPrice,
			EntryPrice:    &entryPrice,
			EntryTs:       &entryTs,
			StopLoss:      &stopLoss,
			TakeProfit:    &takeProfit,
			RealizedPNL:   realized,
			UnrealizedPNL: 0,
			UpdatedAt:     exitTs,
		})
	}
	if len(orders) == 0 {
		return nil
	}
	return r.store.RecordPaperBatch(ctx, orders, trades, updates)
}

func (r *Runner) recordOptionBacktestPaperTrades(ctx context.Context, optionTrades []OptionBTTrade) error {
	if len(optionTrades) == 0 {
		return nil
	}
	positions, err := r.store.ListPaperPositions(ctx)
	if err != nil {
		return err
	}
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	updates := []store.PaperPosition{}

	for _, bt := range optionTrades {
		strategyName := "option_backtest_" + strings.TrimSpace(bt.Strategy)
		if strategyName == "option_backtest_" {
			strategyName = "option_backtest"
		}
		legs := []struct {
			exchange string
			token    string
			entry    float64
			exit     float64
			symbol   string
		}{
			{exchange: bt.CEExchange, token: bt.CEToken, entry: bt.CEEntry, exit: bt.CEExit, symbol: bt.CESymbol},
			{exchange: bt.PEExchange, token: bt.PEToken, entry: bt.PEEntry, exit: bt.PEExit, symbol: bt.PESymbol},
		}
		for _, leg := range legs {
			if strings.TrimSpace(leg.exchange) == "" || strings.TrimSpace(leg.token) == "" || leg.entry <= 0 || leg.exit <= 0 || bt.Qty <= 0 {
				continue
			}
			key := backtestPaperPositionKey(leg.exchange, leg.token)
			if existing, ok := positions[key]; ok && existing.Qty != 0 {
				continue
			}

			entryPx := applySlippageBT(leg.entry, "BUY", r.cfg.Paper.SlippageBps)
			exitPx := applySlippageBT(leg.exit, "SELL", r.cfg.Paper.SlippageBps)
			entryTs := bt.EntryTime.UTC()
			exitTs := bt.ExitTime.UTC()

			entryOrderID := deterministicBacktestID("ord",
				strategyName, leg.exchange, leg.token, "BUY",
				entryTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", entryPx), fmt.Sprintf("%d", bt.Qty),
			)
			entryTradeID := deterministicBacktestID("trd",
				strategyName, leg.exchange, leg.token, "BUY",
				entryTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", entryPx), fmt.Sprintf("%d", bt.Qty),
			)
			exitOrderID := deterministicBacktestID("ord",
				strategyName, leg.exchange, leg.token, "SELL",
				exitTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", exitPx), fmt.Sprintf("%d", bt.Qty),
			)
			exitTradeID := deterministicBacktestID("trd",
				strategyName, leg.exchange, leg.token, "SELL",
				exitTs.UTC().Format(time.RFC3339Nano), fmt.Sprintf("%.6f", exitPx), fmt.Sprintf("%d", bt.Qty),
			)
			raw := mustJSONA02Paper(map[string]any{
				"source":       "option_backtest_daily",
				"strategy":     bt.Strategy,
				"underlying":   bt.Underlying,
				"trigger":      bt.Trigger,
				"symbol":       leg.symbol,
				"entry_time":   bt.EntryTime.UTC(),
				"exit_time":    bt.ExitTime.UTC(),
				"max_pnl":      bt.MaxPnL,
				"max_pnl_time": bt.MaxPnLTime.UTC(),
				"rsi":          bt.RSI,
				"willr":        bt.WillR,
				"norm_diff":    bt.NormDiff,
				"entry_combo":  bt.EntryCombo,
				"exit_combo":   bt.ExitCombo,
				"trade_pnl":    bt.PnL,
				"exit_reason":  bt.ExitReason,
			})
			orders = append(orders,
				store.PaperOrder{
					OrderID:     entryOrderID,
					CreatedAt:   entryTs,
					Strategy:    strategyName,
					Exchange:    leg.exchange,
					SymbolToken: leg.token,
					Side:        "BUY",
					Qty:         bt.Qty,
					OrderType:   "MARKET",
					Price:       entryPx,
					Status:      "FILLED",
					FilledQty:   bt.Qty,
					FilledPrice: entryPx,
					Raw:         raw,
				},
				store.PaperOrder{
					OrderID:     exitOrderID,
					CreatedAt:   exitTs,
					Strategy:    strategyName,
					Exchange:    leg.exchange,
					SymbolToken: leg.token,
					Side:        "SELL",
					Qty:         bt.Qty,
					OrderType:   "MARKET",
					Price:       exitPx,
					Status:      "FILLED",
					FilledQty:   bt.Qty,
					FilledPrice: exitPx,
					Raw:         raw,
				},
			)
			trades = append(trades,
				store.PaperTrade{
					TradeID:     entryTradeID,
					OrderID:     entryOrderID,
					Ts:          entryTs,
					Strategy:    strategyName,
					Exchange:    leg.exchange,
					SymbolToken: leg.token,
					Side:        "BUY",
					Qty:         bt.Qty,
					Price:       entryPx,
					Fees:        r.cfg.Paper.BrokeragePerTrade,
					Raw:         raw,
				},
				store.PaperTrade{
					TradeID:     exitTradeID,
					OrderID:     exitOrderID,
					Ts:          exitTs,
					Strategy:    strategyName,
					Exchange:    leg.exchange,
					SymbolToken: leg.token,
					Side:        "SELL",
					Qty:         bt.Qty,
					Price:       exitPx,
					Fees:        r.cfg.Paper.BrokeragePerTrade,
					Raw:         raw,
				},
			)
			realized := (exitPx-entryPx)*float64(bt.Qty) - (2 * r.cfg.Paper.BrokeragePerTrade)
			if existing, ok := positions[key]; ok {
				realized += existing.RealizedPNL
			}
			updates = append(updates, store.PaperPosition{
				Exchange:      leg.exchange,
				SymbolToken:   leg.token,
				Strategy:      strategyName,
				Side:          "BUY",
				Qty:           0,
				AvgPrice:      entryPx,
				EntryPrice:    &entryPx,
				EntryTs:       &entryTs,
				RealizedPNL:   realized,
				UnrealizedPNL: 0,
				UpdatedAt:     exitTs,
			})
			positions[key] = store.PaperPosition{
				Exchange:    leg.exchange,
				SymbolToken: leg.token,
				Strategy:    strategyName,
				Qty:         0,
				AvgPrice:    entryPx,
				RealizedPNL: realized,
			}
		}
	}
	if len(orders) == 0 {
		return nil
	}
	return r.store.RecordPaperBatch(ctx, orders, trades, updates)
}

func backtestPaperPositionKey(exchange, token string) string {
	return strings.ToUpper(strings.TrimSpace(exchange)) + ":" + strings.TrimSpace(token)
}

func mustJSONA02Paper(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}

func newBacktestID(prefix string) string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return prefix + "-" + time.Now().UTC().Format("20060102T150405.000000000")
	}
	return prefix + "-" + hex.EncodeToString(b)
}

func deterministicBacktestID(prefix string, parts ...string) string {
	h := sha1.New()
	for _, part := range parts {
		_, _ = h.Write([]byte(strings.TrimSpace(part)))
		_, _ = h.Write([]byte{0})
	}
	sum := hex.EncodeToString(h.Sum(nil))
	if len(sum) > 16 {
		sum = sum[:16]
	}
	return prefix + "-" + sum
}
