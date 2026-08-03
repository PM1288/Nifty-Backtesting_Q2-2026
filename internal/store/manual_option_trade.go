package store

import (
	"strings"
	"time"
)

const ManualOptionStatePrefix = "nifty_watcher_manual:"

type ManualOptionTradeState struct {
	ID            string     `json:"id"`
	Name          string     `json:"name,omitempty"`
	Status        string     `json:"status"`
	Error         string     `json:"error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	RequestedAt   time.Time  `json:"requested_at"`
	OpenedAt      *time.Time `json:"opened_at,omitempty"`
	ClosedAt      *time.Time `json:"closed_at,omitempty"`
	CloseReason   string     `json:"close_reason,omitempty"`
	CloseRequested bool      `json:"close_requested,omitempty"`

	Strategy     string     `json:"strategy,omitempty"`
	RunID        int64      `json:"run_id,omitempty"`
	Underlying   string     `json:"underlying"`
	IndexToken   string     `json:"index_token,omitempty"`
	Expiry       *time.Time `json:"expiry,omitempty"`
	Strike       float64    `json:"strike,omitempty"`
	Lots         int        `json:"lots"`
	LotSize      int        `json:"lot_size"`
	Qty          int64      `json:"qty"`
	TargetRupees float64    `json:"target_rupees"`

	CEExchange string `json:"ce_exchange,omitempty"`
	PEExchange string `json:"pe_exchange,omitempty"`
	CEToken    string `json:"ce_token,omitempty"`
	PEToken    string `json:"pe_token,omitempty"`
	CESymbol   string `json:"ce_symbol,omitempty"`
	PESymbol   string `json:"pe_symbol,omitempty"`

	NiftyPrice  float64  `json:"nifty_price,omitempty"`
	RSI         *float64 `json:"rsi,omitempty"`
	WILLR       *float64 `json:"willr,omitempty"`
	CENorm      *float64 `json:"ce_norm,omitempty"`
	PENorm      *float64 `json:"pe_norm,omitempty"`
	NormDiff    *float64 `json:"norm_diff,omitempty"`
	EntryCE      float64  `json:"entry_ce"`
	EntryPE      float64  `json:"entry_pe"`
	EntryCombo   float64  `json:"entry_combo"`
	CurrentCE    float64  `json:"current_ce"`
	CurrentPE    float64  `json:"current_pe"`
	CurrentCombo float64  `json:"current_combo"`
	PnL          float64  `json:"pnl"`
	MaxPnL       float64  `json:"max_pnl"`
	MaxLoss      float64  `json:"max_loss"`
	MaxPnLTs    *time.Time `json:"max_pnl_ts,omitempty"`
	MaxLossTs   *time.Time `json:"max_loss_ts,omitempty"`
}

func ManualOptionStateName(id string) string {
	return ManualOptionStatePrefix + strings.TrimSpace(id)
}
